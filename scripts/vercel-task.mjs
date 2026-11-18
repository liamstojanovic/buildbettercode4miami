import { spawnSync } from "node:child_process";
const task = process.argv[2];
if (!["install", "build"].includes(task)) throw new Error("Expected install or build.");
if (process.versions.node !== "24.19.0") throw new Error("Vercel bootstrap selected the wrong Node version.");
// npm exec inherits Vercel's outer npm lifecycle metadata. Do not let that
// misidentify the pinned npm selected on PATH when its lifecycle scripts run.
const env = { ...process.env };
for (const key of ["npm_config_user_agent", "npm_execpath", "npm_node_execpath", "npm_lifecycle_event", "npm_lifecycle_script", "npm_package_json"]) delete env[key];
const version = spawnSync("npm", ["--version"], { encoding: "utf8", env });
if (version.status !== 0 || version.stdout.trim() !== "12.0.2") throw new Error("Vercel bootstrap selected the wrong npm version.");
const result = spawnSync("npm", task === "install" ? ["ci"] : ["run", "check:toolchain"], {
  cwd: process.env.LASER_FOCUS_BUILD_ROOT, stdio: "inherit", env,
});
if (result.status !== 0) process.exit(result.status ?? 1);
if (task === "build") {
  const build = spawnSync("npm", ["run", "build"], { cwd: process.env.LASER_FOCUS_BUILD_ROOT, stdio: "inherit", env });
  process.exit(build.status ?? 1);
}
