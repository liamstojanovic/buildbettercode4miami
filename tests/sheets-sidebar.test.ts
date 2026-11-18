import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { createSheetsWorkspace, executeSheetsCommand } from "../src/lib/sheets";
import type { SheetsSelection } from "../src/lib/sheets-types";

const html = readFileSync("integrations/google-sheets/Sidebar.html", "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/u)![1];
type Listener = (event: { preventDefault(): void }) => unknown;

/** Small DOM boundary: tests exercise UI commands against the real adapter, not layout. */
class Element {
  private identifier = "";
  private ownText = "";
  children: Element[] = [];
  listeners: Record<string, Listener[]> = {};
  attributes: Record<string, string> = {};
  value = "";
  className = "";
  hidden = false;
  disabled = false;
  open = false;
  type = "";
  step = "";
  href = "";
  target = "";
  rel = "";
  constructor(public tag: string, private document: Document) {}
  get id() { return this.identifier; }
  set id(value: string) { this.identifier = value; this.document.ids.set(value, this); }
  get textContent(): string { return this.ownText + this.children.map(child => child.textContent).join(""); }
  set textContent(value: string) { this.ownText = String(value); this.children = []; }
  set innerHTML(_: string) { throw new Error("UI must not parse untrusted HTML"); }
  append(...items: Element[]) { this.children.push(...items); }
  replaceChildren(...items: Element[]) { this.ownText = ""; this.children = items; }
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  addEventListener(name: string, listener: Listener) { (this.listeners[name] ??= []).push(listener); }
  dispatch(name: string) { for (const listener of this.listeners[name] ?? []) listener({ preventDefault() {} }); }
  get classList() { return { toggle: (name: string, include: boolean) => { const classes = this.className.split(" ").filter(value => value && value !== name); if (include) classes.push(name); this.className = classes.join(" "); } }; }
}
class Document {
  ids = new Map<string, Element>();
  elements: Element[] = [];
  constructor() {
    for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gu)) {
      const element = this.createElement(match[1]); element.id = match[3]; element.hidden = /\bhidden\b/u.test(match[2]);
    }
    this.getElementById("mode").value = "demo";
    this.getElementById("amount-unit").value = "cents";
  }
  createElement(tag: string) { const element = new Element(tag, this); this.elements.push(element); return element; }
  getElementById(id: string) { const element = this.ids.get(id); assert.ok(element, `Missing UI element ${id}`); return element; }
  querySelectorAll(selector: string) { const tags = selector.split(","); return this.elements.filter(element => tags.includes(element.tag)); }
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture(): SheetsSelection {
  const values = [
    ["Gift ID", "Donor ID", "Donor name", "Email", "Phone", "Amount", "Gift date", "Channel"],
    ["g1", "r1", "Rosa Delgado", "rosa@example.test", "3055550101", 100, "2026-09-01", "online"],
    ["g2", "r2", "Rosa M. Delgado", "rosa@example.test", "3055550101", 50, "2026-09-02", "tickets"],
    ["g3", "other", "Rosa Delgado", "other@example.test", "3055550199", 25, "2026-09-03", "check"],
  ];
  return { workbookId: "sidebar-workbook", sheetId: 10, sheetName: "Donations", a1: "A1:H4", startRow: 1, startColumn: 1, values, formulas: values.map(row => row.map(() => "")) };
}

async function harness() {
  const document = new Document();
  const workspace = createSheetsWorkspace("sidebar-workbook");
  const selection = fixture();
  const calls: { name: string; argument: any }[] = [];
  let rejectBefore: ((command: any) => boolean) | undefined;
  let rejectBeforeMessage = "Network disconnected before save";
  let rejectAfter: ((command: any) => boolean) | undefined;
  let written = 0;
  const summary = () => ({ ...selection, values: undefined, formulas: undefined, rowCount: selection.values.length - 1, columnCount: selection.values[0].length, hash: "test-hash" });
  const invoke = async (name: string, argument: any) => {
    calls.push({ name, argument: argument === undefined ? undefined : JSON.parse(JSON.stringify(argument)) });
    if (name === "laserFocusContext" || name === "laserFocusConfigure") return { configured: true, backendUrl: "https://bridge.example.test", workbookId: selection.workbookId };
    if (name === "laserFocusReadSelection" || name === "createLaserFocusDemo") return { selection: structuredClone(selection), summary: summary() };
    if (name === "laserFocusCommand") {
      if (rejectBefore?.(argument)) throw new Error(rejectBeforeMessage);
      const command = JSON.parse(JSON.stringify(argument));
      if (!["status", "reset"].includes(command.action)) command.selection = structuredClone(selection);
      const result = await executeSheetsCommand(workspace, command);
      if (rejectAfter?.(argument)) throw new Error("Network interrupted after receiving the result");
      return result;
    }
    if (name === "laserFocusWriteReport") {
      await executeSheetsCommand(workspace, { action: "export", selection, ...argument }); written++;
      return { sheetName: "Approved report", url: "https://docs.google.com/spreadsheets/d/sidebar-workbook/edit#gid=11", replayed: false };
    }
    throw new Error(`Unexpected RPC ${name}`);
  };
  const run = () => {
    let success: (value: unknown) => void = () => {};
    let failure: (error: unknown) => void = () => {};
    let proxy: any;
    proxy = new Proxy({}, { get: (_, name) => {
      if (name === "withSuccessHandler") return (callback: typeof success) => { success = callback; return proxy; };
      if (name === "withFailureHandler") return (callback: typeof failure) => { failure = callback; return proxy; };
      return (argument: unknown) => { Promise.resolve().then(() => invoke(String(name), argument)).then(success, failure); };
    } });
    return proxy;
  };
  const context = createContext({ document, google: { script: { get run() { return run(); } } }, URL, Intl, crypto: { randomUUID: (() => { let id = 0; return () => `ui-request-${++id}`; })() } });
  runInContext(script, context);
  await flush();
  const element = (id: string) => document.getElementById(id);
  const click = async (id: string) => { const target = element(id); assert.equal(target.disabled, false, `${id} must be available`); target.dispatch("click"); await flush(); };
  const input = (target: Element, value: string) => { target.value = value; target.dispatch("input"); };
  const importRows = async () => { await click("read-selection"); await click("preview"); await click("import"); };
  return { document, workspace, selection, calls, element, click, input, importRows, written: () => written, before: (fn?: typeof rejectBefore, message = "Network disconnected before save") => { rejectBefore = fn; rejectBeforeMessage = message; }, after: (fn?: typeof rejectAfter) => { rejectAfter = fn; } };
}

test("sidebar maps selected cells, previews without mutation and runs reviewed import-to-report with real backend", async () => {
  const app = await harness();
  await app.click("read-selection");
  assert.match(app.element("selection-source").textContent, /3 donation rows/u);
  assert.equal(app.element("amount-unit").value, "dollars");
  await app.click("preview");
  assert.equal(app.workspace.state.gifts.length, 0, "preview must remain a dry run");
  assert.match(app.element("preview-metrics").textContent, /\$175\.00/u);
  await app.click("import");
  assert.equal(app.workspace.state.gifts.length, 3);
  const mergeButton = app.element("candidates").children[0].children.at(-1)!.children[0];
  mergeButton.dispatch("click"); await flush();
  assert.equal(app.workspace.state.donors.filter(donor => !donor.mergedInto).length, 2);
  assert.match(app.element("current-metrics").textContent, /\$175\.00/u);
  await app.click("generate");
  assert.equal(app.workspace.state.drafts.length, 1, app.element("error").textContent);
  assert.equal(app.element("error").hidden, true, app.element("error").textContent);
  assert.equal(app.element("write-report").disabled, true, "a generated draft is not approved");
  const participants = app.element("claims").children[0].children[0].children[0];
  app.input(participants, "999");
  assert.equal(app.element("approve").disabled, true, "unsaved text cannot be approved");
  await app.click("save-draft");
  await app.click("approve");
  assert.equal(app.workspace.state.drafts[0].status, "pending");
  assert.match(app.element("error").textContent, /Approval blocked/u);
  const currentParticipants = app.element("claims").children[0].children[0].children[0];
  app.input(currentParticipants, "4"); await app.click("save-draft"); await app.click("approve");
  assert.equal(app.workspace.state.drafts[0].status, "approved");
  assert.equal(app.written(), 0, "approval never implicitly writes cells");
  await app.click("write-report");
  assert.equal(app.written(), 1);
  assert.match(app.element("write-result").textContent, /Approved report/u);
});

test("a failed save preserves unsaved editor text and cannot enable approval or export", async () => {
  const app = await harness(); await app.importRows(); await app.click("generate");
  app.input(app.element("narrative"), "This local edit must survive a connection failure.");
  app.before(command => command.action === "edit");
  await app.click("save-draft");
  assert.equal(app.element("narrative").value, "This local edit must survive a connection failure.");
  assert.equal(app.element("save-draft").disabled, false);
  assert.equal(app.element("approve").disabled, true);
  assert.equal(app.element("write-report").disabled, true);
  app.before(); await app.click("save-draft");
  assert.equal(app.workspace.state.drafts[0].narrative, "This local edit must survive a connection failure.");
});

test("a lost generation response retries the same saved request without creating a second draft", async () => {
  const app = await harness(); await app.importRows();
  let once = true;
  app.after(command => { if (command.action === "generate" && once) { once = false; return true; } return false; });
  await app.click("generate");
  assert.equal(app.workspace.state.drafts.length, 1);
  assert.equal(app.element("mode").disabled, true);
  assert.equal(app.element("generate").textContent, "Retry saved request");
  await app.click("generate");
  const attempts = app.calls.filter(call => call.argument?.action === "generate");
  assert.equal(app.element("error").hidden, true, app.element("error").textContent);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].argument.requestId, attempts[1].argument.requestId);
  assert.equal(app.workspace.state.drafts.length, 1);
  assert.equal(app.element("mode").disabled, false);
});

test("selected cell markup stays literal text and changing mapping invalidates the reviewed preview", async () => {
  const app = await harness();
  app.selection.values[1][2] = '<img src=x onerror="steal()">';
  await app.click("read-selection");
  assert.match(app.element("selection-sample").textContent, /<img src=x/u);
  assert.equal(app.document.elements.some(element => element.tag === "img"), false);
  await app.click("preview");
  assert.equal(app.element("import").disabled, false);
  app.element("amount-unit").value = "cents"; app.element("amount-unit").dispatch("change");
  assert.equal(app.element("import").disabled, true);
  assert.equal(app.element("preview-panel").hidden, true);
});

test("reset requires confirmation and clears only workbook backend records while preserving source cells and exported tabs", async () => {
  const app = await harness(); await app.importRows(); await app.click("generate"); await app.click("approve"); await app.click("write-report");
  const source = structuredClone(app.selection);
  const writtenTabs = app.written();
  await app.click("reset-demo");
  assert.equal(app.element("reset-confirm").hidden, false);
  assert.equal(app.calls.some(call => call.argument?.action === "reset"), false, "opening the confirmation must not reset data");
  await app.click("reset-cancel");
  assert.equal(app.workspace.state.gifts.length, 3);
  await app.click("reset-demo"); await app.click("reset-confirm-button");
  assert.equal(app.workspace.state.gifts.length, 0);
  assert.equal(app.workspace.state.drafts.length, 0);
  assert.deepEqual(app.selection, source);
  assert.equal(app.written(), writtenTabs, "reset must not recreate, delete or write output tabs");
  assert.equal(app.calls.some(call => call.name === "createLaserFocusDemo"), false);
  assert.equal(app.element("selection-panel").hidden, true);
  assert.equal(app.element("pinned-selection").hidden, true);
  assert.equal(app.element("report-panel").hidden, true);
  assert.equal(app.element("reset-confirm").hidden, true);
  assert.equal(app.element("reset-demo").disabled, false, "the connection remains usable");
});

test("Google's specific storage permission failure explains single-account recovery without rewriting other errors", async () => {
  const app = await harness(); await app.importRows();
  const gifts = structuredClone(app.workspace.state.gifts);
  app.before(() => true, "We're sorry, a server error occurred while reading from storage. Error code PERMISSION_DENIED.");
  await app.click("refresh");
  assert.match(app.element("error").textContent, /browser profile signed in only to the Google account that installed Laser Focus/u);
  assert.match(app.element("error").textContent, /then reopen Laser Focus/u);
  assert.deepEqual(app.workspace.state.gifts, gifts);
  assert.equal(app.element("refresh").disabled, false, "a Google account error must not leave the UI locked");
  const otherError = "PERMISSION_DENIED: the workbook owner has not granted access.";
  app.before(() => true, otherError); await app.click("refresh");
  assert.equal(app.element("error").textContent, otherError, "unrelated permission errors retain their original explanation");
});
