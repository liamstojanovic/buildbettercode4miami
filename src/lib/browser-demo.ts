import type { DemoState } from "./types";

export const browserDemo = process.env.NEXT_PUBLIC_HOSTED_DEMO === "1";
const key = "laser-focus-demo:v1";
let memory: DemoState | null = null;
let persistent = true;
let queue: Promise<unknown> = Promise.resolve();
export const storageNotice = () => persistent ? "Fictional demo · Changes saved in this browser only." : "Fictional demo · Browser storage unavailable. Changes last only while this page is open.";
function useMemory() {
  persistent = false;
  window.dispatchEvent(new Event("demo-storage-notice"));
}
function readSaved(): DemoState | null {
  if (!persistent) return memory;
  let raw: string | null;
  try { raw = localStorage.getItem(key); } catch { useMemory(); return memory; }
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !saved.state || saved.state.schemaVersion !== 1) throw new Error();
    return saved.state as DemoState;
  } catch { throw new Error("Saved demo data is incompatible. Use Reset demo to start fresh."); }
}
function save(state: DemoState) {
  memory = state;
  if (persistent) {
    try { localStorage.setItem(key, JSON.stringify({ version: 1, state })); }
    catch { useMemory(); }
  }
}
export type DemoReply = {
  version: 1; state: DemoState; status: number;
  data: unknown; download?: { contentType: string; filename: string };
};
export async function demoRequest(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<DemoReply> {
  const operation = async () => {
    signal?.throwIfAborted();
    const state = path === "/api/reset" ? null : readSaved();
    const response = await fetch("/api/demo", { method: "POST", cache: "no-store", signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: 1, state, path, method, body }) });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || `Demo request failed (${response.status}).`);
    if (result?.version !== 1 || !result.state || !Number.isInteger(result.status)) throw new Error("Invalid demo response. Please retry.");
    save(result.state);
    return result as DemoReply;
  };
  // Web Locks serializes read/request/write across all tabs for this origin.
  if (navigator.locks) return navigator.locks.request(key, { signal }, operation);
  // Without cross-tab locking, use isolated memory rather than race persistent writes.
  useMemory();
  const pending = queue.then(operation, operation);
  queue = pending.catch(() => undefined);
  return pending;
}
export function subscribeDemoStorage(callback: () => void) {
  const listener = (event: StorageEvent) => { if (event.key === key) callback(); };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}
