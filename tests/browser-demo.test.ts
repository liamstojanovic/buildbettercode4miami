import assert from "node:assert/strict";
import { test } from "node:test";
import { demoRequest, storageNotice, subscribeDemoStorage } from "../src/lib/browser-demo";
import { handleHostedDemo } from "../src/lib/hosted-demo";

test("browser transport persists, serializes operations, isolates storage, recovers corruption and falls back safely", async context => {
  const original = new Map(["window", "localStorage", "navigator"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const events = new EventTarget();
  let raw: string | null = null;
  let quota = false;
  let notices = 0;
  let lockQueue: Promise<unknown> = Promise.resolve();
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => { if (quota) throw new Error("Quota exceeded"); raw = value; },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: events });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: {
    request: (_name: string, options: { signal?: AbortSignal }, callback: () => Promise<unknown>) => {
      const next = lockQueue.then(() => { options.signal?.throwIfAborted(); return callback(); });
      lockQueue = next.catch(() => undefined);
      return next;
    },
  } } });
  events.addEventListener("demo-storage-notice", () => notices++);
  context.mock.method(globalThis, "fetch", async (_url: string | URL | Request, options?: RequestInit) => handleHostedDemo(new Request("https://demo.example/api/demo", options)));
  try {
    const first = await demoRequest("/api/dashboard", "GET");
    assert.equal(first.status, 200);
    assert.equal(JSON.parse(raw!).version, 1);
    await Promise.all([1, 2].map(() => demoRequest("/api/drafts", "POST", { kind: "report", mode: "demo" })));
    const reloaded = await demoRequest("/api/dashboard", "GET");
    assert.equal(reloaded.state.drafts.length, 2);
    const profileA = raw;
    raw = null;
    assert.equal((await demoRequest("/api/dashboard", "GET")).state.drafts.length, 0);
    raw = profileA;
    assert.equal((await demoRequest("/api/dashboard", "GET")).state.drafts.length, 2);
    const beforeFailure = raw;
    await assert.rejects(demoRequest("/api/drafts", "POST", { kind: "report", mode: "live" }), /disabled/);
    assert.equal(raw, beforeFailure);
    raw = "broken json";
    await assert.rejects(demoRequest("/api/dashboard", "GET"), /Reset demo/);
    assert.equal((await demoRequest("/api/reset", "POST")).state.drafts.length, 0);
    let refreshed = 0;
    const unsubscribe = subscribeDemoStorage(() => refreshed++);
    const changed = new Event("storage");
    Object.defineProperty(changed, "key", { value: "laser-focus-demo:v1" });
    events.dispatchEvent(changed);
    assert.equal(refreshed, 1);
    unsubscribe();
    const aborted = new AbortController(); aborted.abort();
    await assert.rejects(demoRequest("/api/dashboard", "GET", undefined, aborted.signal));
    quota = true;
    await demoRequest("/api/drafts", "POST", { kind: "report", mode: "demo" });
    assert.match(storageNotice(), /storage unavailable/);
    assert.equal(notices, 1);
    assert.equal((await demoRequest("/api/dashboard", "GET")).state.drafts.length, 1);
  } finally {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
