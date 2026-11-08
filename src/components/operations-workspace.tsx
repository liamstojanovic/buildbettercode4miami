"use client";

import { useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, FileInput, FileText, GitMerge, Heart, Link2, LoaderCircle, Mail, Phone, Plus, Sparkles, Users } from "lucide-react";
import type { Dashboard, Draft } from "@/lib/types";
import { errorMessage } from "@/lib/client-api";
import { formatMetric } from "@/lib/format";
import ToastNotice from "@/components/shared/notice/toast-notice";

type Props = {
  dashboard: Dashboard;
  onMerge: (candidateId: string, decision: "approve" | "reject") => Promise<void>;
  onImport: (csv: string, sourceName: string) => Promise<{ inserted: number; skipped: number }>;
  onSaveAttendance: (participantId: string, date: string, status: "present" | "absent" | "cancelled" | "scheduled") => Promise<void>;
  onDraftFollowup: (queueItemId: string) => Promise<Draft>;
  readCsvFile: (file: File) => Promise<{ name: string; text: string }>;
  onError: (message: string) => void;
  onEvidence: (ids: string[], title: string) => void;
  onDrafted?: (draft: Draft, personName?: string) => void;
};

export function OperationsWorkspace({ dashboard, onMerge, onImport, onSaveAttendance, onDraftFollowup, readCsvFile, onError, onEvidence, onDrafted }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [csv, setCsv] = useState("");
  const [sourceName, setSourceName] = useState("new-gifts.csv");
  const [notice, setNotice] = useState("");
  const [participantId, setParticipantId] = useState(dashboard.state.participants[0]?.id ?? "");
  const [attendanceDate, setAttendanceDate] = useState(dashboard.state.period.end);
  const [attendanceStatus, setAttendanceStatus] = useState<"present" | "absent" | "cancelled" | "scheduled">("present");
  const fileInput = useRef<HTMLInputElement>(null);
  const { state, metrics, queue } = dashboard;
  const pending = state.candidates.filter((candidate) => candidate.status === "pending");
  const reviewed = state.candidates.filter((candidate) => candidate.status !== "pending");
  const sources = Array.from(new Set(state.sources.map((source) => source.source)));

  async function decide(candidateId: string, decision: "approve" | "reject") {
    setBusy(candidateId); onError(""); setNotice("");
    try {
      await onMerge(candidateId, decision);
      setNotice(decision === "approve" ? "Records joined. Gift history and total dollars are preserved." : "Records kept separate. Your review is recorded.");
    } catch (err) { onError(errorMessage(err)); } finally { setBusy(null); }
  }

  async function draftFollowup(queueItemId: string) {
    setBusy(queueItemId); onError("");
    try {
      const draft = await onDraftFollowup(queueItemId);
      onDrafted?.(draft, queue.find((item) => item.id === queueItemId)?.name);
    } catch (err) { onError(errorMessage(err)); } finally { setBusy(null); }
  }

  async function importCsv() {
    setBusy("import"); onError(""); setNotice("");
    try {
      const result = await onImport(csv, sourceName);
      setNotice(`${result.inserted} gifts imported. ${result.skipped} previously imported gifts skipped.`); setCsv(""); setShowImport(false);
    } catch (err) { onError(errorMessage(err)); } finally { setBusy(null); }
  }

  async function saveAttendance() {
    setBusy("attendance"); onError(""); setNotice("");
    try {
      await onSaveAttendance(participantId, attendanceDate, attendanceStatus);
      setNotice("Attendance recorded once. The follow-up queue and report metrics now use this entry.");
    } catch (err) { onError(errorMessage(err)); } finally { setBusy(null); }
  }

  return <div className="workspace-content">
    <section aria-label="Quarter at a glance" className="metric-grid">{metrics.map((metric, index) => <button className="metric-card" key={metric.id} onClick={() => onEvidence(metric.sourceIds, metric.label)}>
      <span className="metric-label">{metric.label}<ArrowRight size={15} /></span><strong>{formatMetric(metric.value, metric.unit)}</strong><span className="metric-foot"><span className={`metric-dot dot-${index % 3}`} />{metric.unit === "USD" ? "In this quarter" : metric.unit} <span>· View evidence</span></span>
    </button>)}</section>

    {notice ? <ToastNotice message={notice} onDismiss={() => setNotice("")} /> : null}

    <section className="panel merge-panel" aria-labelledby="merge-title">
      <div className="panel-heading"><div className="section-title"><span className="section-icon amber"><GitMerge size={19} /></span><div><h2 id="merge-title">A familiar name, a few different records</h2><p>Review the evidence before bringing someone’s history together.</p></div></div><span className={`pill ${pending.length ? "pill-amber" : "pill-green"}`}>{pending.length ? `${pending.length} to review` : "All reviewed"}</span></div>
      {pending.map((candidate) => <div className="candidate" key={candidate.id}>
        <div className="candidate-title"><h3>{candidate.name}</h3><button className="text-button" onClick={() => onEvidence(candidate.sourceIds, `Match evidence · ${candidate.name}`)}><Link2 size={14} />See original records</button></div>
        <div className="donor-grid">{candidate.donorIds.map((id) => {
          const donor = state.donors.find((person) => person.id === id);
          if (!donor) return null;
          const gifts = state.gifts.filter((gift) => gift.donorId === donor.id);
          return <article className="donor-card" key={donor.id}><div className="donor-card-top"><span className="person-avatar">{donor.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span className="source-tag">{gifts[0]?.channel ?? "Source record"}</span></div><h4>{donor.name}</h4><p><Mail size={13} />{donor.emails.join(", ") || "No email on file"}</p><p><Phone size={13} />{donor.phone || "No phone on file"}</p><div className="donor-gifts"><strong>{formatMetric(gifts.reduce((total, gift) => total + gift.amountCents, 0) / 100, "USD")}</strong><span>{gifts.length} {gifts.length === 1 ? "gift" : "gifts"} in history</span></div></article>;
        })}</div>
        <div className="merge-reasons"><ShieldEvidence /> <span>{candidate.reasons.join(" · ")}</span></div>
        <div className="candidate-actions"><p>One person. Every gift kept. Total dollars unchanged.</p><div><button className="button button-outline" disabled={busy !== null} onClick={() => decide(candidate.id, "reject")}>Keep separate</button><button className="button button-primary" disabled={busy !== null} onClick={() => decide(candidate.id, "approve")}>{busy === candidate.id ? <LoaderCircle size={16} className="spin" /> : <GitMerge size={16} />}Approve merge</button></div></div>
      </div>)}
      {!pending.length ? <div className="review-complete"><span className="round-check"><Check size={22} /></span><div><h3>Every suggested match has a decision.</h3><p>Import another gift list to find new matches. Original records remain available.</p></div></div> : null}
      {reviewed.length ? <details className="reviewed-list"><summary>Review history <span>{reviewed.length}</span><ChevronDown size={15} /></summary>{reviewed.map((candidate) => <div key={candidate.id}><span>{candidate.name}</span><span className="pill pill-green">{candidate.status === "approved" ? "Merged with approval" : "Kept separate"}</span><button className="text-button" onClick={() => onEvidence(candidate.sourceIds, candidate.name)}>Evidence</button></div>)}</details> : null}
    </section>

    <section className="panel attendance-panel" aria-labelledby="attendance-title"><div><span className="eyebrow">TYPE IT ONCE</span><h2 id="attendance-title">Record a session</h2><p>Update attendance here. The queue and quarterly figures follow.</p></div><form onSubmit={(event) => { event.preventDefault(); void saveAttendance(); }}><label>Participant<select value={participantId} onChange={(event) => setParticipantId(event.target.value)}>{state.participants.map((participant) => <option value={participant.id} key={participant.id}>{participant.name}</option>)}</select></label><label>Session date<input type="date" required value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /></label><label>Attendance<select value={attendanceStatus} onChange={(event) => setAttendanceStatus(event.target.value as typeof attendanceStatus)}><option value="present">Present</option><option value="absent">Absent</option><option value="cancelled">Cancelled</option><option value="scheduled">Scheduled</option></select></label><button className="button button-primary" disabled={busy !== null || !participantId} type="submit">{busy === "attendance" ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}Save attendance</button></form></section>
    <div className="operations-lower-grid">
      <section className="panel queue-panel" aria-labelledby="queue-title">
        <div className="panel-heading"><div className="section-title"><span className="section-icon teal"><Heart size={19} /></span><div><h2 id="queue-title">A conversation could make a difference</h2><p>People to follow up with, and the reason why.</p></div></div><span className="pill pill-neutral">{queue.filter((item) => item.status === "open").length} open</span></div>
        <div className="queue-list">{queue.map((item) => <article className="queue-item" key={item.id}>
          <div className={`queue-avatar ${item.kind === "attendance" ? "coral" : "teal"}`}>{item.kind === "attendance" ? <Users size={20} /> : <Heart size={19} />}</div>
          <div className="queue-main"><div className="queue-title"><h3>{item.name}</h3><span className={`pill ${item.status === "approved" ? "pill-green" : item.priority === "high" ? "pill-coral" : "pill-amber"}`}>{item.status === "approved" ? "Draft approved" : item.kind === "attendance" ? "Check in" : "Giving follow-up"}</span></div><p>{item.reason}</p><small>{item.suggestedAction}</small><div className="queue-actions"><button className="text-button" onClick={() => onEvidence(item.sourceIds, `Why ${item.name} is here`)}><Link2 size={13} />Why this person?</button><button className="button button-small button-outline" disabled={busy !== null} onClick={() => draftFollowup(item.id)}>{busy === item.id ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}Draft a follow-up</button></div></div>
        </article>)}</div>
        {!queue.length ? <p className="empty-state">No follow-ups are due in this snapshot.</p> : null}
      </section>

      <section className="panel source-panel" aria-labelledby="sources-title">
        <div className="panel-heading"><div><span className="eyebrow">THE SHARED RECORD</span><h2 id="sources-title">Connected by evidence</h2><p>{state.sources.length} original rows. One place to look.</p></div><FileText className="muted" size={22} /></div>
        <div className="source-list">{sources.map((name) => {
          const ids = state.sources.filter((source) => source.source === name).map((source) => source.id);
          return <button key={name} onClick={() => onEvidence(ids, name)}><span className="source-file-icon"><FileText size={17} /></span><span><strong>{name}</strong><small>{ids.length} source rows</small></span><ArrowRight size={15} /></button>;
        })}</div>
        <button className="button button-outline import-toggle" aria-expanded={showImport} onClick={() => setShowImport(!showImport)}><Plus size={16} />Import gift CSV</button>
        {showImport ? <div className="import-form"><p className="muted">Use the normalized gift format. A repeated gift ID is skipped.</p><label>Source file name<input value={sourceName} onChange={(event) => setSourceName(event.target.value)} /></label><input ref={fileInput} className="visually-hidden" type="file" accept=".csv,text/csv" aria-label="Choose gift CSV" onChange={async (event) => { const file = event.target.files?.[0]; if (file) { try { const loaded = await readCsvFile(file); setCsv(loaded.text); setSourceName(loaded.name); } catch (err) { onError(errorMessage(err)); } } }} /><button className="button button-small button-outline" onClick={() => fileInput.current?.click()}><FileInput size={14} />Choose a file</button><label>CSV data<textarea rows={7} value={csv} placeholder="gift_id,donor_id,name,email,phone,amount_cents,date,channel" onChange={(event) => setCsv(event.target.value)} /></label><button className="button button-primary" disabled={busy !== null || !csv.trim()} onClick={importCsv}>{busy === "import" ? <LoaderCircle size={15} className="spin" /> : <FileInput size={15} />}Import & review</button></div> : null}
      </section>
    </div>
  </div>;
}

function ShieldEvidence() { return <span className="evidence-check"><Check size={13} /></span>; }
