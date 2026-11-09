import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DraftGenerationError, prepareDraft } from "./agent";
import { decideMerge, getMetrics, importGiftCsv } from "./domain";
import { digest, draftIsCurrent } from "./evidence";
import { createSeed } from "./seed";
import { AppError, approveDraft, checkDraft, editDraft, exportDraft, findDraft, presentDraft } from "./service";
import type { AgentRun, DemoState } from "./types";
import { SHEETS_FIELDS, type SheetsAmountUnit, type SheetsBinding, type SheetsCommand, type SheetsDashboard, type SheetsGiftRow, type SheetsMapping, type SheetsPreview, type SheetsResult, type SheetsSelection, type SheetsWorkspace } from "./sheets-types";

const cellSchema = z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]);
const selectionSchema = z.object({
  workbookId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/u), sheetId: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sheetName: z.string().min(1).max(100), a1: z.string().regex(/^[A-Z]+[1-9]\d*:[A-Z]+[1-9]\d*$/u),
  startRow: z.number().int().positive().max(10_000_000), startColumn: z.number().int().positive().max(18_278),
  values: z.array(z.array(cellSchema).min(1).max(32)).min(2).max(1001),
  formulas: z.array(z.array(z.string().max(2000)).min(1).max(32)).min(2).max(1001),
}).strict();
const column = z.number().int().nonnegative().max(31);
const mappingSchema = z.object({ gift_id: column, donor_id: column, name: column, email: column.nullable(), phone: column.nullable(), amount: column, date: column, channel: column }).strict();
const common = { selection: selectionSchema };
const importFields = { ...common, mapping: mappingSchema, amountUnit: z.enum(["cents", "dollars"]) };
const draftFields = { ...common, draftId: z.string().min(1).max(200), revision: z.number().int().positive() };
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }).strict(),
  z.object({ action: z.literal("reset") }).strict(),
  z.object({ action: z.literal("preview"), ...importFields }).strict(),
  z.object({ action: z.literal("import"), ...importFields, previewHash: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
  z.object({ action: z.literal("merge"), ...common, candidateId: z.string().min(1).max(2000), decision: z.enum(["approve", "reject"]) }).strict(),
  z.object({ action: z.literal("generate"), ...common, mode: z.enum(["live", "demo"]), requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u) }).strict(),
  z.object({ action: z.literal("edit"), ...draftFields, narrative: z.string().max(10_000).optional(), claims: z.array(z.object({ metricId: z.string().max(100), value: z.number().finite() }).strict()).max(20).optional() }).strict(),
  z.object({ action: z.literal("approve"), ...draftFields }).strict(),
  z.object({ action: z.literal("export"), ...draftFields }).strict(),
]);

export type SheetsDependencies = { checkpoint?: (workspace: SheetsWorkspace) => void | Promise<void>; prepareDraft?: typeof prepareDraft };

/** A workbook has its own donor records; fictional program activity is explicit demo context. */
export function createSheetsWorkspace(workbookId: string): SheetsWorkspace {
  if (!/^[A-Za-z0-9_-]{1,200}$/u.test(workbookId)) throw new AppError("Invalid workbook identifier.");
  const state = createSeed();
  state.donors = []; state.gifts = []; state.paymentFailures = []; state.candidates = [];
  state.grants = []; state.expenses = []; state.notes = []; state.disclosures = [];
  state.drafts = []; state.runs = []; state.audit = []; state.outbox = []; state.generationJobs = [];
  const retained = new Set([...state.participants, ...state.attendance, ...state.volunteerHours].flatMap(row => row.sourceIds));
  state.sources = state.sources.filter(source => retained.has(source.id));
  return { version: 1, workbookId, state, generationRequests: [] };
}

/** Never return DemoState: it is not the spreadsheet client's data contract. */
export function sheetsDashboard(workspace: SheetsWorkspace): SheetsDashboard {
  const { state } = workspace;
  return structuredClone({
    revision: state.revision, asOf: state.asOf, period: state.period, metrics: getMetrics(state), candidates: state.candidates,
    donors: state.donors.map(({ id, name, emails, phone, mergedInto }) => ({ id, name, emails, phone, mergedInto })),
    giftCount: state.gifts.length, drafts: state.drafts.map(draft => ({ ...presentDraft(state, draft), issues: checkDraft(state, draft) })),
    runs: state.runs, selection: workspace.selection, liveAvailable: Boolean(process.env.OPENAI_API_KEY), programData: "fictional_demo" as const,
  });
}

function columnNumber(letters: string) { return [...letters].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0); }
function columnName(value: number) {
  let text = "";
  for (let next = value; next > 0; next = Math.floor((next - 1) / 26)) text = String.fromCharCode(65 + (next - 1) % 26) + text;
  return text;
}

function validateSelection(workspace: SheetsWorkspace, selection: SheetsSelection) {
  if (selection.workbookId !== workspace.workbookId) throw new AppError("This selection belongs to another workbook.", 403);
  const width = selection.values[0].length;
  if (selection.values.some(row => row.length !== width) || selection.formulas.length !== selection.values.length || selection.formulas.some(row => row.length !== width)) throw new AppError("Selected values and formulas must describe the same rectangular range.");
  const [, firstColumn, firstRow, lastColumn, lastRow] = /^([A-Z]+)([1-9]\d*):([A-Z]+)([1-9]\d*)$/u.exec(selection.a1)!;
  if (columnNumber(firstColumn) !== selection.startColumn || Number(firstRow) !== selection.startRow || columnNumber(lastColumn) - selection.startColumn + 1 !== width || Number(lastRow) - selection.startRow + 1 !== selection.values.length) throw new AppError("Selected range coordinates do not match its cells.");
  if (selection.values[0].some(value => typeof value !== "string" || !value.trim())) throw new AppError("Select a rectangular table with nonempty text headers in its first row.");
}

function ensureCurrent(workspace: SheetsWorkspace, selection: SheetsSelection) {
  validateSelection(workspace, selection);
  if (!workspace.selection) throw new AppError("Preview and import the selected donation table first.", 409);
  if (digest(selection) !== workspace.selection.snapshotHash) throw new AppError("The source cells, formulas or selected range changed. Preview and import again before continuing.", 409);
}

function moneyInCents(value: SheetsSelection["values"][number][number], unit: SheetsAmountUnit, row: number): number {
  if (typeof value !== "number" && typeof value !== "string") throw new AppError(`Row ${row}: amount must be a number.`);
  const text = String(value).trim();
  let cents: bigint;
  if (unit === "cents") {
    if (!/^\d+$/u.test(text)) throw new AppError(`Row ${row}: cents must be a positive whole number.`);
    cents = BigInt(text);
  } else {
    if (!/^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/u.test(text)) throw new AppError(`Row ${row}: dollars must have at most two decimal places.`);
    const [whole, fraction = ""] = text.replace(/[$,]/gu, "").split(".");
    cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  }
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new AppError(`Row ${row}: amount is outside the supported positive integer-cent range.`);
  return Number(cents);
}

function mappedRows(selection: SheetsSelection, mapping: SheetsMapping, amountUnit: SheetsAmountUnit) {
  const width = selection.values[0].length;
  const columns = SHEETS_FIELDS.map(field => mapping[field]).filter((value): value is number => value !== null);
  if (new Set(columns).size !== columns.length || columns.some(value => value >= width)) throw new AppError("Map each field to a distinct column within the selected range.");
  const rows: { value: SheetsGiftRow; row: number }[] = [];
  for (let index = 1; index < selection.values.length; index++) {
    const cells = selection.values[index];
    if (cells.every(value => value === null || value === "")) continue;
    const rowNumber = selection.startRow + index;
    const field = (name: typeof SHEETS_FIELDS[number]) => mapping[name] === null ? "" : String(cells[mapping[name]!] ?? "").trim();
    const giftId = field("gift_id"); const donorId = field("donor_id");
    if (!giftId || !donorId) throw new AppError(`Row ${rowNumber}: stable gift and donor IDs are required. Names are not identity keys.`);
    rows.push({ row: rowNumber, value: {
      gift_id: giftId, donor_id: donorId, name: field("name"), email: field("email"), phone: field("phone"),
      amount_cents: moneyInCents(cells[mapping.amount!], amountUnit, rowNumber), date: field("date"), channel: field("channel").toLowerCase(),
    } });
  }
  if (!rows.length) throw new AppError("The selected range has no donation rows.");
  return rows;
}

const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
function csvFor(rows: { value: SheetsGiftRow }[]) {
  const fields = ["gift_id", "donor_id", "name", "email", "phone", "amount_cents", "date", "channel"] as const;
  return [fields.join(","), ...rows.map(({ value }) => fields.map(field => csvCell(value[field])).join(","))].join("\n");
}

function applyImport(state: DemoState, selection: SheetsSelection, mapping: SheetsMapping, amountUnit: SheetsAmountUnit) {
  const rows = mappedRows(selection, mapping, amountUnit);
  const selectedIds = new Set(rows.map(item => item.value.gift_id));
  if (state.gifts.some(gift => !selectedIds.has(gift.id))) throw new AppError("Include every previously imported gift in this workbook's source table, or reset the workbook demo before importing a different table.", 409);
  const existing = new Set(state.gifts.map(gift => gift.id));
  let result: ReturnType<typeof importGiftCsv>;
  try { result = importGiftCsv(state, csvFor(rows), `Google Sheets: ${selection.sheetName}`); }
  catch (error) { throw new AppError(error instanceof Error ? error.message : "The donation table could not be imported."); }
  const snapshotHash = digest(selection);
  let provenanceChanged = false;
  const visited = new Set<string>();
  for (const item of rows) {
    if (visited.has(item.value.gift_id)) continue;
    visited.add(item.value.gift_id);
    const source = state.sources.find(source => source.id === `src-import-${item.value.gift_id}`)!;
    const rowRange = `${columnName(selection.startColumn)}${item.row}:${columnName(selection.startColumn + selection.values[0].length - 1)}${item.row}`;
    const sourceName = `Google Sheets: ${selection.sheetName}!${rowRange}`.slice(0, 120);
    const metadata = { spreadsheet_id: selection.workbookId, sheet_id: selection.sheetId, sheet_name: selection.sheetName, selection_hash: snapshotHash,
      selected_range: selection.a1, source_range: rowRange, source_cells: JSON.stringify(Object.fromEntries(SHEETS_FIELDS.map(field => [field, mapping[field] === null ? null : `${columnName(selection.startColumn + mapping[field]!)}${item.row}`]))) };
    if (existing.has(item.value.gift_id) && (source.row !== item.row || source.source !== sourceName || Object.entries(metadata).some(([key, value]) => source.values[key] !== value))) provenanceChanged = true;
    source.row = item.row; source.source = sourceName; Object.assign(source.values, metadata);
  }
  if (provenanceChanged) {
    state.revision++;
    state.audit.push({ id: randomUUID(), at: new Date().toISOString(), action: "sheets.source_refreshed", detail: "Spreadsheet cell references changed; drafts using the earlier evidence need fresh review.", sourceIds: rows.map(item => `src-import-${item.value.gift_id}`) });
  }
  return { ...result, rows };
}

function previewImport(workspace: SheetsWorkspace, selection: SheetsSelection, mapping: SheetsMapping, amountUnit: SheetsAmountUnit): SheetsPreview {
  validateSelection(workspace, selection);
  const state = structuredClone(workspace.state);
  const { inserted, skipped, rows } = applyImport(state, selection, mapping, amountUnit);
  const snapshotHash = digest(selection);
  return { previewHash: digest({ snapshotHash, mapping, amountUnit }), snapshotHash, inserted, skipped, rowCount: rows.length,
    rows: rows.map(row => row.value), metrics: getMetrics(state), candidates: structuredClone(state.candidates) };
}

function binding(selection: SheetsSelection, mapping: SheetsMapping, amountUnit: SheetsAmountUnit, preview: SheetsPreview): SheetsBinding {
  const { workbookId, sheetId, sheetName, a1, startRow, startColumn } = selection;
  return { workbookId, sheetId, sheetName, a1, startRow, startColumn, snapshotHash: preview.snapshotHash, mapping: structuredClone(mapping), amountUnit, previewHash: preview.previewHash };
}

function replaceWorkspace(target: SheetsWorkspace, value: SheetsWorkspace) {
  delete target.selection;
  Object.assign(target, value);
}

function stampRun(run: AgentRun): AgentRun {
  return { ...run, inputHash: run.inputSnapshot === undefined ? undefined : digest(run.inputSnapshot), outputHash: run.outputSnapshot === undefined ? undefined : digest(run.outputSnapshot) };
}

function recoverInterrupted(workspace: SheetsWorkspace) {
  let changed = false;
  for (const request of workspace.generationRequests) {
    if (request.status !== "running" || Date.now() - Date.parse(request.startedAt) < 90_000) continue;
    request.status = "failed"; request.error = "The earlier draft was interrupted. Use a new request key to retry.";
    const run: AgentRun = { id: randomUUID(), mode: request.mode, status: "failed", model: request.mode === "live" ? process.env.OPENAI_MODEL || "gpt-5.4-mini" : "deterministic-template", inputTokens: 0, outputTokens: 0, usageKnown: false, maxTurns: 3, durationMs: 90_000,
      events: [{ id: randomUUID(), at: new Date().toISOString(), action: "run_interrupted", detail: "The draft reservation expired after a restart. Provider usage is unknown. No draft was saved.", sourceIds: [] }] };
    request.runId = run.id; workspace.state.runs.unshift(run);
    changed = true;
  }
  return changed;
}

async function generate(workspace: SheetsWorkspace, command: Extract<SheetsCommand, { action: "generate" }>, dependencies: SheetsDependencies): Promise<SheetsResult> {
  const fingerprint = digest({ mode: command.mode, snapshotHash: workspace.selection!.snapshotHash });
  const previous = workspace.generationRequests.find(request => request.requestId === command.requestId);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new AppError("This request key belongs to a different generation request.", 409);
    if (previous.status !== "completed") throw new AppError(previous.status === "running" ? "This draft is still running. Retry with the same key shortly." : previous.error || "This attempt failed. Use a new request key to retry.", 409);
    const draft = findDraft(workspace.state, previous.draftId!);
    return { dashboard: sheetsDashboard(workspace), draft: presentDraft(workspace.state, draft), replayed: true };
  }
  if (workspace.generationRequests.some(request => request.status === "running")) throw new AppError("A draft is already running. Please wait.", 409);
  if (command.mode === "live" && workspace.generationRequests.filter(request => request.mode === "live").length >= 12) throw new AppError("This workbook demo reached its twelve live-attempt limit. Use rehearsal mode or reset the workbook demo.", 429);
  const request = { requestId: command.requestId, mode: command.mode, fingerprint, status: "running" as const, startedAt: new Date().toISOString() };
  workspace.generationRequests.push(request);
  await dependencies.checkpoint?.(workspace);
  const persistedRequest = workspace.generationRequests.find(item => item.requestId === command.requestId)!;
  const snapshot = structuredClone(workspace.state);
  const sourceHash = workspace.selection!.snapshotHash;
  let completedRun: AgentRun | undefined;
  try {
    const prepared = await (dependencies.prepareDraft ?? prepareDraft)(snapshot, { kind: "report", mode: command.mode });
    completedRun = prepared.run;
    if (workspace.selection?.snapshotHash !== sourceHash || !draftIsCurrent(workspace.state, prepared.draft)) throw new AppError("Records changed during drafting. Generate a fresh report.", 409);
    if (Date.now() - Date.parse(persistedRequest.startedAt) >= 90_000) throw new AppError("The generation reservation expired. Generate a fresh report.", 409);
    const issues = checkDraft(workspace.state, prepared.draft);
    if (issues.length) throw new AppError("Generated report did not pass its final evidence check.", 422, issues);
    workspace.state.drafts.unshift(prepared.draft);
    workspace.state.runs.unshift(stampRun(prepared.run));
    persistedRequest.status = "completed"; persistedRequest.draftId = prepared.draft.id; persistedRequest.runId = prepared.run.id;
    await dependencies.checkpoint?.(workspace);
    return { dashboard: sheetsDashboard(workspace), draft: presentDraft(workspace.state, prepared.draft), replayed: false };
  } catch (error) {
    if (persistedRequest.status === "completed") throw new AppError("The report was prepared, but saving could not be confirmed. Retry with the same request key.", 503);
    const safe = error instanceof AppError ? error : new AppError(error instanceof DraftGenerationError ? error.message : "The report could not finish. Retry or use rehearsal mode. No report was approved.", 502, error instanceof DraftGenerationError ? error.issues : undefined);
    const knownRun = error instanceof DraftGenerationError ? error.run : completedRun;
    const run: AgentRun = knownRun ? structuredClone(knownRun) : { id: randomUUID(), mode: command.mode, status: "failed", model: command.mode === "live" ? process.env.OPENAI_MODEL || "gpt-5.4-mini" : "deterministic-template", events: [], inputTokens: 0, outputTokens: 0, usageKnown: false, maxTurns: 3, durationMs: Date.now() - Date.parse(persistedRequest.startedAt) };
    run.status = "failed";
    run.events.push({ id: randomUUID(), at: new Date().toISOString(), action: "draft_not_saved", detail: safe.message, sourceIds: [] });
    workspace.state.runs.unshift(stampRun(run));
    persistedRequest.status = "failed"; persistedRequest.error = safe.message; persistedRequest.runId = run.id;
    await dependencies.checkpoint?.(workspace);
    throw safe;
  }
}

/** The HTTP bridge serializes and persists commands per workbook. No process-global web demo state is used. */
export async function executeSheetsCommand(workspace: SheetsWorkspace, rawCommand: unknown, dependencies: SheetsDependencies = {}): Promise<SheetsResult> {
  const parsed = commandSchema.safeParse(rawCommand);
  if (!parsed.success) throw new AppError("Invalid spreadsheet command.", 400, parsed.error.issues.map(issue => ({ code: "invalid_input", message: `${issue.path.join(".")}: ${issue.message}` })));
  const command = parsed.data as SheetsCommand;
  if (recoverInterrupted(workspace)) await dependencies.checkpoint?.(workspace);
  if (command.action === "status") return { dashboard: sheetsDashboard(workspace) };
  if (command.action === "reset") {
    if (workspace.generationRequests.some(request => request.status === "running")) throw new AppError("Wait for the active draft before resetting.", 409);
    replaceWorkspace(workspace, createSheetsWorkspace(workspace.workbookId));
    return { dashboard: sheetsDashboard(workspace) };
  }
  if (command.action === "preview") return { dashboard: sheetsDashboard(workspace), preview: previewImport(workspace, command.selection, command.mapping, command.amountUnit) };
  if (command.action === "import") {
    const preview = previewImport(workspace, command.selection, command.mapping, command.amountUnit);
    if (preview.previewHash !== command.previewHash) throw new AppError("The selected cells or mapping changed after preview. Review a fresh preview before import.", 409);
    const working = structuredClone(workspace);
    const { inserted, skipped } = applyImport(working.state, command.selection, command.mapping, command.amountUnit);
    working.selection = binding(command.selection, command.mapping, command.amountUnit, preview);
    replaceWorkspace(workspace, working);
    return { dashboard: sheetsDashboard(workspace), importResult: { inserted, skipped } };
  }
  ensureCurrent(workspace, command.selection);
  if (command.action === "generate") return generate(workspace, command, dependencies);
  const working = structuredClone(workspace);
  let extra: Omit<SheetsResult, "dashboard"> = {};
  if (command.action === "merge") {
    const candidate = working.state.candidates.find(candidate => candidate.id === command.candidateId);
    const expected = command.decision === "approve" ? "approved" : "rejected";
    if (candidate?.status !== expected) {
      try { decideMerge(working.state, command.candidateId, command.decision); }
      catch (error) { throw new AppError(error instanceof Error ? error.message : "The duplicate decision could not be saved."); }
    }
  } else if (command.action === "edit") {
    extra.draft = editDraft(working.state, command.draftId, command);
  } else if (command.action === "approve") {
    extra.draft = approveDraft(working.state, command.draftId, command.revision);
  } else if (command.action === "export") {
    const draft = findDraft(working.state, command.draftId);
    if (draft.revision !== command.revision) throw new AppError("Review the current report revision before writing it to Sheets.", 409);
    const text = exportDraft(working.state, command.draftId);
    const sourceRows = draft.sourceIds.slice(0, 1000).map(id => {
      const source = working.state.sources.find(source => source.id === id)!;
      return [id, `${source.source}, row ${source.row}`];
    });
    const rows = [["Laser Focus approved report", draft.title], ["Data", "Selected donation rows plus fictional Q3 2026 program activity"], ["Period", working.state.period.label], ["As of", working.state.asOf], ["Draft ID", draft.id], ["Revision", String(draft.revision)], ["Approved at", draft.approvedAt!], ["Approval digest", draft.approvedDigest!], ["Source range", `${working.selection!.sheetName}!${working.selection!.a1}`], ["Narrative", draft.narrative], ...draft.claims.map(claim => {
      const metric = getMetrics(working.state).find(metric => metric.id === claim.metricId)!;
      return [metric.label, metric.unit === "USD" ? `$${claim.value.toFixed(2)}` : `${claim.value} ${metric.unit}`];
    }), ["Evidence", "Source references"], ...sourceRows, ["Delivery", "Approved report only. No external message or submission was sent."]];
    // Apps Script writes these strings as literal text and verifies no formulas were created.
    extra.export = { text, rows, draftId: draft.id, revision: draft.revision, approvalDigest: draft.approvedDigest!, sourceHash: working.selection!.snapshotHash };
  }
  replaceWorkspace(workspace, working);
  return { dashboard: sheetsDashboard(workspace), ...extra };
}
