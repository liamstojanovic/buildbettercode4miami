import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { DraftGenerationError, prepareDraft, type DraftRequest } from "../src/lib/agent";
import { recordAttendance } from "../src/lib/domain";
import { digest } from "../src/lib/evidence";
import { assertResetAllowed, generateDraft, replayRun } from "../src/lib/generation";
import { saveNote } from "../src/lib/programs";
import { AppError } from "../src/lib/service";
import { mutateState, readState, resetState } from "../src/lib/store";
import type { AgentRun, DemoState, GenerationJob } from "../src/lib/types";

const report: DraftRequest = { kind: "report", mode: "demo" };
const liveReport: DraftRequest = { kind: "report", mode: "live" };

async function isolated(operation: (file: string) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "laser-focus-generation-test-"));
  const file = join(directory, "state.json");
  const original = process.env.LASER_FOCUS_STATE_FILE;
  process.env.LASER_FOCUS_STATE_FILE = file;
  try { await operation(file); }
  finally {
    if (original === undefined) delete process.env.LASER_FOCUS_STATE_FILE;
    else process.env.LASER_FOCUS_STATE_FILE = original;
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
}

function status(expected: number, message?: RegExp) {
  return (error: unknown) => error instanceof AppError && error.status === expected && (!message || message.test(error.message));
}

/** Exercises the real evidence/validation boundary without making provider requests. */
const controlledPrepare: typeof prepareDraft = (state, input) => prepareDraft(state, input, {
  runModel: async (call) => {
    const evidence = call.readEvidence!();
    return { output: { narrative: "Laser Focus provides mentoring and community support for families.", claims: evidence.metrics.map(({ id, value }) => ({ metricId: id, value })) }, usage: { inputTokens: 123, outputTokens: 45, known: true } };
  },
});

function expiredJob(requestId: string, input: DraftRequest = liveReport): GenerationJob {
  return { id: `job-${requestId}`, requestId, requestFingerprint: digest(input), mode: input.mode, status: "running", startedAt: "2020-01-01T00:00:00.000Z", leaseExpiresAt: "2020-01-01T00:01:30.000Z" };
}

function failureRun(id: string): AgentRun {
  return { id, mode: "live", status: "failed", model: "controlled-test-model", events: [], inputTokens: 91, outputTokens: 13, usageKnown: true, maxTurns: 3, durationMs: 1,
    inputSnapshot: { kind: "report" }, outputSnapshot: { rejected: true } };
}

test("generation persists a running reservation before work and commits the result and hashes", () => isolated(async (file) => {
  let called = 0;
  const result = await generateDraft(report, "persisted-request", async (snapshot, input) => {
    called++;
    const persisted = JSON.parse(readFileSync(file, "utf8")) as DemoState;
    assert.equal(persisted.generationJobs?.length, 1);
    assert.equal(persisted.generationJobs?.[0].status, "running");
    assert.equal(snapshot.generationJobs?.[0].id, persisted.generationJobs?.[0].id);
    assert.ok(Date.parse(persisted.generationJobs![0].leaseExpiresAt) > Date.now());
    return controlledPrepare(snapshot, input);
  });
  assert.equal(called, 1);
  assert.equal(result.replayed, false);
  const state = readState();
  assert.equal(state.drafts.length, 1);
  assert.equal(state.runs.length, 1);
  assert.equal(state.generationJobs?.[0].status, "completed");
  assert.equal(state.generationJobs?.[0].draftId, result.draft.id);
  assert.equal(state.generationJobs?.[0].runId, result.draft.runId);
  assert.equal(state.runs[0].inputHash, digest(state.runs[0].inputSnapshot));
  assert.equal(state.runs[0].outputHash, digest(state.runs[0].outputSnapshot));
}));

test("same completed request key replays its saved result without preparing or duplicating records", () => isolated(async () => {
  let called = 0;
  const prepare: typeof prepareDraft = async (state, input) => { called++; return controlledPrepare(state, input); };
  const first = await generateDraft(report, "retry-key", prepare);
  const before = readState();
  const replay = await generateDraft(report, "retry-key", prepare);
  assert.equal(replay.replayed, true);
  assert.equal(replay.draft.id, first.draft.id);
  assert.equal(called, 1);
  assert.deepEqual(readState(), before);
}));

test("request keys cannot be reused for different inputs", () => isolated(async () => {
  await generateDraft(report, "bound-key", controlledPrepare);
  const before = readState();
  let called = false;
  await assert.rejects(generateDraft({ kind: "application", grantId: before.grants[0].id, mode: "demo" }, "bound-key", async () => { called = true; throw new Error("Unexpected work"); }), status(409, /different draft request/));
  assert.equal(called, false);
  assert.deepEqual(readState(), before);
}));

test("in-flight requests reject retries and competing work and prevent reset", () => isolated(async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
  const pending = generateDraft(report, "in-flight", async (state, input) => { await gate; return controlledPrepare(state, input); });
  try {
    assert.equal(readState().generationJobs?.[0].status, "running");
    const before = readState();
    await assert.rejects(generateDraft(report, "in-flight", controlledPrepare), status(409, /still running/));
    await assert.rejects(generateDraft(report, "other-key", controlledPrepare), status(409, /already running/));
    assert.throws(() => resetState(assertResetAllowed), status(409, /before resetting/));
    assert.deepEqual(readState(), before);
  } finally { release(); await pending; }
  assert.doesNotThrow(() => assertResetAllowed(readState()));
}));

test("invalid targets and malformed request keys consume no generation budget", () => isolated(async () => {
  const before = readState();
  let called = 0;
  const prepare: typeof prepareDraft = async () => { called++; throw new Error("Invalid input must not reach preparation"); };
  const invalid: DraftRequest[] = [
    { kind: "followup", queueItemId: "missing", mode: "live" },
    { kind: "application", grantId: "missing", mode: "live" },
    { kind: "report", grantId: before.grants[0].id, mode: "live" },
    { kind: "report", queueItemId: "unsupported", mode: "live" },
    { kind: "invalid", mode: "live" } as unknown as DraftRequest,
    { kind: "report", mode: "invalid" } as unknown as DraftRequest,
  ];
  for (const input of invalid) await assert.rejects(generateDraft(input, "invalid-request", prepare), (error: unknown) => error instanceof AppError && [400, 404].includes(error.status));
  for (const key of ["", "bad key", "x".repeat(129)]) await assert.rejects(generateDraft(report, key, prepare), status(400, /Idempotency-Key/));
  assert.equal(called, 0);
  assert.deepEqual(readState(), before);
}));

test("failed live attempts count toward the limit across a fresh process; demo remains available", () => isolated(async (file) => {
  let called = 0;
  const failedPrepare: typeof prepareDraft = async () => { called++; throw new DraftGenerationError("Controlled validation failure.", failureRun(`failed-live-${called}`)); };
  for (let index = 0; index < 12; index++) await assert.rejects(generateDraft(liveReport, `failed-${index}`, failedPrepare), status(502));
  const state = readState();
  assert.equal(state.generationJobs?.length, 12);
  assert.ok(state.generationJobs?.every((job) => job.status === "failed"));
  assert.equal(state.runs.length, 12);
  assert.equal(state.drafts.length, 0);
  await assert.rejects(generateDraft(liveReport, "over-limit", failedPrepare), status(429));
  assert.equal(called, 12);
  const moduleUrl = pathToFileURL(resolve("src/lib/generation.ts")).href;
  const code = `const m = await import(${JSON.stringify(moduleUrl)}); const generate = m.generateDraft ?? m.default.generateDraft; try { await generate({kind:'report',mode:'live'}, 'after-restart', async () => { throw new Error('Preparation must not run'); }); process.exit(2); } catch (error) { process.stdout.write(JSON.stringify({status:error.status,message:error.message})); }`;
  const fresh = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", code], { cwd: process.cwd(), env: { ...process.env, LASER_FOCUS_STATE_FILE: file }, encoding: "utf8" });
  assert.equal(JSON.parse(fresh).status, 429);
  assert.deepEqual(readState(), state);
  assert.equal((await generateDraft(report, "rehearsal-after-limit", controlledPrepare)).draft.mode, "demo");
}));

test("legacy live runs count once alongside completed persisted reservations", () => isolated(async () => {
  mutateState((state) => { state.runs = Array.from({ length: 11 }, (_, index) => failureRun(`legacy-${index}`)); });
  const accepted = await generateDraft(liveReport, "last-allowed", controlledPrepare);
  assert.equal(accepted.draft.mode, "live");
  assert.equal(readState().runs.length, 12);
  assert.equal((await generateDraft(liveReport, "last-allowed", controlledPrepare)).replayed, true);
  await assert.rejects(generateDraft(liveReport, "thirteenth", controlledPrepare), status(429));
}));

test("relevant evidence changing during generation rejects the draft and preserves known run usage", () => isolated(async () => {
  await assert.rejects(generateDraft(liveReport, "evidence-race", async (snapshot, input) => {
    const result = await controlledPrepare(snapshot, input);
    mutateState((state) => recordAttendance(state, { participantId: "participant-lucia", date: "2026-09-25", status: "present" }));
    return result;
  }), status(409, /evidence changed during drafting/));
  const state = readState();
  assert.equal(state.drafts.length, 0);
  assert.equal(state.generationJobs?.[0].status, "failed");
  assert.equal(state.runs.length, 1);
  assert.equal(state.runs[0].status, "failed");
  assert.equal(state.runs[0].inputTokens, 123);
  assert.equal(state.runs[0].outputTokens, 45);
  assert.equal(state.runs[0].usageKnown, true);
  assert.ok(state.runs[0].events.some((event) => event.action === "draft_not_saved"));
  assert.equal(replayRun(state, state.runs[0].id).integrity.output, "verified");
}));

test("an unrelated counseling edit during report generation permits the scoped result", () => isolated(async () => {
  const result = await generateDraft(report, "unrelated-note-edit", async (snapshot, input) => {
    const prepared = await controlledPrepare(snapshot, input);
    mutateState((state) => {
      const note = state.notes[0];
      saveNote(state, note.id, { goal: note.goal, progress: "Updated private-workspace session progress", privateDetail: note.privateDetail, durationMinutes: 50 });
    });
    return prepared;
  });
  assert.equal(result.draft.dataRevision, result.dashboard.state.revision);
  assert.notEqual(result.draft.originDataRevision, result.draft.dataRevision);
  assert.equal(readState().generationJobs?.[0].status, "completed");
  assert.equal(readState().drafts.length, 1);
  assert.doesNotMatch(JSON.stringify(readState().runs), /PRIVATE_SENTINEL|Updated private-workspace/);
}));

test("DraftGenerationError retains reported tokens, validation issues and failed replay snapshots", () => isolated(async () => {
  const issues = [{ code: "claim_mismatch", message: "A controlled numeric claim was rejected." }];
  await assert.rejects(generateDraft(liveReport, "known-failure", async () => { throw new DraftGenerationError("Review the recorded validation issues.", failureRun("known-run"), issues); }), (error: unknown) => error instanceof AppError && error.status === 502 && error.issues?.[0].code === "claim_mismatch");
  const state = readState();
  const run = state.runs[0];
  assert.equal(run.inputTokens, 91);
  assert.equal(run.outputTokens, 13);
  assert.equal(run.usageKnown, true);
  assert.equal(run.status, "failed");
  assert.equal(state.generationJobs?.[0].runId, run.id);
  assert.equal(state.drafts.length, 0);
  assert.equal(replayRun(state, run.id).draftId, null);
  let called = false;
  await assert.rejects(generateDraft(liveReport, "known-failure", async () => { called = true; throw new Error("No retry work"); }), status(409));
  assert.equal(called, false);
}));

test("a new request recovers an expired lease and records unknown provider usage", () => isolated(async () => {
  mutateState((state) => { state.generationJobs = [expiredJob("abandoned")]; });
  assert.doesNotThrow(() => assertResetAllowed(readState()));
  const result = await generateDraft(report, "recovery-request", controlledPrepare);
  assert.equal(result.replayed, false);
  const state = readState();
  const abandoned = state.generationJobs!.find((job) => job.requestId === "abandoned")!;
  assert.equal(abandoned.status, "failed");
  const failed = state.runs.find((run) => run.id === abandoned.runId)!;
  assert.equal(failed.status, "failed");
  assert.equal(failed.usageKnown, false);
  assert.equal(failed.inputTokens, 0);
  assert.ok(failed.events.some((event) => event.action === "run_interrupted"));
  assert.equal(state.generationJobs?.find((job) => job.requestId === "recovery-request")?.status, "completed");
}));

test("retrying the same expired lease persists its failure even when the retry is rejected", () => isolated(async () => {
  mutateState((state) => { state.generationJobs = [expiredJob("expired-retry")]; });
  await assert.rejects(generateDraft(liveReport, "expired-retry", controlledPrepare), status(409, /interrupted/));
  const state = readState();
  assert.equal(state.generationJobs?.[0].status, "failed");
  assert.equal(state.runs.length, 1);
  assert.equal(state.runs[0].usageKnown, false);
  const before = structuredClone(state);
  await assert.rejects(generateDraft(liveReport, "expired-retry", controlledPrepare), status(409));
  assert.deepEqual(readState(), before, "repeated retries must not add duplicate interruption runs");
}));

test("lease expiration before commit rejects the late draft while retaining completed provider usage", () => isolated(async () => {
  await assert.rejects(generateDraft(liveReport, "late-result", async (snapshot, input) => {
    const prepared = await controlledPrepare(snapshot, input);
    mutateState((state) => { state.generationJobs![0].leaseExpiresAt = "2020-01-01T00:00:00.000Z"; });
    return prepared;
  }), status(409, /reservation expired/));
  const state = readState();
  assert.equal(state.drafts.length, 0);
  assert.equal(state.generationJobs?.[0].status, "failed");
  assert.equal(state.runs.length, 1);
  assert.equal(state.runs[0].inputTokens, 123);
  assert.equal(state.runs[0].outputTokens, 45);
  assert.equal(state.runs[0].usageKnown, true);
}));

test("unexpected preparation errors are sanitized and recorded with usage explicitly unknown", () => isolated(async () => {
  await assert.rejects(generateDraft(liveReport, "provider-error", async () => { throw new Error("SENSITIVE_PROVIDER_ERROR_DETAIL"); }), status(502, /could not finish/));
  const state = readState();
  assert.equal(state.drafts.length, 0);
  assert.equal(state.generationJobs?.[0].status, "failed");
  assert.equal(state.runs[0].usageKnown, false);
  assert.equal(state.runs[0].status, "failed");
  assert.doesNotMatch(JSON.stringify(state), /SENSITIVE_PROVIDER_ERROR_DETAIL/);
  assert.doesNotMatch(JSON.stringify(state.runs[0].events), /lease expired/);
}));

test("recorded replay verifies hashes without generation and rejects modified input or output", () => isolated(async () => {
  const result = await generateDraft(report, "recorded-run", controlledPrepare);
  const state = readState();
  const before = structuredClone(state);
  const replay = replayRun(state, result.draft.runId);
  assert.equal(replay.replay, "recorded");
  assert.deepEqual(replay.integrity, { input: "verified", output: "verified" });
  assert.equal(replay.draftId, result.draft.id);
  assert.equal(replay.evidenceCurrent, true);
  assert.deepEqual(state, before);
  for (const field of ["inputSnapshot", "outputSnapshot"] as const) {
    const tampered = structuredClone(state);
    tampered.runs[0][field] = { changed: true };
    assert.throws(() => replayRun(tampered, result.draft.runId), status(409, /recorded digest/));
  }
  assert.throws(() => replayRun(state, "missing-run"), status(404));
}));

test("legacy run replay labels missing digests unavailable and makes no freshness claim without a draft", () => isolated(async () => {
  const state = readState();
  state.runs.push(failureRun("legacy-recording"));
  const replay = replayRun(state, "legacy-recording");
  assert.deepEqual(replay.integrity, { input: "unavailable", output: "unavailable" });
  assert.equal(replay.draftId, null);
  assert.equal(replay.evidenceCurrent, null);
}));
