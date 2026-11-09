import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { DraftGenerationError } from "../src/lib/agent";
import { createSheetsBridge, type SheetsBridgeOptions } from "../src/lib/sheets-bridge";
import { executeSheetsCommand, sheetsDashboard } from "../src/lib/sheets";
import type { SheetsSelection, SheetsWorkspace } from "../src/lib/sheets-types";

const token = "fake_bridge_test_token_not_a_real_credential_123";
const workbookId = "workbook-test-123456789";
const rows = JSON.parse(readFileSync("integrations/google-sheets/demo-gifts.json", "utf8"));
const selection: SheetsSelection = { workbookId, sheetId: 12, sheetName: "Demo gifts", a1: "A1:H8", startRow: 1, startColumn: 1, values: rows, formulas: rows.map((row: unknown[]) => row.map(() => "")) };
const mapping = { gift_id: 0, donor_id: 1, name: 2, email: 3, phone: 4, amount: 5, date: 6, channel: 7 };
type HttpResult = { status: number; data: any; text: string; headers: Headers };
type Execute = NonNullable<SheetsBridgeOptions["execute"]>;

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function stop(server: Server) {
  server.closeIdleConnections();
  await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
}

async function isolated(operation: (bridge: { origin: () => string; command: (input: Record<string, unknown>, options?: { authorization?: string | null; headers?: Record<string, string> }) => Promise<HttpResult>; request: (path: string, options?: RequestInit) => Promise<HttpResult>; directory: string; restart: () => Promise<void> }) => Promise<void>, execute?: Execute) {
  const directory = mkdtempSync(join(tmpdir(), "laser-focus-bridge-test-"));
  let server = createSheetsBridge({ token, directory, execute });
  const start = async () => { server.listen(0, "127.0.0.1"); await once(server, "listening"); };
  await start();
  const origin = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = async (path: string, options: RequestInit = {}): Promise<HttpResult> => {
    const response = await fetch(origin() + path, options);
    const text = await response.text();
    return { status: response.status, data: JSON.parse(text), text, headers: response.headers };
  };
  const command = async (input: Record<string, unknown>, options: { authorization?: string | null; headers?: Record<string, string> } = {}) => request("/v1/command", {
    method: "POST", headers: { "Content-Type": "application/json", ...(options.authorization === null ? {} : { Authorization: options.authorization ?? `Bearer ${token}` }), ...options.headers }, body: JSON.stringify({ workbookId, ...input }),
  });
  try { await operation({ origin, command, request, directory, restart: async () => { await stop(server); server = createSheetsBridge({ token, directory, execute }); await start(); } }); }
  finally {
    await stop(server);
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
}

test("Sheets bridge exposes minimal health only and rejects unauthorized or browser-origin commands", () => isolated(async bridge => {
  const health = await bridge.request("/health");
  assert.deepEqual(health.data, { service: "laser-focus-sheets", status: "ok" });
  assert.equal(health.headers.get("cache-control"), "no-store");
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await bridge.command({ action: "status" }, { authorization: null })).status, 401);
  assert.equal((await bridge.command({ action: "status" }, { authorization: "Bearer wrong-token" })).status, 401);
  assert.equal((await bridge.command({ action: "status" }, { headers: { Origin: "https://docs.google.com" } })).status, 403);
  for (const path of ["/api/dashboard", "/api/notes/private", "/api/reset", "/.env", "/v1/command/extra"]) assert.equal((await bridge.request(path)).status, 404);
  assert.equal((await bridge.request("/v1/command")).status, 405);
  assert.deepEqual(readdirSync(bridge.directory), []);
}));

test("Sheets bridge rejects malformed bodies, oversized requests and invalid workbook IDs before persistence", () => isolated(async bridge => {
  const auth = { Authorization: `Bearer ${token}` };
  assert.equal((await bridge.request("/v1/command", { method: "POST", headers: auth, body: "not-json" })).status, 415);
  assert.equal((await bridge.request("/v1/command", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: "{bad" })).status, 400);
  assert.equal((await bridge.request("/v1/command", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: "[]" })).status, 400);
  assert.equal((await bridge.command({ action: "unknown" })).status, 400);
  for (const id of ["short", "../outside-directory", "..\\outside-directory", "x".repeat(201), 42]) assert.equal((await bridge.command({ action: "status", workbookId: id })).status, 400);
  assert.equal((await bridge.command({ action: "status", padding: "x".repeat(1_000_001) })).status, 413);
  assert.deepEqual(readdirSync(bridge.directory), []);
}));

test("Sheets bridge responds 413 to chunked bodies beyond the limit", () => isolated(async bridge => {
  const result = await new Promise<{ status: number; text: string }>((resolveResult, reject) => {
    const request = httpRequest(bridge.origin() + "/v1/command", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }, response => {
      let text = ""; response.setEncoding("utf8"); response.on("data", chunk => { text += chunk; });
      response.on("end", () => resolveResult({ status: response.statusCode!, text }));
    });
    request.on("error", reject);
    request.write(' {"padding":"');
    for (let index = 0; index < 17; index++) request.write("x".repeat(65_536));
    request.end('"}');
  });
  assert.equal(result.status, 413);
  assert.match(result.text, /one-megabyte/);
}));

test("full bridge workflow imports, merges, blocks wrong claims, approves and exports across restart", () => isolated(async bridge => {
  const initial = await bridge.command({ action: "status" });
  assert.equal(initial.status, 200); assert.equal(initial.data.dashboard.giftCount, 0);
  assert.ok(!initial.text.includes("PRIVATE_SENTINEL")); assert.ok(!initial.text.includes('"notes"'));
  const preview = await bridge.command({ action: "preview", selection, mapping, amountUnit: "dollars" });
  assert.equal(preview.status, 200); assert.equal(preview.data.preview.inserted, 7);
  const imported = await bridge.command({ action: "import", selection, mapping, amountUnit: "dollars", previewHash: preview.data.preview.previewHash });
  assert.equal(imported.status, 200); assert.equal(imported.data.dashboard.giftCount, 7);
  const merged = await bridge.command({ action: "merge", selection, candidateId: imported.data.dashboard.candidates[0].id, decision: "approve" });
  assert.equal(merged.status, 200);
  assert.equal(merged.data.dashboard.metrics.find((metric: any) => metric.id === "giving").value, 635);
  assert.equal(merged.data.dashboard.metrics.find((metric: any) => metric.id === "donors").value, 3);
  const generated = await bridge.command({ action: "generate", selection, mode: "demo", requestId: "report-request" });
  assert.equal(generated.status, 200);
  let draft = generated.data.draft;
  const wrong = draft.claims.map((claim: any) => claim.metricId === "giving" ? { ...claim, value: 999 } : claim);
  const edited = await bridge.command({ action: "edit", selection, draftId: draft.id, revision: draft.revision, claims: wrong });
  draft = edited.data.draft;
  assert.equal((await bridge.command({ action: "approve", selection, draftId: draft.id, revision: draft.revision })).status, 422);
  const corrected = await bridge.command({ action: "edit", selection, draftId: draft.id, revision: draft.revision, claims: generated.data.draft.claims });
  draft = corrected.data.draft;
  assert.equal((await bridge.command({ action: "approve", selection, draftId: draft.id, revision: draft.revision })).status, 200);
  await bridge.restart();
  const exported = await bridge.command({ action: "export", selection, draftId: draft.id, revision: draft.revision });
  assert.equal(exported.status, 200); assert.match(exported.data.export.text, /\$635\.00/);
  assert.equal(exported.data.export.approvalDigest.length, 64);
  const other = await bridge.command({ action: "status", workbookId: "separate-workbook-12345" });
  assert.equal(other.data.dashboard.giftCount, 0);
  assert.equal(readdirSync(bridge.directory).filter(file => file.endsWith(".json")).length, 2);
  assert.ok(readdirSync(bridge.directory).every(file => /^[a-f0-9]{64}\.json$/.test(file)));
}));

test("workbook locks reject competing requests without blocking another workbook or leaking ownership", async () => {
  const entered = deferred(); const release = deferred();
  const execute: Execute = async (workspace, raw) => {
    if ((raw as { action: string }).action === "generate") { entered.resolve(); await release.promise; }
    return { dashboard: sheetsDashboard(workspace) };
  };
  await isolated(async bridge => {
    const pending = bridge.command({ action: "generate", mode: "demo" });
    try {
      await entered.promise;
      assert.equal((await bridge.command({ action: "status" })).status, 409);
      assert.equal((await bridge.command({ action: "reset" })).status, 409);
      assert.equal((await bridge.command({ action: "status", workbookId: "other-workbook-12345" })).status, 200);
      assert.equal((await bridge.command({ action: "status" })).status, 409, "a rejected request must not release another request's lock");
    } finally { release.resolve(); await pending; }
    assert.equal((await bridge.command({ action: "status" })).status, 200);
  }, execute);
});

test("one live generation runs globally while separate non-live work remains available", async () => {
  const entered = deferred(); const release = deferred();
  const execute: Execute = async (workspace, raw) => {
    const command = raw as { mode?: string };
    if (command.mode === "live") { entered.resolve(); await release.promise; }
    return { dashboard: sheetsDashboard(workspace) };
  };
  await isolated(async bridge => {
    const pending = bridge.command({ action: "generate", mode: "live" });
    try {
      await entered.promise;
      assert.equal((await bridge.command({ action: "generate", mode: "live", workbookId: "second-workbook-12345" })).status, 409);
      assert.equal((await bridge.command({ action: "status", workbookId: "second-workbook-12345" })).status, 200);
      assert.equal((await bridge.command({ action: "generate", mode: "live", workbookId: "third-workbook-12345" })).status, 409, "failed contender cannot clear active live gate");
    } finally { release.resolve(); await pending; }
    assert.equal((await bridge.command({ action: "generate", mode: "live", workbookId: "second-workbook-12345" })).status, 200);
  }, execute);
});

test("failed generation checkpoints preserve budget and known usage after a bridge restart", () => isolated(async bridge => {
  const preview = await bridge.command({ action: "preview", selection, mapping, amountUnit: "dollars" });
  await bridge.command({ action: "import", selection, mapping, amountUnit: "dollars", previewHash: preview.data.preview.previewHash });
  const failed = await bridge.command({ action: "generate", selection, mode: "live", requestId: "failed-once" });
  assert.equal(failed.status, 502);
  await bridge.restart();
  const status = await bridge.command({ action: "status" });
  assert.equal(status.data.dashboard.runs[0].inputTokens, 91);
  assert.equal(status.data.dashboard.runs[0].outputTokens, 13);
  assert.equal(status.data.dashboard.runs[0].usageKnown, true);
  assert.equal(status.data.dashboard.runs[0].status, "failed");
  assert.equal((await bridge.command({ action: "generate", selection, mode: "live", requestId: "failed-once" })).status, 409);
  const file = join(bridge.directory, createHash("sha256").update(workbookId).digest("hex") + ".json");
  const saved = JSON.parse(readFileSync(file, "utf8")) as SheetsWorkspace;
  assert.equal(saved.generationRequests.length, 1);
  assert.equal(saved.generationRequests[0].status, "failed");
}, (workspace, command, dependencies) => executeSheetsCommand(workspace, command, { ...dependencies, prepareDraft: async () => { throw new DraftGenerationError("Provider could not finish this draft.", { id: "failure-run", mode: "live", status: "failed", model: "offline-test", events: [], inputTokens: 91, outputTokens: 13, usageKnown: true, maxTurns: 3, durationMs: 1 }); } })));

test("corrupt saved workspace identities fail closed without disclosing paths or records", () => isolated(async bridge => {
  await bridge.command({ action: "status" });
  const file = join(bridge.directory, createHash("sha256").update(workbookId).digest("hex") + ".json");
  const saved = JSON.parse(readFileSync(file, "utf8")); saved.workbookId = "different-workbook";
  writeFileSync(file, JSON.stringify(saved));
  const failed = await bridge.command({ action: "status" });
  assert.equal(failed.status, 500);
  assert.ok(!failed.text.includes(bridge.directory));
  assert.ok(!failed.text.includes("different-workbook"));
}));
