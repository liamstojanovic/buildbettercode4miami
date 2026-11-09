import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const base = process.env.LASER_FOCUS_URL || "http://127.0.0.1:3210";
const origin = new URL(base);
if (!["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)) throw new Error("Smoke tests reset state and may only target a local demo.");
let checks = 0;
async function request(path, method = "GET", body, expected = 200, extraHeaders = {}) {
  const response = await fetch(`${base}/api/${path}`, {
    method, headers: { Origin: origin.origin, ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(70_000),
  });
  const text = await response.text();
  assert.equal(response.status, expected, `${method} ${path}: ${text.slice(0, 500)}`);
  checks++;
  return response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : text;
}
function assertPublic(value) {
  assert.equal(JSON.stringify(value).includes("PRIVATE_SENTINEL"), false, "Private note text must not enter public evidence or dashboards.");
}
function nextDay(date, days = 1) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
async function inspectReplay(draft, evidenceCurrent = true) {
  const replay = await request(`runs/${draft.runId}/replay`);
  assert.equal(replay.replay, "recorded");
  assert.equal(replay.draftId, draft.id);
  assert.equal(replay.evidenceCurrent, evidenceCurrent);
  assert.deepEqual(replay.integrity, { input: "verified", output: "verified" });
  assertPublic(replay);
  return replay;
}

try {
  for (const path of ["/", "/inbox", "/grants", "/counseling"]) {
    const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 200, `Direct route ${path}`);
    const html = await response.text();
    if (path === "/") {
      // The landing page is the full-screen welcome chooser: no shell chrome,
      // but it must link to every section so it can never become a dead end.
      assert.match(html, /href="\/inbox"/);
      assert.match(html, /href="\/grants"/);
      assert.match(html, /href="\/counseling"/);
    } else {
      assert.match(html, /SYNTHETIC DEMO/);
      assert.match(html, /aria-label="Workspace"/);
    }
    assertPublic(html);
    checks++;
  }
  await request("reset", "POST");
  const crossOrigin = await fetch(`${base}/api/reset`, { method: "POST", headers: { Origin: "https://unrelated.example" }, signal: AbortSignal.timeout(10_000) });
  assert.equal(crossOrigin.status, 403);
  checks++;
  const initial = await request("dashboard");
  assertPublic(initial);
  const giving = initial.metrics.find(metric => metric.id === "giving").value;
  const donorCount = initial.metrics.find(metric => metric.id === "donors").value;
  const merged = await request("merge", "POST", { candidateId: initial.state.candidates[0].id, decision: "approve" });
  assert.equal(merged.metrics.find(metric => metric.id === "giving").value, giving);
  assert.equal(merged.metrics.find(metric => metric.id === "donors").value, donorCount - 2);
  assert.equal(merged.state.gifts.length, initial.state.gifts.length);

  const reportRequest = { kind: "report", mode: "demo" };
  const requestHeaders = { "Idempotency-Key": "smoke-report-request" };
  const created = await request("drafts", "POST", reportRequest, 200, requestHeaders);
  assert.equal(created.replayed, false);
  const retried = await request("drafts", "POST", reportRequest, 200, requestHeaders);
  assert.equal(retried.replayed, true);
  assert.equal(retried.draft.id, created.draft.id);
  assert.equal(retried.dashboard.state.runs.length, created.dashboard.state.runs.length);
  assert.equal(retried.dashboard.state.drafts.length, created.dashboard.state.drafts.length);
  await request("drafts", "POST", { kind: "followup", queueItemId: merged.queue[0].id, mode: "demo" }, 409, requestHeaders);
  let { draft } = created;
  const originalReplay = await inspectReplay(draft);
  const wrong = structuredClone(draft.claims); wrong[0].value += 1;
  ({ draft } = await request(`drafts/${draft.id}`, "PATCH", { revision: draft.revision, claims: wrong }));
  const blocked = await request(`drafts/${draft.id}/approve`, "POST", { revision: draft.revision }, 422);
  assert(blocked.issues.some(issue => issue.code === "claim_mismatch"));
  ({ draft } = await request(`drafts/${draft.id}`, "PATCH", { revision: draft.revision, claims: merged.metrics.map(metric => ({ metricId: metric.id, value: metric.value })) }));
  const approved = await request(`drafts/${draft.id}/approve`, "POST", { revision: draft.revision });
  const approvedAgain = await request(`drafts/${draft.id}/approve`, "POST", { revision: draft.revision });
  assert.deepEqual(approvedAgain.draft, approved.draft);
  assert.equal(approvedAgain.dashboard.state.audit.length, approved.dashboard.state.audit.length);
  const unchanged = await request(`drafts/${draft.id}`, "PATCH", { revision: draft.revision, narrative: draft.narrative, claims: draft.claims });
  assert.equal(unchanged.draft.status, "approved");
  assert.equal(unchanged.draft.revision, draft.revision);
  assert.equal(unchanged.dashboard.state.audit.length, approved.dashboard.state.audit.length);
  assert.match(await request(`drafts/${draft.id}/export`), /Quarter giving/);
  assert.deepEqual((await inspectReplay(draft)).run, originalReplay.run, "Review edits cannot rewrite the recorded model/template run.");

  const attendanceTask = merged.queue.find(item => item.kind === "attendance");
  assert(attendanceTask);
  const followup = await request("drafts", "POST", { kind: "followup", queueItemId: attendanceTask.id, mode: "demo" });
  await request(`drafts/${followup.draft.id}/approve`, "POST", { revision: followup.draft.revision });
  const receipt = await request(`drafts/${followup.draft.id}/send`, "POST", { revision: followup.draft.revision });
  assert.equal(receipt.message.transport, "simulation");
  assert.equal(receipt.message.status, "simulated_sent");
  assert.equal(receipt.message.recipient, merged.state.participants.find(person => person.id === attendanceTask.entityId).guardian);
  assert.equal(receipt.message.body, followup.draft.narrative);
  assert.doesNotMatch(receipt.message.body, /Source references|src-|Record revision|Fictional demonstration/);
  const repeat = await request(`drafts/${followup.draft.id}/send`, "POST", { revision: followup.draft.revision });
  assert.deepEqual(repeat.message, receipt.message);
  assert.equal(repeat.dashboard.state.audit.length, receipt.dashboard.state.audit.length);
  await inspectReplay(followup.draft);

  const grant = merged.state.grants[0];
  let application = await request("drafts", "POST", { kind: "application", grantId: grant.id, mode: "demo" });
  await request(`drafts/${application.draft.id}/approve`, "POST", { revision: application.draft.revision });
  const answer = await request(`drafts/${application.draft.id}/export`);
  assert(answer.trim().split(/\s+/).length <= grant.wordLimit);
  application = await request(`drafts/${application.draft.id}`, "PATCH", { revision: application.draft.revision, narrative: "community ".repeat(grant.wordLimit) });
  const lengthBlocked = await request(`drafts/${application.draft.id}/approve`, "POST", { revision: application.draft.revision }, 422);
  assert(lengthBlocked.issues.some(issue => issue.code === "application_word_limit"));

  const { ledger: originalLedger } = await request(`grants/${grant.id}/ledger`);
  assert(originalLedger.categories.some(category => category.status === "over_budget"));
  assert(originalLedger.disallowed.length > 0);
  assert(originalLedger.outsidePeriod.length > 0);
  const category = originalLedger.categories.find(item => item.name === "materials") ?? originalLedger.categories[0];
  const expense = { id: "smoke-expense", date: initial.state.asOf, category: category.name, amountCents: 500, description: "Smoke test program supplies" };
  const entered = await request(`grants/${grant.id}/expenses`, "POST", expense);
  assert.equal(entered.inserted, true);
  const repeatedExpense = await request(`grants/${grant.id}/expenses`, "POST", expense);
  assert.equal(repeatedExpense.inserted, false);
  assert.deepEqual(repeatedExpense.expense, entered.expense);
  assert.equal(repeatedExpense.dashboard.state.revision, entered.dashboard.state.revision);
  assert.equal(repeatedExpense.dashboard.state.audit.length, entered.dashboard.state.audit.length);
  await request(`grants/${grant.id}/expenses`, "POST", { ...expense, amountCents: 501 }, 400);
  await request(`grants/${grant.id}/expenses`, "POST", { ...expense, id: "smoke-fractional", amountCents: 1.5 }, 400);
  await request(`grants/${grant.id}/expenses`, "POST", { ...expense, id: "smoke-negative", amountCents: -1 }, 400);
  const upcoming = { ...expense, id: "smoke-upcoming", date: nextDay(initial.state.asOf), amountCents: 900 };
  assert(upcoming.date <= grant.fiscalEnd);
  await request(`grants/${grant.id}/expenses`, "POST", upcoming);
  const outside = { ...expense, id: "smoke-outside", date: nextDay(grant.fiscalStart, -1), amountCents: 700 };
  await request(`grants/${grant.id}/expenses`, "POST", outside);
  const { ledger } = await request(`grants/${grant.id}/ledger`);
  assert.equal(ledger.categories.find(item => item.name === category.name).spentCents, category.spentCents + expense.amountCents);
  assert(ledger.upcoming.some(item => item.id === upcoming.id));
  assert(ledger.outsidePeriod.some(item => item.id === outside.id));
  assert(!ledger.upcoming.some(item => item.id === outside.id));
  await request(`drafts/${draft.id}/export`); // Unrelated ledger changes preserve report approval.

  const opened = await request(`notes/${initial.state.notes[0].id}`);
  const { note } = opened;
  assert.match(note.privateDetail, /PRIVATE_SENTINEL/);
  assert.match(note.contentHash, /^[a-f0-9]{64}$/);
  assertPublic(opened.dashboard);
  const preview = await request("disclosures", "POST", { noteId: note.id, grantId: note.grantId });
  assertPublic(preview);
  await request(`disclosures/${preview.disclosure.id}/approve`, "POST", { payloadHash: preview.disclosure.payloadHash });
  assert.deepEqual(await request(`disclosures/${preview.disclosure.id}/export`), preview.disclosure.payload);
  const nonpayable = initial.state.notes.find(item => !item.payable);
  await request("disclosures", "POST", { noteId: nonpayable.id, grantId: nonpayable.grantId }, 400);
  const notePatch = { goal: note.goal, progress: "Family practiced a different activity.", privateDetail: note.privateDetail, durationMinutes: note.durationMinutes, expectedNoteHash: note.contentHash };
  const saved = await request(`notes/${note.id}`, "PATCH", notePatch);
  assert.notEqual(saved.note.contentHash, note.contentHash);
  await request(`notes/${note.id}`, "PATCH", { ...notePatch, progress: "An old editor must not overwrite the new note." }, 400);
  const repeatedNote = await request(`notes/${note.id}`, "PATCH", { ...notePatch, expectedNoteHash: saved.note.contentHash });
  assert.equal(repeatedNote.dashboard.state.revision, saved.dashboard.state.revision);
  assert.equal(repeatedNote.dashboard.state.audit.length, saved.dashboard.state.audit.length);
  await request(`disclosures/${preview.disclosure.id}/export`, "GET", undefined, 400);
  await request(`drafts/${draft.id}/export`); // Scoped report evidence excludes private counseling edits.
  const scopedDashboard = await request("dashboard");
  assertPublic(scopedDashboard);
  assert.equal(scopedDashboard.queue.find(item => item.id === attendanceTask.id).status, "approved");
  await inspectReplay(draft);
  assert.deepEqual((await request(`drafts/${followup.draft.id}/send`, "POST", { revision: followup.draft.revision })).message, receipt.message);

  const csv = readFileSync(new URL("../public/samples/gifts.csv", import.meta.url), "utf8");
  const imported = await request("import", "POST", { csv, sourceName: "gifts.csv" });
  assert(imported.inserted > 0);
  const again = await request("import", "POST", { csv, sourceName: "gifts.csv" });
  assert.equal(again.inserted, 0);
  assert.equal(again.skipped, imported.inserted);
  assert.equal(again.dashboard.state.revision, imported.dashboard.state.revision);
  await request(`drafts/${draft.id}/export`, "GET", undefined, 422);
  await inspectReplay(draft, false);
  const refreshed = await request("drafts", "POST", { kind: "report", mode: "demo" });
  await request(`drafts/${refreshed.draft.id}/approve`, "POST", { revision: refreshed.draft.revision });
  const attendance = initial.state.attendance.find(item => item.status === "absent");
  await request("attendance", "POST", { participantId: attendance.participantId, date: attendance.date, status: "present" });
  await request(`drafts/${refreshed.draft.id}/export`, "GET", undefined, 422);
  await request(`drafts/${followup.draft.id}/send`, "POST", { revision: followup.draft.revision }, 422);
  const current = await request("dashboard");
  assert.equal(current.state.attendance.length, initial.state.attendance.length);
  assert(!current.queue.some(item => item.id === attendanceTask.id));
  assertPublic(current);

  if (process.argv.includes("--live")) {
    assert.equal(current.liveAvailable, true, "Live verification requires the isolated server's OpenAI configuration.");
    const liveTask = current.queue.find(item => item.kind === "monthly") ?? current.queue[0];
    assert(liveTask, "A current follow-up is required for live verification.");
    const liveRequests = [
      { kind: "report", mode: "live" },
      { kind: "application", grantId: grant.id, mode: "live" },
      { kind: "followup", queueItemId: liveTask.id, mode: "live" },
    ];
    for (const input of liveRequests) {
      const live = await request("drafts", "POST", input, 200, { "Idempotency-Key": `smoke-live-${input.kind}` });
      assert.equal(live.draft.mode, "live");
      assert.equal(live.draft.kind, input.kind);
      const { run } = await inspectReplay(live.draft);
      assert.equal(run.mode, "live");
      assert.equal(run.status, "completed");
      assert(run.attempts >= 1);
      assert(run.events.some(event => event.action === "evidence_read"));
      assert(run.events.some(event => event.action === "model_completed"));
      assert(Number.isSafeInteger(run.inputTokens) && run.inputTokens >= 0);
      assert(Number.isSafeInteger(run.outputTokens) && run.outputTokens >= 0);
      if (run.usageKnown === true) {
        assert(run.inputTokens > 0 && run.outputTokens > 0);
        console.log(`Live ${input.kind}: ${run.model}, ${run.inputTokens} input / ${run.outputTokens} output tokens (provider usage verified).`);
      } else {
        console.warn(`Live ${input.kind}: ${run.model}; provider usage is incomplete or unavailable. Recorded ${run.inputTokens} input / ${run.outputTokens} output tokens are not a verified total.`);
      }
      await request(`drafts/${live.draft.id}/approve`, "POST", { revision: live.draft.revision });
      const exported = await request(`drafts/${live.draft.id}/export`);
      if (input.kind === "application") assert(exported.trim().split(/\s+/).length <= grant.wordLimit);
      if (input.kind === "followup") {
        const delivered = await request(`drafts/${live.draft.id}/send`, "POST", { revision: live.draft.revision });
        assert.equal(delivered.message.body, live.draft.narrative);
        assert.equal(delivered.message.transport, "simulation");
      }
      assertPublic(live.dashboard);
    }
  }
  assertPublic(await request("dashboard"));
} finally {
  try { await request("reset", "POST"); }
  catch (error) { console.warn(`Best-effort smoke cleanup could not reset the isolated demo: ${error.message}`); }
}
console.log(`Passed ${checks} HTTP checks: scoped approvals, recorded replay, idempotency, guardian follow-up simulation, grant limits, expense ledger, private disclosures, imports, attendance, and reset.`);
