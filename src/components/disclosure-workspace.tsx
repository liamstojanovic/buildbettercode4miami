"use client";

import { useState } from "react";
import { AlertCircle, Check, Download, Eye, FileCheck2, LoaderCircle, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import type { CounselingNote, Dashboard, Disclosure } from "@/lib/types";
import { errorMessage } from "@/lib/client-api";
import ToastNotice from "@/components/shared/notice/toast-notice";

type Props = {
  dashboard: Dashboard;
  onOpenNote: (noteId: string) => Promise<CounselingNote>;
  onSaveNote: (noteId: string, body: { goal: string; progress: string; privateDetail: string; durationMinutes: number }, expectedNoteHash?: string) => Promise<CounselingNote>;
  onCreatePreview: (noteId: string, grantId: string) => Promise<Disclosure>;
  onApproveDisclosure: (disclosureId: string, payloadHash: string) => Promise<Disclosure>;
  onError: (message: string) => void;
};

export function DisclosureWorkspace({ dashboard, onOpenNote, onSaveNote, onCreatePreview, onApproveDisclosure, onError }: Props) {
  const [note, setNote] = useState<CounselingNote | null>(null);
  const [noteHash, setNoteHash] = useState<string | undefined>(undefined);
  const [saveFailed, setSaveFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [progress, setProgress] = useState("");
  const [privateDetail, setPrivateDetail] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [notice, setNotice] = useState("");
  const [selectedDisclosureId, setSelectedDisclosureId] = useState<string | null>(null);
  const disclosure = dashboard.state.disclosures.find((item) => item.id === selectedDisclosureId && item.noteId === note?.id) ?? [...dashboard.state.disclosures].reverse().find((item) => item.noteId === note?.id);
  const grant = dashboard.state.grants.find((item) => item.id === note?.grantId);
  const stale = disclosure ? disclosure.dataRevision !== dashboard.state.revision : false;
  const dirty = note ? goal !== note.goal || progress !== note.progress || privateDetail !== note.privateDetail || Number(durationMinutes) !== note.durationMinutes : false;
  const accessEvents = dashboard.state.audit.filter((event) => /note|disclos/i.test(event.action));
  const payableCount = dashboard.state.notes.filter((summary) => summary.payable).length;
  const sessions = [...dashboard.state.notes].sort((a, b) => Number(a.payable) - Number(b.payable));

  function loadNoteEditor(next: CounselingNote) { setNote(next); setNoteHash(next.contentHash); setSaveFailed(false); setGoal(next.goal); setProgress(next.progress); setPrivateDetail(next.privateDetail); setDurationMinutes(String(next.durationMinutes)); }
  async function openNote(id: string) {
    setBusy(id); onError(""); setNotice("");
    try {
      loadNoteEditor(await onOpenNote(id)); setSelectedDisclosureId(null);
    } catch (err) { onError(`Could not open this session. ${errorMessage(err)}`); } finally { setBusy(null); }
  }
  async function saveNote() {
    if (!note) return;
    setBusy("save"); onError(""); setNotice("");
    try {
      const duration = Number(durationMinutes);
      if (!durationMinutes.trim() || !Number.isFinite(duration)) throw new Error("Enter a valid session duration.");
      loadNoteEditor(await onSaveNote(note.id, { goal, progress, privateDetail, durationMinutes: duration }, noteHash));
      setNotice("Note saved once. Generate a fresh funder preview to review the updated fields.");
    } catch (err) { setSaveFailed(true); onError(errorMessage(err)); } finally { setBusy(null); }
  }
  async function reloadLatest() {
    if (!note) return;
    if (!window.confirm("Reload the latest saved version of this note? Your unsaved edits will be discarded.")) return;
    await openNote(note.id);
  }
  async function preview() {
    if (!note) return;
    setBusy("preview"); onError(""); setNotice("");
    try {
      const created = await onCreatePreview(note.id, note.grantId);
      setSelectedDisclosureId(created.id);
    } catch (err) { onError(errorMessage(err)); } finally { setBusy(null); }
  }
  async function approve() {
    if (!disclosure) return;
    setBusy("approve"); onError(""); setNotice("");
    try {
      const approved = await onApproveDisclosure(disclosure.id, disclosure.payloadHash);
      setSelectedDisclosureId(approved.id);
      setNotice("This exact funder copy is approved for export. Nothing has been sent.");
    } catch (err) { onError(errorMessage(err)); } finally { setBusy(null); }
  }
  return <div className="workspace-content">
    <div className="grant-intro"><span className="section-icon teal"><LockKeyhole size={20} /></span><p>Write the session note once. Review exactly which fields enter the funder’s copy. Opening a note and approving a copy both leave a record.</p></div>
    {notice ? <ToastNotice message={notice} onDismiss={() => setNotice("")} /> : null}
    <div className="counseling-grid"><section className="panel session-library"><div className="panel-heading"><div><span className="eyebrow">A FICTIONAL WEEK</span><h2>Counseling sessions</h2></div><span className="pill pill-neutral">{payableCount} payable · {dashboard.state.notes.length - payableCount} not payable</span></div><div className="session-list">{sessions.map((summary) => <button key={summary.id} className={note?.id === summary.id ? "selected" : ""} disabled={busy !== null} onClick={() => openNote(summary.id)}><span className="session-date">{summary.date.slice(5, 10)}</span><span><strong>Family {summary.familyCode}</strong><small>{summary.counselor}</small></span>{busy === summary.id ? <LoaderCircle className="spin" size={15} /> : summary.payable ? <Eye size={15} /> : <span className="pill pill-coral">Not payable</span>}</button>)}</div></section>
    {note ? <div className="note-workspace"><div className="note-comparison"><section className="panel internal-note"><div className="panel-heading"><div><span className="eyebrow">INTERNAL NOTE</span><h2>Family {note.familyCode}</h2></div><span className="pill pill-coral"><LockKeyhole size={11} />Private</span></div><div className="note-body"><div className="note-metadata"><span>{note.date}</span><span>{note.counselor}</span><span>{note.service}</span></div><label>Session duration (minutes)<input type="number" min="1" step="1" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} /></label><label>Session goal<textarea rows={3} value={goal} onChange={(event) => setGoal(event.target.value)} /></label><label>Progress<textarea rows={4} value={progress} onChange={(event) => setProgress(event.target.value)} /></label><label className="private-field">Private detail · internal only<textarea rows={3} value={privateDetail} onChange={(event) => setPrivateDetail(event.target.value)} /><span className="field-hint">Excluded from this funder’s allowed fields.</span></label><button className="button button-outline" disabled={!dirty || busy !== null} onClick={saveNote}>{busy === "save" ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}Save note</button>{saveFailed ? <div className="notice notice-warning" role="alert"><AlertCircle size={16} /><span>Your edits above are preserved. If another counselor saved this note since you opened it, reload the latest version, then reapply your changes.</span><button className="button button-outline" disabled={busy !== null} onClick={reloadLatest}>Reload latest</button></div> : null}</div></section>
      <section className="panel funder-copy"><div className="panel-heading"><div><span className="eyebrow">FUNDER COPY</span><h2>{grant?.name ?? "Review the disclosure"}</h2></div><ShieldCheck size={20} className="muted" /></div><div className="note-body">
        {!note.payable ? <div className="nonpayable-message"><AlertCircle size={23} /><h3>This session is not funder-payable.</h3><p>It stays in the internal record and is excluded from the funder’s copy.</p></div> : <><p className="field-hint">Only fields allowed by this funder are included. Review the exact payload below before approving.</p><button className="button button-primary" disabled={busy !== null || dirty} onClick={preview}>{busy === "preview" ? <LoaderCircle size={15} className="spin" /> : <Eye size={15} />}{disclosure ? "Refresh preview" : "Create funder preview"}</button>{dirty ? <p className="field-hint">Save your note changes before generating the preview.</p> : null}</>}
        {disclosure && note.payable ? <><div className={`notice ${stale ? "notice-warning" : "notice-success"}`}>{stale ? <AlertCircle size={16} /> : <Check size={16} />}<span>{stale ? "The record changed. Refresh this preview before approval or export." : disclosure.status === "approved" ? "This exact copy is approved." : "Ready for counselor review."}</span></div><dl className="funder-fields">{Object.entries(disclosure.payload).map(([field, value]) => <div key={field}><dt>{field.replace(/([A-Z])/g, " $1").replaceAll("_", " ")}</dt><dd>{String(value)}</dd></div>)}</dl><div className="excluded-fields"><strong>Kept out of this copy</strong><div>{disclosure.excludedFields.map((field) => <span key={field}><LockKeyhole size={10} />{field}</span>)}</div></div><details className="exact-payload"><summary>View exact JSON payload</summary><pre>{JSON.stringify(disclosure.payload, null, 2)}</pre></details>{disclosure.status === "approved" && !stale && !dirty ? <a className="button button-primary" href={`/api/disclosures/${disclosure.id}/export`} download><Download size={15} />Export approved copy</a> : <button className="button button-primary" disabled={busy !== null || stale || dirty} onClick={approve}>{busy === "approve" ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}Approve this copy</button>}<p className="field-hint">Exports a reviewed copy. Nothing is submitted to a funder.</p></> : null}
      </div></section></div></div> : <div className="panel report-empty"><span className="empty-art"><FileCheck2 size={40} strokeWidth={1.3} /></span><h2>One note. Only what’s needed.</h2><p>Choose a session to review the full internal note and generate a funder copy. Private note contents load only when you open that session.</p></div>}
    </div>
    <section className="panel access-log"><div className="panel-heading"><div><span className="eyebrow">COUNSELOR REVIEW TRAIL</span><h2>Access & disclosure history</h2></div><span className="pill pill-neutral">{accessEvents.length} events</span></div>{accessEvents.length ? <div className="access-events">{[...accessEvents].reverse().slice(0, 12).map((event) => <article key={event.id}><span className="evidence-check"><Check size={13} /></span><div><strong>{event.action.replaceAll("_", " ")}</strong><p>{event.detail}</p></div><time>{new Date(event.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</time></article>)}</div> : <p className="library-empty">Opening a session will create the first access record.</p>}</section>
  </div>;
}
