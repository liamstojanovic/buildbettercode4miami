import { z } from "zod";
import { dispatch, guardOrigin, readJsonBody } from "./request-handler";
import { createSeed } from "./seed";
import { withDemoState } from "./store";
import { AppError } from "./service";
import type { DemoState } from "./types";

const envelope = z.object({
  version: z.literal(1),
  path: z.string().regex(/^\/api\/[a-zA-Z0-9_./-]+$/).max(300),
  method: z.enum(["GET", "POST", "PATCH"]),
  body: z.unknown().optional(),
  state: z.record(z.string(), z.unknown()).nullable(),
}).strict();

// Browser-owned fictional data is never an authorization or trusted audit record.
// Check the storage shape before executing domain rules; deeper domain errors remain errors.
function parseState(value: Record<string, unknown> | null): DemoState {
  const seed = createSeed();
  if (value === null) return seed;
  for (const [key, sample] of Object.entries(seed)) {
    const item = value[key];
    if (Array.isArray(sample) ? !Array.isArray(item) || item.some(row => !row || typeof row !== "object" || Array.isArray(row))
      : typeof sample !== typeof item || item === null) throw new AppError("Saved demo data is incompatible. Reset the demo to start fresh.");
  }
  if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1) throw new AppError("Saved demo data is incompatible. Reset the demo to start fresh.");
  const period = value.period as Record<string, unknown>;
  if (![period.label, period.start, period.end].every(item => typeof item === "string")) throw new AppError("Invalid demo period.");
  if (value.generationJobs !== undefined && !Array.isArray(value.generationJobs)) throw new AppError("Invalid demo jobs.");
  return value as unknown as DemoState;
}

export async function handleHostedDemo(request: Request): Promise<Response> {
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  try {
    guardOrigin(request);
    const input = envelope.parse(await readJsonBody(request, 3_000_000));
    if (input.path === "/api/demo" || input.path.includes("..")) throw new AppError("Invalid demo operation.");
    if (input.body && typeof input.body === "object" && "mode" in input.body && input.body.mode !== "demo") throw new AppError("Live drafting is disabled in the hosted demo.", 403);
    // Reset also recovers malformed or obsolete browser storage.
    const initial = parseState(input.path === "/api/reset" ? null : input.state);
    const url = new URL(input.path, request.url);
    const inner = new Request(url, { method: input.method, headers: { host: url.host, "content-type": "application/json" },
      ...(input.method !== "GET" && input.body !== undefined ? { body: JSON.stringify(input.body) } : {}) });
    const { result, state } = await withDemoState(initial, async () => {
      const response = await dispatch(inner, { params: Promise.resolve({ path: input.path.slice(5).split("/") }) });
      const contentType = response.headers.get("content-type") || "text/plain";
      const attachment = response.headers.get("content-disposition");
      return { status: response.status, data: attachment ? await response.text() : await response.json(),
        ...(attachment ? { download: { contentType, filename: attachment.match(/filename=([^;]+)/)?.[1]?.replaceAll('"', '') || "demo-export.txt" } } : {}) };
    });
    const output = { version: 1, state, ...result };
    if (new TextEncoder().encode(JSON.stringify(output)).length > 3_000_000) throw new AppError("Demo storage is full. Export your work and reset the demo.", 413);
    return json(output);
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Invalid demo request or incompatible saved data. Reset the demo to start fresh." }, 400);
    if (error instanceof AppError) return json({ error: error.message }, error.status);
    return json({ error: "The demo could not complete this operation. Retry or reset the demo." }, 400);
  }
}
