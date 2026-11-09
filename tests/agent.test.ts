import test from "node:test";
import assert from "node:assert/strict";
import { DraftGenerationError, prepareDraft, type DraftEvidence, type DraftModelCall, type DraftModelRunner } from "../src/lib/agent";
import { getMetrics, getQueue, validateDraft } from "../src/lib/domain";
import { applicationWordCount, validateApplication } from "../src/lib/programs";
import { createSeed } from "../src/lib/seed";
import { AppError, approveDraft, editDraft } from "../src/lib/service";

const goodNarrative = "Laser Focus supports local families through mentoring and community care. These recorded activities help staff prepare for review.";
const knownUsage = { inputTokens: 120, outputTokens: 40, known: true };
function validOutput(evidence: DraftEvidence) {
  return { narrative: goodNarrative, claims: evidence.metrics.map(({ id, value }) => ({ metricId: id, value })) };
}
async function generationFailure(promise: ReturnType<typeof prepareDraft>) {
  try { await promise; assert.fail("Expected generation to fail"); }
  catch (error) { assert.ok(error instanceof DraftGenerationError); return error; }
}

test("demo report, all follow-up kinds and application pass shared validation without any model request", async () => {
  const state = createSeed();
  const requests = [
    { kind: "report" as const, mode: "demo" as const },
    { kind: "application" as const, mode: "demo" as const, grantId: state.grants[0].id },
    ...getQueue(state).map((item) => ({ kind: "followup" as const, mode: "demo" as const, queueItemId: item.id })),
  ];
  for (const request of requests) {
    const { draft, run } = await prepareDraft(state, request, { runModel: async () => { throw new Error("Model should not be invoked"); } });
    assert.deepEqual([...validateDraft(state, draft), ...validateApplication(state, draft)], []);
    assert.equal(draft.status, "pending");
    assert.ok(draft.sourceFingerprint);
    assert.equal(run.status, "completed");
    assert.equal(run.attempts, 0);
    assert.equal(run.usageKnown, true);
    assert.equal(run.inputTokens + run.outputTokens, 0);
    assert.equal(run.events.filter((event) => event.action === "evidence_read").length, 1);
    assert.doesNotMatch(JSON.stringify(run), /PRIVATE_SENTINEL|privateDetail|shared family check-in routine/);
  }
});

test("live drafting consumes minimal evidence and preserves immutable snapshots, server title and pending approval", async () => {
  const state = createSeed();
  let callCount = 0;
  const result = await prepareDraft(state, { kind: "application", mode: "live", grantId: state.grants[0].id }, {
    runModel: async (call) => {
      callCount++;
      assert.equal(call.phase, "initial");
      assert.equal(call.maxTurns, 3);
      assert.equal(call.evidence, undefined);
      const evidence = call.readEvidence!();
      assert.equal(evidence.applicationQuestion, state.grants[0].applicationQuestion);
      assert.equal(evidence.metrics.length, getMetrics(state).length);
      assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE_SENTINEL|privateDetail|goal|progress|counselor|FAM-/);
      const output = validOutput(evidence);
      evidence.metrics[0].value = 9999; // An adapter cannot mutate the saved evidence.
      return { output, usage: knownUsage };
    },
  });
  assert.equal(callCount, 1);
  assert.equal(result.draft.title, "Program support application");
  assert.equal(result.draft.status, "pending");
  assert.equal(result.run.usageKnown, true);
  assert.equal(result.run.inputTokens, 120);
  assert.equal(result.run.outputTokens, 40);
  assert.doesNotMatch(JSON.stringify(result.run.inputSnapshot), /9999/);
  const originalOutput = JSON.stringify(result.run.outputSnapshot);
  result.draft.narrative = "Edited later.";
  assert.equal(JSON.stringify(result.run.outputSnapshot), originalOutput);
});

test("one repair must correct bad model facts; both outputs and summed usage remain visible", async () => {
  const state = createSeed();
  let evidence: DraftEvidence;
  let originalSignal: AbortSignal;
  const { draft, run } = await prepareDraft(state, { kind: "report", mode: "live" }, {
    runModel: async (call) => {
      if (call.phase === "initial") {
        originalSignal = call.signal;
        evidence = call.readEvidence!();
        const output = validOutput(evidence);
        output.claims[0].value = 9999;
        return { output, usage: knownUsage };
      }
      assert.equal(call.signal, originalSignal);
      assert.equal(call.maxTurns, 1);
      assert.equal(call.readEvidence, undefined);
      assert.ok(call.issues?.some((issue) => issue.code === "claim_mismatch"));
      assert.match(JSON.stringify(call.rejectedOutput), /9999/);
      assert.deepEqual(call.evidence, evidence);
      return { output: validOutput(evidence), usage: { inputTokens: 200, outputTokens: 50, known: true } };
    },
  });
  assert.equal(run.attempts, 2);
  assert.equal(run.inputTokens, 320);
  assert.equal(run.outputTokens, 90);
  assert.equal(run.usageKnown, true);
  assert.deepEqual(validateDraft(state, draft), []);
  assert.match(JSON.stringify(run.outputSnapshot), /9999/);
  assert.equal(run.events.filter((event) => event.action === "repair_requested").length, 1);
  assert.equal(run.events.filter((event) => event.action === "evidence_read").length, 1);
});

test("persistent wrong figures fail after exactly two attempts without silently replacing numbers", async () => {
  let calls = 0;
  let evidence: DraftEvidence;
  const error = await generationFailure(prepareDraft(createSeed(), { kind: "report", mode: "live" }, {
    runModel: async (call) => {
      calls++;
      evidence = call.phase === "initial" ? call.readEvidence!() : evidence;
      const output = validOutput(evidence);
      output.claims[0].value = 9999;
      return { output, usage: knownUsage };
    },
  }));
  assert.equal(calls, 2);
  assert.equal(error.run.status, "failed");
  assert.equal(error.run.attempts, 2);
  assert.equal(error.run.usageKnown, true);
  assert.ok(error.issues.some((issue) => issue.code === "claim_mismatch"));
  assert.match(JSON.stringify(error.run.outputSnapshot), /9999/);
  assert.equal(error.run.events.some((event) => event.action === "awaiting_review"), false);
});

test("full application answer including rendered figures drives the repair budget", async () => {
  const state = createSeed();
  let evidence: DraftEvidence;
  const { draft, run } = await prepareDraft(state, { kind: "application", mode: "live", grantId: state.grants[0].id }, {
    runModel: async (call) => {
      if (call.phase === "initial") {
        evidence = call.readEvidence!();
        assert.ok(evidence.narrativeWordBudget < evidence.wordLimit);
        // Narrative alone fits the 120-word limit; full rendered answer does not.
        return { output: { ...validOutput(evidence), narrative: Array(115).fill("community").join(" ") }, usage: knownUsage };
      }
      assert.ok(call.issues?.some((issue) => issue.code === "application_word_limit"));
      return { output: validOutput(evidence), usage: knownUsage };
    },
  });
  assert.equal(run.attempts, 2);
  assert.ok(applicationWordCount(state, draft) <= state.grants[0].wordLimit);
  assert.deepEqual(validateApplication(state, draft), []);
});

test("missing evidence tool is a failed run even when all returned claims happen to be correct", async () => {
  const state = createSeed();
  let calls = 0;
  const error = await generationFailure(prepareDraft(state, { kind: "report", mode: "live" }, {
    runModel: async () => {
      calls++;
      return { output: { narrative: goodNarrative, claims: getMetrics(state).map(({ id, value }) => ({ metricId: id, value })) }, usage: knownUsage };
    },
  }));
  assert.equal(calls, 1);
  assert.equal(error.run.inputTokens, 120);
  assert.equal(error.run.usageKnown, true);
  assert.ok(error.issues.some((issue) => issue.code === "evidence_step"));
  assert.match(JSON.stringify(error.run.outputSnapshot), /Laser Focus supports/);
});

test("unexpected output fields and missing claims cannot replace the title or evidence metadata", async () => {
  let calls = 0;
  const error = await generationFailure(prepareDraft(createSeed(), { kind: "report", mode: "live" }, {
    runModel: async (call) => {
      calls++;
      if (call.phase === "initial") call.readEvidence!();
      return { output: { title: "SECRET_PROVIDER_PAYLOAD", narrative: "Approved by the model.", claims: [], status: "approved", sourceIds: ["fake"] }, usage: knownUsage };
    },
  }));
  assert.equal(calls, 2);
  assert.ok(error.issues.some((issue) => issue.code === "output_schema"));
  assert.doesNotMatch(JSON.stringify(error.run), /SECRET_PROVIDER_PAYLOAD/);
});

test("numeric narrative, duplicate and missing metric claims all remain validation blockers", async () => {
  let evidence: DraftEvidence;
  const error = await generationFailure(prepareDraft(createSeed(), { kind: "report", mode: "live" }, {
    runModel: async (call) => {
      evidence = call.phase === "initial" ? call.readEvidence!() : evidence;
      const claim = validOutput(evidence).claims[0];
      return { output: { narrative: "We helped 99 people.", claims: [claim, claim] }, usage: knownUsage };
    },
  }));
  for (const code of ["unbound_number", "duplicate_claim", "missing_claim"]) assert.ok(error.issues.some((issue) => issue.code === code));
});

test("follow-up evidence omits report metrics and counseling notes", async () => {
  const state = createSeed();
  const queueItemId = getQueue(state)[0].id;
  const { draft } = await prepareDraft(state, { kind: "followup", queueItemId, mode: "live" }, {
    runModel: async (call) => {
      const evidence = call.readEvidence!();
      assert.deepEqual(evidence.metrics, []);
      assert.equal(evidence.applicationQuestion, null);
      assert.ok(evidence.task);
      assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE_SENTINEL|privateDetail|FAM-/);
      return { output: { narrative: "Hello from Laser Focus. Please let us know a good time to talk and how we can help.", claims: [] }, usage: knownUsage };
    },
  });
  assert.equal(draft.claims.length, 0);
  assert.deepEqual(validateDraft(state, draft), []);
});

test("provider failure retains checkpoint usage and marks total usage unknown without leaking provider errors", async () => {
  const error = await generationFailure(prepareDraft(createSeed(), { kind: "report", mode: "live" }, {
    runModel: async (call) => {
      call.readEvidence!();
      call.reportUsage({ inputTokens: 75, outputTokens: 12, known: true });
      throw new Error("SECRET_PROVIDER_PAYLOAD sk-sensitive-key");
    },
  }));
  assert.equal(error.run.status, "failed");
  assert.equal(error.run.inputTokens, 75);
  assert.equal(error.run.outputTokens, 12);
  assert.equal(error.run.usageKnown, false);
  assert.equal(error.run.attempts, 1);
  assert.doesNotMatch(JSON.stringify(error.run) + error.message, /SECRET_PROVIDER_PAYLOAD|sk-sensitive-key/);
});

test("repair shares the original deadline, retains first-attempt tokens and cannot hang on an uncooperative adapter", async () => {
  let initialSignal: AbortSignal;
  let calls = 0;
  const started = Date.now();
  const error = await generationFailure(prepareDraft(createSeed(), { kind: "report", mode: "live" }, {
    timeoutMs: 80,
    runModel: async (call) => {
      calls++;
      if (call.phase === "initial") {
        initialSignal = call.signal;
        const evidence = call.readEvidence!();
        await new Promise((resolve) => setTimeout(resolve, 25));
        return { output: { ...validOutput(evidence), narrative: "99 families" }, usage: knownUsage };
      }
      assert.equal(call.signal, initialSignal);
      return new Promise(() => {});
    },
  }));
  assert.equal(calls, 2);
  assert.equal(initialSignal!.aborted, true);
  assert.equal(error.run.usageKnown, false);
  assert.equal(error.run.inputTokens, 120);
  assert.equal(error.run.outputTokens, 40);
  assert.match(error.message, /shared time limit/);
  assert.ok(Date.now() - started < 1_000);
});

test("missing usage is explicitly unknown on an otherwise valid completed result", async () => {
  const runModel: DraftModelRunner = async (call: DraftModelCall) => ({ output: validOutput(call.readEvidence!()) });
  const { run } = await prepareDraft(createSeed(), { kind: "report", mode: "live" }, { runModel });
  assert.equal(run.status, "completed");
  assert.equal(run.usageKnown, false);
  assert.equal(run.inputTokens + run.outputTokens, 0);
});

test("provider access and quota failures have actionable messages without copying raw response details", async () => {
  for (const [status, code] of [[401, "model_access"], [403, "model_access"], [404, "model_unavailable"], [429, "model_rate_limit"]] as const) {
    const error = await generationFailure(prepareDraft(createSeed(), { kind: "report", mode: "live" }, {
      runModel: async () => { throw Object.assign(new Error("SECRET_PROVIDER_PAYLOAD"), { status }); },
    }));
    assert.ok(error.issues.some((issue) => issue.code === code));
    assert.match(error.message, /demo mode/);
    assert.doesNotMatch(JSON.stringify(error.run), /SECRET_PROVIDER_PAYLOAD/);
    assert.equal(error.run.usageKnown, false);
  }
});

test("editing reporting figures into a follow-up cannot bypass the approval boundary", async () => {
  const state = createSeed();
  const { draft } = await prepareDraft(state, { kind: "followup", mode: "demo", queueItemId: getQueue(state)[0].id });
  state.drafts.push(draft);
  editDraft(state, draft.id, { revision: draft.revision, claims: [getMetrics(state).map(({ id, value }) => ({ metricId: id, value }))[0]] });
  assert.throws(() => approveDraft(state, draft.id, draft.revision), (error) => error instanceof AppError && Boolean(error.issues?.some((issue) => issue.code === "followup_claims")));
  assert.equal(draft.status, "pending");
});

test("real Agents SDK adapter retains usage from an unsuccessful terminal response with no external network", async (context) => {
  const priorKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "offline-test-key";
  let requests = 0;
  context.mock.method(globalThis, "fetch", async () => {
    requests++;
    return new Response(JSON.stringify({
      id: "resp_offline_incomplete", object: "response", status: "incomplete", output: [],
      incomplete_details: { reason: "max_output_tokens" },
      usage: { input_tokens: 173, output_tokens: 89, total_tokens: 262 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  try {
    const error = await generationFailure(prepareDraft(createSeed(), { kind: "report", mode: "live" }));
    assert.equal(requests, 1);
    assert.equal(error.run.inputTokens, 173);
    assert.equal(error.run.outputTokens, 89);
    assert.equal(error.run.usageKnown, false);
    assert.equal(error.run.status, "failed");
  } finally {
    if (priorKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = priorKey;
  }
});

test("real SDK transport does not silently retry a rate-limit failure", async (context) => {
  const priorKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "offline-test-key";
  let requests = 0;
  context.mock.method(globalThis, "fetch", async () => {
    requests++;
    return new Response(JSON.stringify({ error: { type: "rate_limit_error", message: "SECRET_PROVIDER_PAYLOAD", code: "rate_limit_exceeded" } }), {
      status: 429, headers: { "Content-Type": "application/json", "Retry-After": "0" },
    });
  });
  try {
    const error = await generationFailure(prepareDraft(createSeed(), { kind: "report", mode: "live" }));
    assert.equal(requests, 1);
    assert.equal(error.run.attempts, 1);
    assert.equal(error.run.usageKnown, false);
    assert.ok(error.issues.some((issue) => issue.code === "model_rate_limit"));
    assert.doesNotMatch(JSON.stringify(error.run), /SECRET_PROVIDER_PAYLOAD/);
  } finally {
    if (priorKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = priorKey;
  }
});
