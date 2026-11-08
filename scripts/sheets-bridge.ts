import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { createSheetsBridge } from "../src/lib/sheets-bridge";

const base = resolve(process.env.TIDEPATH_SHEETS_DATA || ".data/sheets");
mkdirSync(base, { recursive: true });
const tokenFile = resolve(base, "bridge-token.txt");
if (!process.env.TIDEPATH_SHEETS_TOKEN && !existsSync(tokenFile)) writeFileSync(tokenFile, randomBytes(32).toString("base64url"), { mode: 0o600, flag: "wx" });
const token = process.env.TIDEPATH_SHEETS_TOKEN || readFileSync(tokenFile, "utf8").trim();
const port = Number(process.env.TIDEPATH_SHEETS_PORT || 3220);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("TIDEPATH_SHEETS_PORT must be between 1024 and 65535.");
const host = process.env.TIDEPATH_SHEETS_HOST || "127.0.0.1";
if (!["127.0.0.1", "0.0.0.0"].includes(host)) throw new Error("TIDEPATH_SHEETS_HOST must be 127.0.0.1 or 0.0.0.0.");
const server = createSheetsBridge({ token, directory: resolve(base, "workspaces") });
server.on("error", error => { console.error(`Sheets bridge failed: ${error.message}`); process.exitCode = 1; });
server.listen(port, host, () => {
  console.log(`Tidepath Sheets bridge: http://${host}:${port}`);
  console.log(`Connection token: ${process.env.TIDEPATH_SHEETS_TOKEN ? "provided through environment" : tokenFile} (never commit or share in the workbook).`);
  console.log(`HTTPS demo tunnel: cloudflared tunnel --url http://127.0.0.1:${port}`);
  console.log("Keep both processes running during the demo. Only the authenticated Sheets adapter is exposed.");
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => process.exit(0)));
