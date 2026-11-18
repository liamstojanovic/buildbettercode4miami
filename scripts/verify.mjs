import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";

function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${args.join(" ")} failed (${result.status ?? result.signal}).`);
}

for (const script of ["check:toolchain", "typecheck", "test", "build"]) {
  run([process.env.npm_execpath, "run", script]);
}

// Fail before making any HTTP requests if another local server owns this port.
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once("error", reject);
  probe.listen(3210, "127.0.0.1", resolve);
});
await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));

// Never reset the developer's .data/state.json or use their live API credentials.
const directory = mkdtempSync(join(tmpdir(), "laser-focus-verify-"));
const env = {
  ...process.env,
  LASER_FOCUS_STATE_FILE: join(directory, "state.json"),
  OPENAI_API_KEY: "",
  LASER_FOCUS_URL: "http://127.0.0.1:3210",
  NEXT_TELEMETRY_DISABLED: "1"
};
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3210"], { stdio: "inherit", env });
let serverError;
server.on("error", error => { serverError = error; });
const stopped = new Promise(resolve => {
  server.once("exit", resolve);
  server.once("error", resolve);
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw new Error(`Verification server exited (${server.exitCode}). Is port 3210 occupied?`);
    try {
      const response = await fetch(`${env.LASER_FOCUS_URL}/api/dashboard`, { signal: AbortSignal.timeout(2000) });
      await response.arrayBuffer();
      if (response.ok) { ready = true; break; }
    } catch { /* Retry until the server is ready. */ }
    await setTimeout(1000);
  }
  if (!ready) throw new Error("Verification server did not become ready on port 3210.");
  run(["scripts/smoke.mjs"], env);
} finally {
  if (server.exitCode === null && !serverError) {
    server.kill("SIGTERM");
    const forceStop = globalThis.setTimeout(() => server.kill("SIGKILL"), 10000);
    try { await stopped; } finally { clearTimeout(forceStop); }
  }
  rmSync(directory, { recursive: true, force: true });
}
