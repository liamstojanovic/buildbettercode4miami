import { z, ZodError } from "zod";
import { assertResetAllowed, generateDraft, replayRun } from "@/lib/generation";
import { decideMerge, importGiftCsv, recordAttendance } from "@/lib/domain";
import { approveDisclosure, createDisclosure, exportDisclosure, getGrantLedgers, getNote, recordExpense, saveNote } from "@/lib/programs";
import { AppError, approveDraft, dashboard, editDraft, exportDraft, simulateDelivery } from "@/lib/service";
import { mutateState, readState, resetState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

async function body(request: Request) {
  const limit = 1_000_000;
  const tooLarge = () => new AppError("Request exceeds the demo's one-megabyte limit.", 413);
  if (Number(request.headers.get("content-length")) > limit) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Request body must be valid JSON.");
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw tooLarge(); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(text); } catch { throw new AppError("Request body must be valid JSON."); }
}

function guardOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  // Next's internal request URL can use localhost while the browser uses 127.0.0.1.
  // The actual HTTP Host is the browser's destination and must match its Origin.
  let source: URL;
  try { source = new URL(origin); } catch { throw new AppError("Invalid request origin.", 403); }
  if (source.host !== request.headers.get("host") || !["http:", "https:"].includes(source.protocol)) throw new AppError("Cross-origin writes are not allowed.", 403);
}

async function handle(request: Request, context: Context) {
  const { path } = await context.params;
  const [resource, id, action] = path;
  const method = request.method;
  if (method !== "GET") guardOrigin(request);
  if (method === "GET" && resource === "dashboard" && path.length === 1) return response(dashboard(readState()));
  if (method === "POST" && resource === "reset" && path.length === 1) {
    return response(dashboard(resetState(assertResetAllowed)));
  }
  if (method === "POST" && resource === "merge" && path.length === 1) {
    const input = z.object({ candidateId: z.string(), decision: z.enum(["approve", "reject"]) }).strict().parse(await body(request));
    return response(mutateState(state => { decideMerge(state, input.candidateId, input.decision); return dashboard(state); }));
  }
  if (method === "POST" && resource === "import" && path.length === 1) {
    const input = z.object({ csv: z.string().max(900_000), sourceName: z.string().min(1).max(100) }).strict().parse(await body(request));
    return response(mutateState(state => ({ ...importGiftCsv(state, input.csv, input.sourceName), dashboard: dashboard(state) })));
  }
  if (method === "POST" && resource === "attendance" && path.length === 1) {
    const input = z.object({ participantId: z.string(), date: z.string(), status: z.enum(["present", "absent", "cancelled", "scheduled"]) }).strict().parse(await body(request));
    return response(mutateState(state => ({ attendance: recordAttendance(state, input), dashboard: dashboard(state) })));
  }
  if (resource === "drafts" && method === "POST" && path.length === 1) {
    const input = z.object({ kind: z.enum(["report", "followup", "application"]), queueItemId: z.string().optional(), grantId: z.string().optional(), mode: z.enum(["demo", "live"]) }).strict().parse(await body(request));
    return response(await generateDraft(input, request.headers.get("idempotency-key") ?? undefined));
  }
  if (resource === "runs" && id && method === "GET" && (path.length === 2 || (path.length === 3 && action === "replay"))) return response(replayRun(readState(), id));
  if (resource === "grants" && id && action === "ledger" && method === "GET" && path.length === 3) {
    const ledger = getGrantLedgers(readState()).find(ledger => ledger.grantId === id);
    if (!ledger) throw new AppError("Grant not found.", 404);
    return response({ ledger });
  }
  if (resource === "grants" && id && action === "expenses" && method === "POST" && path.length === 3) {
    const input = z.object({ id: z.string().min(1).max(120), date: z.string(), category: z.string().min(1).max(100), amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), description: z.string().min(1).max(1000) }).strict().parse(await body(request));
    return response(mutateState(state => ({ ...recordExpense(state, id, input), dashboard: dashboard(state) })));
  }
  if (resource === "drafts" && id) {
    if (method === "PATCH" && path.length === 2) {
      const input = z.object({ revision: z.number().int().positive(), narrative: z.string().max(10_000).optional(), claims: z.array(z.object({ metricId: z.string(), value: z.number().finite() }).strict()).max(20).optional() }).strict().parse(await body(request));
      return response(mutateState(state => ({ draft: editDraft(state, id, input), dashboard: dashboard(state) })));
    }
    if (method === "POST" && action === "approve" && path.length === 3) {
      const input = z.object({ revision: z.number().int().positive() }).strict().parse(await body(request));
      return response(mutateState(state => ({ draft: approveDraft(state, id, input.revision), dashboard: dashboard(state) })));
    }
    if (method === "POST" && action === "send" && path.length === 3) {
      const input = z.object({ revision: z.number().int().positive() }).strict().parse(await body(request));
      return response(mutateState(state => ({ message: simulateDelivery(state, id, input.revision), dashboard: dashboard(state) })));
    }
    if (method === "GET" && action === "export" && path.length === 3) {
      return new Response(exportDraft(readState(), id), { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": "attachment; filename=laser-focus-approved-draft.txt", "Cache-Control": "no-store" } });
    }
  }
  if (resource === "notes" && id && path.length === 2 && method === "GET") {
    return response(mutateState(state => ({ note: getNote(state, id), dashboard: dashboard(state) })));
  }
  if (resource === "notes" && id && path.length === 2 && method === "PATCH") {
    const input = z.object({ goal: z.string().min(1).max(2000), progress: z.string().min(1).max(4000), privateDetail: z.string().max(4000), durationMinutes: z.number().int().min(1).max(480), expectedNoteHash: z.string().regex(/^[a-f0-9]{64}$/u).optional() }).strict().parse(await body(request));
    return response(mutateState(state => ({ note: saveNote(state, id, input), dashboard: dashboard(state) })));
  }
  if (resource === "disclosures" && method === "POST" && path.length === 1) {
    const input = z.object({ noteId: z.string(), grantId: z.string() }).strict().parse(await body(request));
    return response(mutateState(state => ({ disclosure: createDisclosure(state, input.noteId, input.grantId), dashboard: dashboard(state) })));
  }
  if (resource === "disclosures" && id && action === "approve" && method === "POST" && path.length === 3) {
    const input = z.object({ payloadHash: z.string() }).strict().parse(await body(request));
    return response(mutateState(state => ({ disclosure: approveDisclosure(state, id, input.payloadHash), dashboard: dashboard(state) })));
  }
  if (resource === "disclosures" && id && action === "export" && method === "GET" && path.length === 3) {
    const payload = mutateState(state => exportDisclosure(state, id));
    return new Response(JSON.stringify(payload, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": "attachment; filename=laser-focus-funder-copy.json", "Cache-Control": "no-store" } });
  }
  throw new AppError("Route not found.", 404);
}

async function dispatch(request: Request, context: Context) {
  try { return await handle(request, context); }
  catch (error) {
    if (error instanceof ZodError) return response({ error: "Invalid request.", issues: error.issues.map(issue => ({ code: "invalid_input", message: `${issue.path.join(".")}: ${issue.message}` })) }, 400);
    if (error instanceof AppError) return response({ error: error.message, issues: error.issues }, error.status);
    if (error instanceof Error && "code" in error) return response({ error: "The local demo store could not complete the request. Check server storage and retry." }, 500);
    // Domain errors contain validation text only; provider exceptions are sanitized above.
    return response({ error: error instanceof Error ? error.message : "The request could not be completed." }, 400);
  }
}

export { dispatch as GET, dispatch as POST, dispatch as PATCH };
