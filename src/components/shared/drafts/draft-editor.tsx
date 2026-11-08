"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Download, Link2, LoaderCircle, Save, Send } from "lucide-react";
import type { Claim, Dashboard, Draft, ValidationIssue } from "@/lib/types";
import { ApiError, errorMessage } from "@/lib/client-api";
import { formatMetric } from "@/lib/format";

export type DraftEditorProps = {
  draft: Draft;
  dashboard: Dashboard;
  onError: (message: string) => void;
  onEvidence: (ids: string[], title: string) => void;
  onSaveDraft: (draftId: string, revision: number, narrative: string, claims: Claim[]) => Promise<Draft>;
  onApproveDraft: (draftId: string, revision: number) => Promise<Draft>;
  onSendDraft: (draftId: string, revision: number) => Promise<void>;
};

export default function DraftEditor({ draft, dashboard, onError, onEvidence, onSaveDraft, onApproveDraft, onSendDraft }: DraftEditorProps) {
  const [narrative, setNarrative] = useState(draft.narrative);
  const [claims, setClaims] = useState<Array<{ metricId: string; value: string }>>(() => draft.claims.map((claim) => ({ ...claim, value: String(claim.value) })));
  const [busy, setBusy] = useState<"save" | "approve" | "send" | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setNarrative(draft.narrative);
    setClaims(draft.claims.map((claim) => ({ ...claim, value: String(claim.value) })));
  }, [draft.narrative, draft.claims, draft.revision]);
  const dirty = narrative !== draft.narrative || claims.some((claim, index) => claim.metricId !== draft.claims[index]?.metricId || claim.value !== String(draft.claims[index]?.value));
  const stale = draft.dataRevision !== dashboard.state.revision;
  const grant = dashboard.state.grants.find((grant) => grant.id === draft.grantId);
  const renderedWords = [narrative.trim(), ...claims.map((claim) => {
    const metric = dashboard.metrics.find((item) => item.id === claim.metricId);
    const value = metric?.unit === "USD" ? formatMetric(Number(claim.value), "USD") : `${claim.value} ${metric?.unit ?? ""}`.trim();
    return `${metric?.label ?? claim.metricId}: ${value}`;
  })].filter(Boolean).join("\n").trim().split(/\s+/).filter(Boolean).length;
  const receipt = dashboard.state.outbox.find((item) => item.draftId === draft.id && item.draftRevision === draft.revision);

  async function simulateDelivery() {
    setBusy("send"); onError("");
    try {
      await onSendDraft(draft.id, draft.revision);
    } catch (err) { onError(errorMessage(err)); } finally { setBusy(null); }
  }

  async function save(approve: boolean) {
    setBusy(approve ? "approve" : "save"); setIssues([]); setSaved(false); onError("");
    try {
      let currentRevision = draft.revision;
      if (dirty) {
        if (claims.some((claim) => !claim.value.trim() || !Number.isFinite(Number(claim.value)))) throw new Error("Every fact needs a valid number before it can be saved.");
        const patched = await onSaveDraft(draft.id, draft.revision, narrative, claims.map((claim): Claim => ({ metricId: claim.metricId, value: Number(claim.value) })));
        currentRevision = patched.revision;
      }
      if (approve) {
        await onApproveDraft(draft.id, currentRevision);
      }
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.issues.length) setIssues(err.issues);
      else onError(errorMessage(err));
    } finally { setBusy(null); }
  }

  return <section className="panel editor-panel" aria-labelledby="draft-title">
    <div className="panel-heading"><div><span className="eyebrow">{draft.kind === "report" ? "QUARTERLY REPORT" : draft.kind === "application" ? "GRANT APPLICATION" : "FOLLOW-UP DRAFT"}</span><h2 id="draft-title">{draft.title}</h2></div><span className={`pill ${draft.status === "approved" && !dirty && !stale ? "pill-green" : "pill-amber"}`}>{dirty ? "Unsaved edits" : stale ? "Record changed" : draft.status === "approved" ? "Approved" : "Needs your review"}</span></div>
    <div className="editor-body">
      <div className="draft-meta"><span>{draft.mode === "live" ? "Drafted with the OpenAI agent" : "Deterministic demo template · no model call"}</span><span>Revision {draft.revision}</span></div>
      {stale ? <div className="notice notice-warning"><AlertCircle size={18} /><span>The underlying record changed. Generate a fresh draft before approval.</span></div> : null}
      {grant ? <div className="application-context"><p>{grant.applicationQuestion}</p><span className={`pill ${renderedWords > grant.wordLimit ? "pill-coral" : "pill-green"}`}>{renderedWords} / {grant.wordLimit} words including facts</span></div> : null}
      <label className="narrative-label">The story<textarea className="narrative-editor" value={narrative} rows={draft.kind === "report" ? 7 : 5} onChange={(event) => { setNarrative(event.target.value); setSaved(false); setIssues([]); }} /><span className="field-hint">Keep numeric claims in the fact fields below so each figure can be checked against the record.</span></label>
      {claims.length ? <div className="claim-section"><div className="claim-heading"><h3>Figures checked against the record</h3><span>Each figure must match a live metric. Change one and try to approve — the check will block it.</span></div><div className="claims-grid">{claims.map((claim, index) => {
        const metric = dashboard.metrics.find((metric) => metric.id === claim.metricId);
        const mismatch = metric && Number(claim.value) !== metric.value;
        return <div className={`claim-card ${mismatch ? "claim-mismatch" : ""}`} key={claim.metricId}><label>{metric?.label ?? claim.metricId}<div className="claim-input-wrap">{metric?.unit === "USD" ? <span>$</span> : null}<input inputMode="decimal" type="number" step="any" value={claim.value} onChange={(event) => { setClaims((current) => current.map((item, i) => i === index ? { ...item, value: event.target.value } : item)); setSaved(false); setIssues([]); }} /></div></label><div className="claim-check">{mismatch ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}<span>Record: {metric ? formatMetric(metric.value, metric.unit) : "Metric unavailable"}</span></div>{metric ? <button className="text-button" onClick={() => onEvidence(metric.sourceIds, metric.label)}><Link2 size={13} />Source evidence</button> : null}</div>;
      })}</div></div> : null}
      <button className="text-button" onClick={() => onEvidence(draft.sourceIds, `Evidence for ${draft.title}`)}><Link2 size={14} />View all supporting records</button>
      {issues.length ? <div className="validation-panel" role="alert"><div><AlertCircle size={19} /><h3>Approval paused. Let’s check the facts.</h3></div><ul>{issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul></div> : null}
      {saved ? <p className="success-line" role="status"><CheckCircle2 size={16} />{draft.status === "approved" ? "Approved. This exact revision is ready to export." : "Your changes are saved for review."}</p> : null}
      {receipt ? <div className="simulation-receipt" role="status"><CheckCircle2 size={17} /><div><strong>Simulated delivery recorded</strong><p>{receipt.recipient} · Revision {receipt.draftRevision} · {new Date(receipt.sentAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p><small>This is a local demo receipt. No external message was sent.</small></div></div> : null}
    </div>
    <div className="editor-actions"><p>{draft.kind === "followup" ? "Approval saves a reviewed draft. Delivery is simulated only." : "Edits require a new review before export."}</p><div><button className="button button-outline" disabled={busy !== null || !dirty} onClick={() => save(false)}>{busy === "save" ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}Save draft</button>{draft.status === "approved" && !dirty && !stale ? <><a className="button button-outline" href={`/api/drafts/${draft.id}/export`} download><Download size={16} />Export</a>{draft.kind === "followup" && !receipt ? <button className="button button-primary" disabled={busy !== null} onClick={simulateDelivery}>{busy === "send" ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}Simulate delivery</button> : null}</> : <button className="button button-primary" disabled={busy !== null || stale} onClick={() => save(true)}>{busy === "approve" ? <LoaderCircle size={15} className="spin" /> : <Check size={16} />}Check & approve</button>}</div></div>
  </section>;
}
