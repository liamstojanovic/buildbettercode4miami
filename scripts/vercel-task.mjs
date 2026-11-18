import { spawnSync } from "node:child_process";
const task = process.argv[2];
if (!["install", "build"].includes(task)) throw new Error("Expected install or build.");
if (process.versions.node !== "24.19.0") throw new Error("Vercel bootstrap selected the wrong Node version.");
const result = spawnSync("npm", task === "install" ? ["ci"] : ["run", "check:toolchain"], {
  cwd: process.env.LASER_FOCUS_BUILD_ROOT, stdio: "inherit", env: process.env,
});
if (result.status !== 0) process.exit(result.status ?? 1);
if (task === "build") {
  const build = spawnSync("npm", ["run", "build"], { cwd: process.env.LASER_FOCUS_BUILD_ROOT, stdio: "inherit", env: process.env });
  process.exit(build.status ?? 1);
}
