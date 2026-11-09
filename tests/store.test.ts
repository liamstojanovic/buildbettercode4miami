import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { mutateState, readState, resetState } from "../src/lib/store";
import { recordAttendance } from "../src/lib/domain";

test("file store survives fresh-process reads, rolls back failed transactions, and resets deterministically", () => {
  const directory = mkdtempSync(join(tmpdir(), "laser-focus-store-test-"));
  const file = join(directory, "state.json");
  const original = process.env.LASER_FOCUS_STATE_FILE;
  process.env.LASER_FOCUS_STATE_FILE = file;
  try {
    const seeded = readState();
    assert.equal(seeded.revision, 1);
    const initial = readFileSync(file, "utf8");
    assert.throws(() => mutateState((state) => { state.revision = 500; state.donors = []; throw new Error("abort mutation"); }), /abort mutation/);
    assert.equal(readFileSync(file, "utf8"), initial);
    assert.throws(() => mutateState((state) => { state.revision = 600; return Promise.resolve("invalid async transaction"); }), /must be synchronous/);
    assert.equal(readFileSync(file, "utf8"), initial);
    mutateState((state) => recordAttendance(state, { participantId: "participant-lucia", date: "2026-09-25", status: "present" }));
    const latest = readState();
    assert.equal(latest.revision, 2);
    assert.equal(latest.attendance.find((item) => item.participantId === "participant-lucia" && item.date === "2026-09-25")!.status, "present");
    const moduleUrl = pathToFileURL(resolve("src/lib/store.ts")).href;
    const code = `const module = await import(${JSON.stringify(moduleUrl)}); const s = (module.readState ?? module.default.readState)(); process.stdout.write(JSON.stringify({ revision: s.revision, status: s.attendance.find(a => a.participantId === 'participant-lucia' && a.date === '2026-09-25').status }));`;
    const freshProcess = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", code], { cwd: process.cwd(), env: { ...process.env, LASER_FOCUS_STATE_FILE: file }, encoding: "utf8" });
    assert.deepEqual(JSON.parse(freshProcess), { revision: 2, status: "present" });
    assert.deepEqual(readdirSync(directory), ["state.json"], "atomic writes must not leave temporary files");
    resetState();
    assert.deepEqual(readState(), seeded);
  } finally {
    if (original === undefined) delete process.env.LASER_FOCUS_STATE_FILE;
    else process.env.LASER_FOCUS_STATE_FILE = original;
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});
