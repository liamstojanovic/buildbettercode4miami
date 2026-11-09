import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { digest } from "../src/lib/evidence";

const code = readFileSync("integrations/google-sheets/Code.gs", "utf8");
const fakeToken = "test_connection_token_with_no_real_credentials_123";
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
type Cell = string | number | boolean | null | Date;

class Metadata {
  constructor(public key: string, public value: string) {}
  getKey() { return this.key; }
  getValue() { return this.value; }
  setValue(value: string) { this.value = value; return this; }
}
class Sheet {
  grid: Cell[][] = [];
  formulas: string[][] = [];
  metadata: Metadata[] = [];
  reads = 0;
  formats: string[] = [];
  notes: string[] = [];
  constructor(public id: number, public name: string) {}
  getSheetId() { return this.id; }
  getName() { return this.name; }
  getRange(a1: string): Range;
  getRange(row: number, column: number, rows?: number, columns?: number): Range;
  getRange(a: string | number, b?: number, c = 1, d = 1) {
    if (typeof a === "number") return new Range(this, a, b!, c, d);
    const match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(a)!;
    const col = (letters: string) => [...letters].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
    const firstColumn = col(match[1]); const firstRow = Number(match[2]);
    return new Range(this, firstRow, firstColumn, Number(match[4] || match[2]) - firstRow + 1, col(match[3] || match[1]) - firstColumn + 1);
  }
  addDeveloperMetadata(key: string, value: string) { this.metadata.push(new Metadata(key, value)); return this; }
  getDeveloperMetadata() { return this.metadata; }
  setFrozenRows() { return this; }
  setColumnWidths() { return this; }
  autoResizeColumns() { return this; }
}
class Range {
  constructor(public sheet: Sheet, public row: number, public column: number, public rows: number, public columns: number) {}
  getNumRows() { return this.rows; }
  getNumColumns() { return this.columns; }
  getRow() { return this.row; }
  getColumn() { return this.column; }
  getSheet() { return this.sheet; }
  getA1Notation() {
    const letter = (n: number): string => n > 26 ? letter(Math.floor((n - 1) / 26)) + letter((n - 1) % 26 + 1) : String.fromCharCode(64 + n);
    const start = `${letter(this.column)}${this.row}`;
    return this.rows === 1 && this.columns === 1 ? start : `${start}:${letter(this.column + this.columns - 1)}${this.row + this.rows - 1}`;
  }
  getValues() {
    this.sheet.reads++;
    return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.columns }, (_, c) => this.sheet.grid[this.row - 1 + r]?.[this.column - 1 + c] ?? ""));
  }
  getFormulas() {
    return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.columns }, (_, c) => this.sheet.formulas[this.row - 1 + r]?.[this.column - 1 + c] ?? ""));
  }
  setNumberFormat(format: string) { this.sheet.formats.push(format); return this; }
  setValues(values: Cell[][]) {
    values.forEach((row, r) => row.forEach((value, c) => {
      const rr = this.row - 1 + r; const cc = this.column - 1 + c;
      this.sheet.grid[rr] ??= []; this.sheet.formulas[rr] ??= [];
      const quoted = typeof value === "string" && value.startsWith("'");
      this.sheet.grid[rr][cc] = quoted ? (value as string).slice(1) : value;
      this.sheet.formulas[rr][cc] = !quoted && typeof value === "string" && value.startsWith("=") ? value : "";
    }));
    return this;
  }
  setWrap() { return this; }
  setVerticalAlignment() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setFontWeight() { return this; }
  setNote(note: string) { this.sheet.notes.push(note); return this; }
}

function setup() {
  const source = new Sheet(12, "Donations");
  source.grid = [["Gift ID", "Donor ID", "Name", "Email", "Phone", "Amount", "Date", "Channel"],
    ["gift-1", "donor-1", "Rosa Delgado", "rosa@example.test", "+1-305-555-0101", 125, "2026-09-01", "online"]];
  const privateTab = new Sheet(13, "Internal notes"); privateTab.grid = [["PRIVATE_SENTINEL"]];
  const sheets = [source, privateTab];
  let active = source.getRange("A1:H2");
  let activeRanges = [active];
  const properties = new Map<string, string>();
  const calls: { url: string; options: Record<string, any>; input: Record<string, any> }[] = [];
  let fetcher: (input: Record<string, any>) => { status: number; body: unknown } = () => ({ status: 200, body: { dashboard: {} } });
  let flush = () => {};
  let lockHeld = false;
  let locksAllowed = true;
  const workbook = {
    getId: () => "workbook-fictional-123",
    getUrl: () => "https://docs.google.com/spreadsheets/d/workbook-fictional-123/edit",
    getSpreadsheetTimeZone: () => "America/New_York",
    getActiveRange: () => active,
    getActiveRangeList: () => ({ getRanges: () => activeRanges }),
    getSheetById: (id: number) => sheets.find(sheet => sheet.id === id) ?? null,
    getSheetByName: (name: string) => sheets.find(sheet => sheet.name === name) ?? null,
    insertSheet: (name: string) => { const sheet = new Sheet(100 + sheets.length, name); sheets.push(sheet); return sheet; },
    setActiveSheet: (sheet: Sheet) => { active = sheet.getRange("A1"); activeRanges = [active]; },
    setActiveRange: (range: Range) => { active = range; activeRanges = [range]; },
  };
  const context = createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => workbook, flush: () => flush() },
    PropertiesService: { getUserProperties: () => ({ getProperty: (key: string) => properties.get(key) ?? null, setProperty: (key: string, value: string) => { properties.set(key, value); }, deleteProperty: (key: string) => { properties.delete(key); } }) },
    LockService: { getDocumentLock: () => ({ tryLock: () => { lockHeld = locksAllowed; return locksAllowed; }, releaseLock: () => { lockHeld = false; } }) },
    Utilities: { DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" }, computeDigest: (_algorithm: string, value: string) => [...createHash("sha256").update(value).digest()].map(byte => byte > 127 ? byte - 256 : byte),
      formatDate: (value: Date, timezone: string, format: string) => { assert.equal(timezone, "America/New_York"); assert.equal(format, "yyyy-MM-dd"); return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value); } },
    UrlFetchApp: { fetch: (url: string, options: Record<string, any>) => {
      const input = JSON.parse(options.payload); calls.push({ url, options, input });
      const response = fetcher(input);
      return { getResponseCode: () => response.status, getContentText: () => typeof response.body === "string" ? response.body : JSON.stringify(response.body) };
    } },
  });
  runInContext(code, context);
  const api = context as Record<string, (...args: any[]) => any>;
  const connect = () => api.laserFocusConfigure({ url: "https://bridge.example.test", token: fakeToken });
  const pin = () => api.laserFocusReadSelection();
  const approve = (rows = [["Approved report", "Value"], ["Community support", "Recorded activity"]]) => {
    fetcher = input => ({ status: 200, body: { export: { rows, text: "Approved report", draftId: "draft-approved-001", revision: 2, approvalDigest: "a".repeat(64), sourceHash: digest(input.selection) } } });
  };
  return { api, workbook, source, privateTab, sheets, properties, calls, connect, pin, approve,
    setFetcher: (value: typeof fetcher) => { fetcher = value; }, setFlush: (value: typeof flush) => { flush = value; },
    setSelection: (range: Range) => { active = range; activeRanges = [range]; }, setMulti: () => { activeRanges = [active, privateTab.getRange("A1")]; },
    disallowLock: () => { locksAllowed = false; }, lockHeld: () => lockHeld };
}

test("Apps Script connection credentials stay server-side and unsafe origins never receive them", () => {
  const t = setup();
  for (const url of ["http://bridge.example.test", "https://user:pass@bridge.example.test", "https://bridge.example.test/path", "https://bridge.example.test?token=x", "https://bridge.example.test/#x", "https://-bad.example.test"]) assert.throws(() => t.api.laserFocusConfigure({ url, token: fakeToken }), /HTTPS origin/);
  assert.throws(() => t.api.laserFocusConfigure({ url: "https://bridge.example.test", token: "short" }), /connection token/);
  assert.equal(t.properties.size, 0);
  const configured = t.connect();
  assert.equal(configured.configured, true);
  assert.ok(!JSON.stringify(configured).includes(fakeToken));
  t.api.laserFocusCommand({ action: "status" });
  assert.equal(t.calls[0].url, "https://bridge.example.test/v1/command");
  assert.equal(t.calls[0].options.headers.Authorization, `Bearer ${fakeToken}`);
  assert.equal(t.calls[0].options.followRedirects, false);
  assert.equal(t.calls[0].options.validateHttpsCertificates, true);
  assert.ok(!t.calls[0].options.payload.includes(fakeToken));
  assert.equal(t.privateTab.reads, 0);
});

test("selected ranges preserve formula evidence and normalize dates in workbook timezone", () => {
  const t = setup();
  t.source.grid[1][6] = new Date("2026-09-02T02:00:00Z");
  t.source.formulas = [[], ["", "", "", "", "", "=100+25", "", ""]];
  const result = t.pin();
  assert.equal(result.selection.values[1][6], "2026-09-01");
  assert.equal(result.selection.formulas[1][5], "=100+25");
  assert.equal(result.summary.rowCount, 1);
  assert.equal(result.summary.hash, digest(plain(result.selection)));
  assert.equal(t.privateTab.reads, 0);
  assert.ok(![...t.properties.values()].join().includes("rosa@example.test"), "properties contain a locator/hash, not donor rows");
  t.setMulti(); assert.throws(() => t.pin(), /contiguous/);
  t.setSelection(t.source.getRange(1, 1, 1002, 8)); assert.throws(() => t.pin(), /1,000/);
  t.setSelection(t.source.getRange(1, 1, 2, 33)); assert.throws(() => t.pin(), /32 columns/);
});

test("commands use server-observed pinned cells even after cursor movement and reject browser spoofing", () => {
  const t = setup(); t.connect(); const selected = t.pin();
  t.setSelection(t.privateTab.getRange("A1"));
  t.api.laserFocusCommand({ action: "preview", workbookId: "forged", selection: { values: [["PRIVATE_SENTINEL"]] }, mapping: {} });
  assert.equal(t.calls[0].input.workbookId, "workbook-fictional-123");
  assert.deepEqual(t.calls[0].input.selection, plain(selected.selection));
  assert.ok(!JSON.stringify(t.calls).includes("PRIVATE_SENTINEL"));
  assert.equal(t.privateTab.reads, 0);
});

test("changed source values or formulas block a command before network access", () => {
  for (const mutate of [(t: ReturnType<typeof setup>) => { t.source.grid[1][5] = 999; }, (t: ReturnType<typeof setup>) => { t.source.formulas[1] = ["", "", "", "", "", "=125"]; }]) {
    const t = setup(); t.connect(); t.pin(); mutate(t);
    assert.throws(() => t.api.laserFocusCommand({ action: "approve", draftId: "draft", revision: 1 }), /source cells changed/);
    assert.equal(t.calls.length, 0);
    assert.match(t.api.laserFocusContext().selectionError, /source cells changed/);
  }
});

test("successful reset clears the persisted source pin only, while a rejected reset preserves it", () => {
  const t = setup(); t.connect(); t.pin();
  const original = structuredClone(t.source.grid);
  t.setFetcher(() => ({ status: 409, body: { error: "Wait for the active draft before resetting." } }));
  assert.throws(() => t.api.laserFocusCommand({ action: "reset" }), /active draft/);
  assert.ok(t.api.laserFocusContext().selection);
  t.setFetcher(() => ({ status: 200, body: { dashboard: {} } }));
  t.api.laserFocusCommand({ action: "reset" });
  const context = t.api.laserFocusContext();
  assert.equal(context.selection, null);
  assert.equal(context.configured, true);
  assert.equal(context.backendUrl, "https://bridge.example.test");
  assert.deepEqual(t.source.grid, original);
  assert.equal(t.sheets.length, 2);
  assert.throws(() => t.api.laserFocusCommand({ action: "preview", mapping: {} }), /Read selected rows first/);
});

test("a source change during a backend operation prevents its response being treated as current", () => {
  const t = setup(); t.connect(); t.pin();
  t.setFetcher(() => { t.source.grid[1][5] = 999; return { status: 200, body: { draft: {} } }; });
  assert.throws(() => t.api.laserFocusCommand({ action: "generate", mode: "demo", requestId: "request" }), /while this action was running/);
});

test("approved writeback creates a literal-text tab once, preserves source rows and reuses the pinned range", () => {
  const t = setup(); t.connect(); t.pin();
  const original = structuredClone(t.source.grid);
  t.approve([["Approved report", "Value"], ["=HYPERLINK(\"https://example.test\")", " +SUM(1,2)"], ["@command", "-20"], ["Normal narrative", "Verified"]]);
  const first = t.api.laserFocusWriteReport({ draftId: "draft-approved-001", revision: 2 });
  assert.equal(first.replayed, false);
  assert.equal(t.sheets.length, 3);
  assert.deepEqual(t.source.grid, original);
  const created = t.sheets[2];
  assert.ok(created.formats.includes("@"));
  assert.ok(created.formulas.flat().every(value => value === ""));
  assert.equal(created.grid[1][0], '=HYPERLINK("https://example.test")');
  assert.equal(JSON.parse(created.metadata[0].value).complete, true);
  const second = t.api.laserFocusWriteReport({ draftId: "draft-approved-001", revision: 2 });
  assert.equal(second.replayed, true);
  assert.equal(second.url, first.url);
  assert.equal(t.sheets.length, 3);
  assert.equal(t.lockHeld(), false);
});

test("writeback rejects mismatched approval and source identities before creating a tab", () => {
  for (const change of [{ draftId: "wrong-draft" }, { revision: 3 }, { sourceHash: "b".repeat(64) }, { approvalDigest: "not-an-approval" }]) {
    const t = setup(); t.connect(); t.pin();
    t.setFetcher(input => ({ status: 200, body: { export: { rows: [["Approved", "Value"]], draftId: "draft-approved-001", revision: 2, approvalDigest: "a".repeat(64), sourceHash: digest(input.selection), ...change } } }));
    assert.throws(() => t.api.laserFocusWriteReport({ draftId: "draft-approved-001", revision: 2 }), /does not match/);
    assert.equal(t.sheets.length, 2);
  }
});

test("writeback aborts if the sheet changes during export or another write holds the lock", () => {
  const t = setup(); t.connect(); t.pin();
  t.setFetcher(input => { t.source.grid[1][5] = 999; return { status: 200, body: { export: { rows: [["Approved", "Value"]], draftId: "draft-approved-001", revision: 2, approvalDigest: "a".repeat(64), sourceHash: digest(input.selection) } } }; });
  assert.throws(() => t.api.laserFocusWriteReport({ draftId: "draft-approved-001", revision: 2 }), /while this action was running/);
  assert.equal(t.sheets.length, 2);
  t.pin(); t.approve(); t.disallowLock();
  assert.throws(() => t.api.laserFocusWriteReport({ draftId: "draft-approved-001", revision: 2 }), /Another Laser Focus write/);
  assert.equal(t.sheets.length, 2);
});

test("a source race during local write leaves an incomplete marker and never overwrites on retry", () => {
  const t = setup(); t.connect(); t.pin(); t.approve();
  t.setFlush(() => { t.source.grid[1][5] = 999; });
  assert.throws(() => t.api.laserFocusWriteReport({ draftId: "draft-approved-001", revision: 2 }), /could not be verified/);
  assert.equal(JSON.parse(t.sheets[2].metadata[0].value).complete, false);
  assert.equal(t.lockHeld(), false);
  t.source.grid[1][5] = 125; t.setFlush(() => {});
  assert.throws(() => t.api.laserFocusWriteReport({ draftId: "draft-approved-001", revision: 2 }), /earlier write stopped/);
  assert.equal(t.sheets.length, 3);
});

test("an existing named tab or edited prior report is never overwritten", () => {
  const t = setup(); t.connect(); t.pin(); t.approve();
  t.workbook.insertSheet("Laser Focus report draftapprove r2 aaaaaa").grid = [["User content"]];
  assert.throws(() => t.api.laserFocusWriteReport({ draftId: "draft-approved-001", revision: 2 }), /will not overwrite/);
  assert.equal(t.sheets[2].grid[0][0], "User content");
  t.sheets[2].name = "Renamed user tab";
  t.api.laserFocusWriteReport({ draftId: "draft-approved-001", revision: 2 });
  t.sheets[3].grid[1][0] = "Edited by a person";
  assert.throws(() => t.api.laserFocusWriteReport({ draftId: "draft-approved-001", revision: 2 }), /do not match the approved/);
  assert.equal(t.sheets[3].grid[1][0], "Edited by a person");
  assert.equal(t.sheets.length, 4);
});

test("backend auth, redirect and validation failures return useful errors without secrets", () => {
  const t = setup(); t.connect();
  for (const [status, body, expected] of [[401, { error: fakeToken }, /connection token/], [302, "redirect", /redirected/], [502, "<html>gateway failure</html>", /unexpected response/], [422, { error: "Approval blocked", issues: [{ message: "Giving must match the recorded amount." }] }, /Approval blocked.*Giving must match/]] as const) {
    t.setFetcher(() => ({ status, body }));
    assert.throws(() => t.api.laserFocusCommand({ action: "status" }), (error: unknown) => typeof error === "object" && expected.test(String(error)) && !String(error).includes(fakeToken));
  }
});

test("demo creation is additive, selects fictional four-channel data and preserves all existing sheets", () => {
  const t = setup(); const original = structuredClone(t.source.grid);
  const first = t.api.createLaserFocusDemo();
  assert.equal(first.summary.sheetName, "Laser Focus demo gifts");
  assert.equal(first.summary.rowCount, 7);
  assert.deepEqual(new Set(first.selection.values.slice(1).map((row: Cell[]) => row[7])), new Set(["online", "tickets", "auction", "check"]));
  assert.equal(first.selection.values.slice(1).reduce((sum: number, row: Cell[]) => sum + Number(row[5]), 0), 635);
  assert.deepEqual(t.source.grid, original);
  const second = t.api.createLaserFocusDemo();
  assert.equal(second.summary.sheetName, "Laser Focus demo gifts 2");
  assert.equal(t.sheets.length, 4);
  assert.equal(t.privateTab.reads, 0);
});
