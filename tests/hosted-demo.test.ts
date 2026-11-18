import assert from "node:assert/strict";
import { test } from "node:test";
import { handleHostedDemo } from "../src/lib/hosted-demo";
import { createSeed } from "../src/lib/seed";
import { withDemoState, readState, mutateState } from "../src/lib/store";
import type { DemoState } from "../src/lib/types";

async function call(path: string, method = "GET", body?: unknown, state: DemoState | null = null) {
  const response = await handleHostedDemo(new Request("https://demo.example/api/demo", {
    method: "POST", headers: { "Content-Type": "application/json", origin: "https://demo.example" },
    body: JSON.stringify({ version: 1, path, method, body, state }),
  }));
  return { response, reply: await response.json() };
}

test("hosted requests isolate concurrent state and never require disk", async () => {
  const a = createSeed(); a.revision = 20;
  const b = createSeed(); b.revision = 40;
  const results = await Promise.all([a, b].map(state => withDemoState(state, async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    mutateState(current => { current.revision++; });
    return readState().revision;
  })));
  assert.deepEqual(results.map(item => item.result), [21, 41]);
  assert.equal(a.revision, 20);
});

test("hosted report generation, approval, export, replay and browser state roundtrip", async context => {
  context.mock.method(globalThis, "fetch", async () => { throw new Error("Hosted demo must not contact external services."); });
  const first = await call("/api/dashboard");
  assert.equal(first.response.status, 200);
  assert.equal(first.reply.status, 200);
  assert.equal(first.response.headers.get("cache-control"), "no-store");
  const generated = await call("/api/drafts", "POST", { kind: "report", mode: "demo" }, first.reply.state);
  assert.equal(generated.reply.status, 200);
  const draft = generated.reply.data.draft;
  const blocked = await call(`/api/drafts/${draft.id}/export`, "GET", undefined, generated.reply.state);
  assert.equal(blocked.reply.status, 409);
  const approved = await call(`/api/drafts/${draft.id}/approve`, "POST", { revision: 1 }, generated.reply.state);
  assert.equal(approved.reply.status, 200);
  const exported = await call(`/api/drafts/${draft.id}/export`, "GET", undefined, approved.reply.state);
  assert.equal(exported.reply.status, 200);
  assert.match(exported.reply.data, /Laser Focus/);
  assert.equal(exported.reply.download.filename, "laser-focus-approved-draft.txt");
  const replay = await call(`/api/runs/${draft.runId}/replay`, "GET", undefined, exported.reply.state);
  assert.equal(replay.reply.data.integrity.input, "verified");
  const fresh = await call("/api/dashboard");
  assert.equal(fresh.reply.state.drafts.length, 0);
  const reset = await call("/api/reset", "POST", undefined, exported.reply.state);
  assert.equal(reset.reply.state.drafts.length, 0);
});

test("hosted transport rejects live requests even with credentials", async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldMode = process.env.LASER_FOCUS_HOSTED_DEMO;
  process.env.OPENAI_API_KEY = "must-never-be-used";
  process.env.LASER_FOCUS_HOSTED_DEMO = "1";
  try {
    const current = await call("/api/dashboard");
    assert.equal(current.reply.data.liveAvailable, false);
    const live = await call("/api/drafts", "POST", { kind: "report", mode: "live" });
    assert.equal(live.response.status, 403);
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    if (oldMode === undefined) delete process.env.LASER_FOCUS_HOSTED_DEMO; else process.env.LASER_FOCUS_HOSTED_DEMO = oldMode;
  }
});

test("invalid storage can reset; malformed requests, large bodies and foreign origins fail", async () => {
  const bad = { schemaVersion: 2 } as unknown as DemoState;
  assert.equal((await call("/api/dashboard", "GET", undefined, bad)).response.status, 400);
  assert.equal((await call("/api/reset", "POST", undefined, bad)).reply.state.schemaVersion, 1);
  for (const path of ["/api/demo", "/api/../reset", "https://external.example/"]) {
    assert.equal((await call(path)).response.status, 400);
  }
  const large = await call("/api/import", "POST", { csv: "x".repeat(3_000_000) });
  assert.equal(large.response.status, 413);
  const foreign = await handleHostedDemo(new Request("https://demo.example/api/demo", { method: "POST", headers: { origin: "https://other.example" } }));
  assert.equal(foreign.status, 403);
});
