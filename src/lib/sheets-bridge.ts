import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createSheetsWorkspace, executeSheetsCommand } from "./sheets";
import { AppError } from "./service";
import type { SheetsWorkspace } from "./sheets-types";

export type SheetsBridgeOptions = { token: string; directory: string; execute?: typeof executeSheetsCommand };
const hash = (value: string) => createHash("sha256").update(value).digest();

/** Narrow server-to-server adapter. The main app and counseling APIs are never routed here. */
export function createSheetsBridge(options: SheetsBridgeOptions) {
  if (!/^[A-Za-z0-9_-]{32,200}$/u.test(options.token)) throw new Error("The Sheets bridge needs a strong URL-safe token of at least 32 characters.");
  const directory = resolve(options.directory);
  mkdirSync(directory, { recursive: true });
  const busy = new Set<string>();
  let liveRunning = false;
  const tokenHash = hash(options.token);
  const execute = options.execute ?? executeSheetsCommand;
  const fileFor = (id: string) => join(directory, `${hash(id).toString("hex")}.json`);
  const save = (workspace: SheetsWorkspace) => {
    const file = fileFor(workspace.workbookId);
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(workspace), { encoding: "utf8", flag: "wx", mode: 0o600 });
      for (let attempt = 0; ; attempt++) {
        try { renameSync(temp, file); break; }
        catch (error) {
          if (process.platform !== "win32" || !["EPERM", "EBUSY", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "") || attempt === 5) throw error;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (attempt + 1));
        }
      }
    } finally { if (existsSync(temp)) unlinkSync(temp); }
  };
  const send = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify(data));
  };
  const parse = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
    if (!req.headers["content-type"]?.startsWith("application/json")) throw new AppError("Send a JSON command.", 415);
    if (Number(req.headers["content-length"]) > 1_000_000) throw new AppError("Selected cells exceed the one-megabyte limit.", 413);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > 1_000_000) throw new AppError("Selected cells exceed the one-megabyte limit.", 413);
      chunks.push(buffer);
    }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AppError("Command must be valid JSON."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("Command must be a JSON object.");
    return body as Record<string, unknown>;
  };
  const server = createServer(async (req, res) => {
    let workbookId: string | undefined;
    let ownsLock = false;
    let ownsLive = false;
    try {
      if (req.method === "GET" && req.url === "/health") { send(res, 200, { service: "laser-focus-sheets", status: "ok" }); return; }
      if (req.url !== "/v1/command") { send(res, 404, { error: "Route not found." }); return; }
      if (req.method !== "POST") throw new AppError("Use POST for Sheets commands.", 405);
      const supplied = req.headers.authorization ?? "";
      if (!supplied.startsWith("Bearer ") || !timingSafeEqual(hash(supplied.slice(7)), tokenHash)) throw new AppError("Connect the sidebar with the current bridge token.", 401);
      if (req.headers.origin) throw new AppError("Use the Sheets server adapter, not a browser cross-origin request.", 403);
      const body = await parse(req);
      if (typeof body.workbookId !== "string" || !/^[A-Za-z0-9_-]{10,200}$/u.test(body.workbookId)) throw new AppError("A valid spreadsheet ID is required.");
      workbookId = body.workbookId;
      if (busy.has(workbookId)) throw new AppError("Another action is running for this spreadsheet. Wait, then retry.", 409);
      const { workbookId: _workbookId, ...command } = body;
      const live = command.action === "generate" && command.mode === "live";
      if (live && liveRunning) throw new AppError("A live draft is already running. Wait, then retry.", 409);
      busy.add(workbookId); ownsLock = true;
      if (live) { liveRunning = true; ownsLive = true; }
      const file = fileFor(workbookId);
      const workspace: SheetsWorkspace = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : createSheetsWorkspace(workbookId);
      if (workspace.workbookId !== workbookId) throw new Error("Workspace identity mismatch");
      const result = await execute(workspace, command, { checkpoint: save });
      save(workspace);
      send(res, 200, result);
    } catch (error) {
      if (error instanceof AppError) send(res, error.status, { error: error.message, issues: error.issues });
      else send(res, 500, { error: "The Sheets bridge could not complete this action. Check its terminal and retry." });
    } finally {
      if (ownsLock && workbookId) busy.delete(workbookId);
      if (ownsLive) liveRunning = false;
    }
  });
  server.requestTimeout = 65_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
