import test from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "../src/lib/seed";
import { canonicalDonorId, decideMerge, detectMergeCandidates, getMetrics, getQueue, importGiftCsv, recordAttendance, renderDraft, validateDraft } from "../src/lib/domain";
import type { DemoState, Draft } from "../src/lib/types";

function report(state: DemoState): Draft {
  const metrics = getMetrics(state);
  return {
    id: "draft-test", kind: "report", title: "Quarter report", narrative: "Laser Focus supports families through mentoring and consistent care. The figures below come from reviewed program records.",
    claims: metrics.map(({ id, value }) => ({ metricId: id, value })), sourceIds: [...new Set(metrics.flatMap((item) => item.sourceIds))], dataRevision: state.revision,
    revision: 1, status: "pending", mode: "demo", createdAt: "2026-09-30T09:00:00Z", runId: "run-test",
  };
}
const header = "gift_id,donor_id,name,email,phone,amount_cents,date,channel";

test("fixed quarter ground truth and all referenced provenance exist", () => {
  const state = createSeed();
  assert.deepEqual(createSeed(), state);
  assert.deepEqual(Object.fromEntries(getMetrics(state).map((item) => [item.id, item.value])), { participants: 4, donors: 5, giving: 635, attendance: 50, volunteer_hours: 65 });
  const sources = new Set(state.sources.map((item) => item.id));
  for (const metric of getMetrics(state)) assert.ok(metric.sourceIds.length && metric.sourceIds.every((id) => sources.has(id)));
  assert.equal(state.attendance.filter((item) => item.participantId === "participant-mateo").length, 13);
  assert.deepEqual(new Set(state.gifts.map((item) => item.channel)), new Set(["online", "tickets", "auction", "check"]));
});

test("contact evidence finds Rosa's connected aliases, not a namesake", () => {
  const state = createSeed();
  assert.equal(state.candidates.length, 1);
  assert.equal(state.candidates[0].donorIds.length, 3);
  assert.ok(!state.candidates[0].donorIds.includes("donor-rosa-other"));
  assert.ok(state.candidates[0].reasons.includes("Shared email address"));
  assert.equal(state.donors.filter((item) => item.mergedInto).length, 0);
});

test("approved merge preserves gift records and amounts while reducing unique donors", () => {
  const state = createSeed();
  const giftsBefore = structuredClone(state.gifts);
  const draftBefore = report(state);
  decideMerge(state, state.candidates[0].id, "approve");
  assert.deepEqual(state.gifts, giftsBefore);
  assert.equal(getMetrics(state).find((item) => item.id === "giving")!.value, 635);
  assert.equal(getMetrics(state).find((item) => item.id === "donors")!.value, 3);
  assert.equal(state.donors.length, 6);
  assert.equal(new Set(state.candidates[0].donorIds.map((id) => canonicalDonorId(state, id))).size, 1);
  assert.ok(validateDraft(state, draftBefore).some((issue) => issue.code === "stale"));
  assert.throws(() => decideMerge(state, state.candidates[0].id, "approve"), /already/);
  assert.equal(state.audit.at(-1)!.action, "merge.approved");
});

test("rejection preserves identities and remains rejected on candidate refresh", () => {
  const state = createSeed();
  decideMerge(state, state.candidates[0].id, "reject");
  assert.equal(state.revision, 1);
  assert.equal(getMetrics(state).find((item) => item.id === "donors")!.value, 5);
  assert.equal(detectMergeCandidates(state)[0].status, "rejected");
});

test("absence alert fires after two completed absences, ignoring cancellation and future", () => {
  const state = createSeed();
  const item = getQueue(state).find((entry) => entry.kind === "attendance")!;
  assert.equal(item.name, "Lucia Morales");
  assert.match(item.reason, /2 consecutive/);
  state.asOf = "2026-09-20";
  assert.ok(!getQueue(state).some((entry) => entry.kind === "attendance"));
  state.asOf = "2026-09-30";
  state.attendance.find((entry) => entry.id === "attendance-participant-lucia-13")!.status = "present";
  assert.ok(!getQueue(state).some((entry) => entry.kind === "attendance"));
});

test("monthly payment explanation is tied to failure evidence; annual lapse is retrospective", () => {
  const state = createSeed();
  const queue = getQueue(state);
  assert.equal(queue.length, 3);
  assert.match(queue.find((entry) => entry.kind === "monthly")!.reason, /expired card/);
  assert.ok(queue.find((entry) => entry.kind === "monthly")!.sourceIds.includes("src-failure-jules"));
  assert.match(queue.find((entry) => entry.kind === "annual")!.reason, /retrospective/);
  assert.match(queue.find((entry) => entry.kind === "annual")!.reason, /December 2025/);
  state.paymentFailures = [];
  assert.match(getQueue(state).find((entry) => entry.kind === "monthly")!.reason, /Cause unknown/);
});

test("late paid gift clears its task and old or future gifts cannot change Q3 totals", () => {
  const state = createSeed();
  importGiftCsv(state, `${header}\npaid,donor-jules,Jules Pierre,jules@example.test,+1-305-555-0112,5000,2026-09-29,online`, "paid.csv");
  assert.ok(!getQueue(state).some((entry) => entry.kind === "monthly"));
  importGiftCsv(state, `${header}\nold,old-person,Old Person,old@example.test,,5000,2026-06-30,check\nfuture,future-person,Future Person,future@example.test,,7000,2026-10-01,check`, "boundary.csv");
  assert.equal(getMetrics(state).find((item) => item.id === "giving")!.value, 685);
  assert.equal(getMetrics(state).find((item) => item.id === "donors")!.value, 5);
});

test("report accepts supported claims; wrong, missing, duplicate, and unknown claims fail", () => {
  const state = createSeed();
  assert.deepEqual(validateDraft(state, report(state)), []);
  const wrong = report(state); wrong.claims[0].value = 999;
  assert.ok(validateDraft(state, wrong).some((issue) => issue.code === "claim_mismatch"));
  const missing = report(state); missing.claims.pop();
  assert.ok(validateDraft(state, missing).some((issue) => issue.code === "missing_claim"));
  const duplicate = report(state); duplicate.claims.push(duplicate.claims[0]);
  assert.ok(validateDraft(state, duplicate).some((issue) => issue.code === "duplicate_claim"));
  const unknown = report(state); unknown.claims.push({ metricId: "invented", value: 10 });
  assert.ok(validateDraft(state, unknown).some((issue) => issue.code === "claim_mismatch"));
});

test("numbers in narrative cannot bypass the bound claims; evidence cannot be invented or omitted", () => {
  const state = createSeed();
  for (const narrative of ["We supported 900 people.", "We supported nine hundred people.", "Giving grew １０ percent."]) {
    const draft = report(state); draft.narrative = narrative;
    assert.ok(validateDraft(state, draft).some((issue) => issue.code === "unbound_number"));
  }
  const missing = report(state); missing.sourceIds.pop();
  assert.ok(validateDraft(state, missing).some((issue) => issue.code === "missing_evidence"));
  const badTitle = report(state); badTitle.title = "We served 999 children";
  assert.ok(validateDraft(state, badTitle).some((issue) => issue.code === "unbound_number"));
  const invented = report(state); invented.sourceIds.push("not-real");
  assert.ok(validateDraft(state, invented).some((issue) => issue.code === "source"));
  const long = report(state); long.narrative = Array(251).fill("care").join(" ");
  assert.ok(validateDraft(state, long).some((issue) => issue.code === "word_limit"));
});

test("follow-up approval is attached to a current task and its evidence", () => {
  const state = createSeed();
  const queue = getQueue(state)[0];
  const draft = { ...report(state), kind: "followup" as const, queueItemId: queue.id, claims: [], sourceIds: queue.sourceIds };
  assert.deepEqual(validateDraft(state, draft), []);
  state.drafts.push({ ...draft, status: "approved" });
  assert.equal(getQueue(state)[0].status, "approved");
  state.revision++;
  assert.equal(getQueue(state)[0].status, "open");
  assert.match(renderDraft(state, draft), /this application does not send messages/i);
});

test("CSV imports all channels and idempotently skips exact transaction repeats", () => {
  const state = createSeed();
  const csv = `${header}\nnew-1,new-person,"Laurent, Maya",maya@example.test,,1234,2026-09-30,online\nnew-2,new-person,"Laurent, Maya",maya@example.test,,2000,2026-09-30,check`;
  assert.deepEqual(importGiftCsv(state, csv, "demo.csv"), { inserted: 2, skipped: 0 });
  const snapshot = structuredClone(state);
  assert.deepEqual(importGiftCsv(state, csv, "demo.csv"), { inserted: 0, skipped: 2 });
  assert.deepEqual(state, snapshot);
  assert.equal(state.donors.at(-1)!.name, "Laurent, Maya");
  assert.equal(getMetrics(state).find((item) => item.id === "giving")!.value, 667.34);
});

test("CSV validation is atomic, rejects fractional cents, bad dates, and conflicting transaction IDs", () => {
  const state = createSeed();
  const before = structuredClone(state);
  const good = "new-1,new-person,New Person,new@example.test,,1000,2026-09-30,online";
  assert.throws(() => importGiftCsv(state, `${header}\n${good}\nbad,bad-person,Bad Person,bad@example.test,,1.2,2026-09-30,check`, "bad.csv"), /positive safe integer/);
  assert.deepEqual(state, before);
  assert.throws(() => importGiftCsv(state, `${header}\nx,y,Name,a@example.test,,500,2026-02-30,check`, "date.csv"), /invalid ISO date/);
  assert.throws(() => importGiftCsv(state, `${header}\ngift-online-101,donor-rosa-online,Rosa Delgado,rosa@example.test,,1,2026-07-10,online`, "conflict.csv"), /conflicts/);
  assert.throws(() => importGiftCsv(state, `${header}\nwrong-identity,donor-rosa-online,Rosa Delgado,unrelated@example.test,+1-305-555-0198,100,2026-09-30,check`, "identity-conflict.csv"), /identity/);
  assert.deepEqual(state, before);
});

test("new imports create evidence-based candidates without conflating same names", () => {
  const state = createSeed();
  importGiftCsv(state, `${header}\nnew-rosa,rosa-extra,Rosa Delgado,rosa.work@example.test,,500,2026-09-30,check\nname-only,rosa-unrelated,Rosa Delgado,no-match@example.test,+1-305-555-0188,500,2026-09-30,check`, "identities.csv");
  assert.equal(state.candidates[0].donorIds.length, 4);
  assert.ok(!state.candidates[0].donorIds.includes("rosa-unrelated"));
});

test("attendance is captured once; edits recompute queue and report without duplicating rows", () => {
  const state = createSeed();
  const rowCount = state.attendance.length;
  const revision = state.revision;
  const input = { participantId: "participant-lucia", date: "2026-09-25", status: "present" as const };
  const updated = recordAttendance(state, input);
  assert.equal(state.attendance.length, rowCount);
  assert.equal(state.revision, revision + 1);
  assert.equal(getMetrics(state).find((metric) => metric.id === "attendance")!.value, 51);
  assert.ok(!getQueue(state).some((item) => item.kind === "attendance"));
  const snapshot = structuredClone(state);
  assert.equal(recordAttendance(state, input), updated);
  assert.deepEqual(state, snapshot);
  assert.ok(state.sources.some((source) => source.id === "src-attendance-participant-lucia-13" && source.values.status === "absent"));
  assert.equal(state.sources.find((source) => source.id === updated.sourceIds[0])!.values.status, "present");
  recordAttendance(state, { ...input, date: "2026-09-30" });
  assert.equal(state.attendance.length, rowCount + 1);
  assert.equal(getMetrics(state).find((metric) => metric.id === "attendance")!.value, 52);
});

test("invalid attendance capture cannot mutate records", () => {
  const state = createSeed();
  const before = structuredClone(state);
  assert.throws(() => recordAttendance(state, { participantId: "missing", date: "2026-09-30", status: "present" }), /Participant/);
  assert.throws(() => recordAttendance(state, { participantId: "participant-lucia", date: "2026-02-30", status: "present" }), /valid ISO/);
  assert.deepEqual(state, before);
});
