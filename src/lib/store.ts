import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createSeed } from "./seed";
import type { DemoState } from "./types";

const filename = () => process.env.LASER_FOCUS_STATE_FILE || join(process.cwd(), ".data", "state.json");

function atomicReplace(temp: string, path: string) {
  // Windows indexers/scanners can briefly hold the destination without delete-sharing.
  // Retry the atomic rename, never delete the committed state to make room for it.
  for (let attempt = 0; ; attempt++) {
    try { renameSync(temp, path); return; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform !== "win32" || !["EPERM", "EBUSY", "EACCES"].includes(code ?? "") || attempt >= 5) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (attempt + 1));
    }
  }
}

// Synchronous read-modify-rename is serialized within ONE Node process. Not a multi-host database.
export function readState(): DemoState {
  const path = filename();
  if (!existsSync(path)) saveState(createSeed());
  return JSON.parse(readFileSync(path, "utf8")) as DemoState;
}

function saveState(state: DemoState) {
  const path = filename();
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify(state, null, 2), { encoding: "utf8", flag: "wx" });
    atomicReplace(temp, path);
  } finally { if (existsSync(temp)) unlinkSync(temp); }
}

export function mutateState<T>(operation: (state: DemoState) => T): T {
  const state = readState();
  const result = operation(state);
  if (result instanceof Promise) throw new Error("State transactions must be synchronous.");
  saveState(state);
  return result;
}

export function resetState(guard?: (state: DemoState) => void) {
  if (guard) guard(readState());
  const state = createSeed();
  saveState(state);
  return state;
}
