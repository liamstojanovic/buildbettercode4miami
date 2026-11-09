import test from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "../src/lib/seed";
import { getMetrics, getQueue, recordAttendance } from "../src/lib/domain";
import { AppError, approveDraft, dashboard, editDraft, exportDraft, simulateDelivery } from "../src/lib/service";
import type { DemoState, Draft } from "../src/lib/types";

function draftFor(state: DemoState, kind: "report" | "followup" = "report"): Draft {
  const metrics = getMetrics(state);
  const task = kind === "followup" ? getQueue(state)[0] : undefined;
  return { id: "service-draft", title: "Staff review draft", kind, queueItemId: task?.id,
    narrative: "Laser Focus supports families through mentoring and attentive follow-up. Please let us know how we can help.",
    claims: task ? [] : metrics.map(({ id, value }) => ({ metricId: id, value })),
    sourceIds: task ? task.sourceIds : [...new Set(metrics.flatMap((metric) => metric.sourceIds))],
    dataRevision: state.revision, revision: 1, status: "pending", mode: "demo", createdAt: "2026-09-30T10:00:00Z", runId: "service-run" };
}

function errorStatus(status: number, code?: string) {
  return (error: unknown) => error instanceof AppError && error.status === status && (!code || Boolean(error.issues?.some((issue) => issue.code === code)));
}

test("approval permits export of exact revision; editing clears prior approval", () => {
  const state = createSeed();
  const draft = draftFor(state); state.drafts.push(draft);
  assert.throws(() => exportDraft(state, draft.id), errorStatus(409));
  approveDraft(state, draft.id, 1);
  assert.equal(draft.status, "approved");
  assert.ok(draft.approvedAt);
  assert.match(exportDraft(state, draft.id), /Quarter giving: \$635\.00/);
  const auditCount = state.audit.length;
  approveDraft(state, draft.id, 1);
  assert.equal(state.audit.length, auditCount);
  editDraft(state, draft.id, { revision: 1, narrative: "Laser Focus stays connected to families through mentoring and community care." });
  assert.equal(draft.status, "pending");
  assert.equal(draft.revision, 2);
  assert.equal(draft.approvedAt, undefined);
  assert.throws(() => exportDraft(state, draft.id), errorStatus(409));
  assert.throws(() => approveDraft(state, draft.id, 1), errorStatus(409));
  approveDraft(state, draft.id, 2);
  assert.match(exportDraft(state, draft.id), /Draft revision: 2/);
});

test("wrong claims cannot be approved through service even when UI checks are bypassed", () => {
  const state = createSeed();
  const draft = draftFor(state); state.drafts.push(draft);
  editDraft(state, draft.id, { revision: 1, claims: draft.claims.map((claim) => claim.metricId === "giving" ? { ...claim, value: 9999 } : claim) });
  assert.throws(() => approveDraft(state, draft.id, 2), errorStatus(422, "claim_mismatch"));
  assert.equal(draft.status, "pending");
  assert.equal(draft.approvedAt, undefined);
});

test("record revision changes invalidate prior approved export and pending generated draft", () => {
  const state = createSeed();
  const approved = draftFor(state); state.drafts.push(approved);
  approveDraft(state, approved.id, approved.revision);
  const pending = { ...draftFor(state), id: "generated-before-change" }; state.drafts.push(pending);
  recordAttendance(state, { participantId: "participant-lucia", date: "2026-09-25", status: "present" });
  assert.throws(() => exportDraft(state, approved.id), errorStatus(422, "stale"));
  assert.throws(() => approveDraft(state, pending.id, pending.revision), errorStatus(422, "stale"));
  // Copying fresh metric values into stale output does not rewrite its source revision.
  editDraft(state, pending.id, { revision: 1, claims: getMetrics(state).map(({ id, value }) => ({ metricId: id, value })) });
  assert.throws(() => approveDraft(state, pending.id, 2), errorStatus(422, "stale"));
});

test("follow-up delivery requires approval and is idempotent for the reviewed revision", () => {
  const state = createSeed();
  const draft = draftFor(state, "followup"); state.drafts.push(draft);
  assert.throws(() => simulateDelivery(state, draft.id, draft.revision), errorStatus(409));
  approveDraft(state, draft.id, draft.revision);
  const sent = simulateDelivery(state, draft.id, draft.revision);
  assert.equal(sent.transport, "simulation");
  assert.equal(sent.status, "simulated_sent");
  const auditCount = state.audit.length;
  assert.equal(simulateDelivery(state, draft.id, draft.revision), sent);
  assert.equal(state.outbox.length, 1);
  assert.equal(state.audit.length, auditCount);
  editDraft(state, draft.id, { revision: 1, narrative: "Please let us know a good time to talk about how Laser Focus can help." });
  assert.throws(() => simulateDelivery(state, draft.id, 1), errorStatus(409));
  assert.throws(() => simulateDelivery(state, draft.id, 2), errorStatus(409));
  assert.equal(state.outbox[0].body, sent.body);
});

test("public dashboard omits private note bodies, including indirect source and audit paths", () => {
  const state = createSeed();
  assert.ok(state.notes.length > 0, "counseling seed must be present");
  const publicData = dashboard(state);
  const serialized = JSON.stringify(publicData);
  assert.ok(!serialized.includes('"privateDetail"'));
  for (const note of state.notes) {
    assert.ok(note.privateDetail.length > 0);
    assert.ok(!serialized.includes(note.privateDetail), `Private content leaked for ${note.id}`);
    const summary = publicData.state.notes.find((item) => item.id === note.id)!;
    assert.ok(!("privateDetail" in summary));
    assert.ok(!("progress" in summary));
    assert.ok(!("goal" in summary));
  }
});
