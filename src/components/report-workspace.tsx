"use client";

import { useState } from "react";
import { ArrowRight, Check, FileCheck2, FileText, Link2, LoaderCircle, Sparkles } from "lucide-react";
import type { AgentRun, Claim, Dashboard, Draft } from "@/lib/types";
import { errorMessage } from "@/lib/client-api";
import DraftEditor from "@/components/shared/drafts/draft-editor";

type Props = {
  dashboard: Dashboard;
  onGenerateReport: () => Promise<Draft>;
  onSaveDraft: (draftId: string, revision: number, narrative: string, claims: Claim[]) => Promise<Draft>;
  onApproveDraft: (draftId: string, revision: number) => Promise<Draft>;
  onSendDraft: (draftId: string, revision: number) => Promise<void>;
  onError: (message: string) => void;
  onEvidence: (ids: string[], title: string) => void;
  selectedDraftId: string | null;
  onSelectDraft: (id: string) => void;
  kinds?: Array<Draft["kind"]>;
  onDrafted?: (draft: Draft) => void;
};

/** Token labels follow the backend handoff: only `usageKnown: true` may be shown as a
 *  complete total; partial counts are labeled partial, legacy runs as completeness
 *  unknown, and unknown usage is never presented as a zero-cost run. */
function tokenLabel(run: AgentRun): string {
  const total = run.inputTokens + run.outputTokens;
  if (run.usageKnown === false) return total > 0 ? `Reported tokens: ${total} · partial; total unknown` : "Token usage unknown";
  if (run.usageKnown === true) return `${total} tokens`;
  return `Recorded tokens: ${total} · completeness unavailable.`;
}

export function ReportWorkspace({ dashboard, onGenerateReport, onSaveDraft, onApproveDraft, onSendDraft, onError, onEvidence, selectedDraftId, onSelectDraft, kinds, onDrafted }: Props) {
  const [generating, setGenerating] = useState(false);
  const drafts = kinds ? dashboard.state.drafts.filter((draft) => kinds.includes(draft.kind)) : dashboard.state.drafts;
  const selected = drafts.find((draft) => draft.id === selectedDraftId) ?? drafts.at(-1);
  const run = dashboard.state.runs.find((run) => run.id === selected?.runId);

  async function generate() {
    setGenerating(true); onError("");
    try {
      const draft = await onGenerateReport();
      onSelectDraft(draft.id);
      onDrafted?.(draft);
    } catch (err) { onError(errorMessage(err)); } finally { setGenerating(false); }
  }

  return <div className="workspace-content">
    <section className="report-intro panel"><div><span className="eyebrow">QUARTERLY REPORT</span><h2>Draft it from the shared record.</h2><p>Build the quarterly summary from the same records your team uses every day. Every figure is checked against the source before approval.</p></div><button className="button button-primary" disabled={generating} onClick={generate}>{generating ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}{generating ? "Preparing your draft…" : "Draft quarterly report"}</button></section>
    <div className="report-grid">
      <aside className="panel draft-library"><div className="panel-heading"><h2>Your drafts</h2><span className="pill pill-neutral">{drafts.length}</span></div><div className="draft-list">{[...drafts].reverse().map((draft) => <button className={`draft-list-item ${selected?.id === draft.id ? "selected" : ""}`} key={draft.id} onClick={() => onSelectDraft(draft.id)}><span className="draft-type-icon">{draft.kind === "report" ? <FileCheck2 size={19} /> : <FileText size={19} />}</span><span><strong>{draft.title}</strong><small>{draft.mode === "live" ? "Live agent" : "Demo template"} · Revision {draft.revision}</small><span className={`draft-status ${draft.status === "approved" ? "approved" : ""}`}>{draft.status === "approved" ? "Approved" : "Needs review"}</span></span><ArrowRight size={15} /></button>)}</div>{!drafts.length ? <p className="library-empty">Draft a report here, or start a follow-up from People & actions.</p> : null}</aside>
      {selected ? <div className="report-main"><DraftEditor key={selected.id} draft={selected} dashboard={dashboard} onError={onError} onEvidence={onEvidence} onSaveDraft={onSaveDraft} onApproveDraft={onApproveDraft} onSendDraft={onSendDraft} />
        <section className="panel run-panel"><div className="panel-heading"><div><span className="eyebrow">A VISIBLE PROCESS</span><h2>How this draft came together</h2></div><span className="pill pill-neutral">{run?.mode === "live" ? "Live agent run" : "Recorded demo run"}</span></div>{run ? <><div className="run-meta"><span>{run.model}</span><span>{tokenLabel(run)}</span><span>{(run.durationMs / 1000).toFixed(1)}s</span><span>3 initial turns + 1 optional repair</span></div><ol className="run-events">{run.events.map((event) => <li key={event.id}><span className="timeline-point"><Check size={12} /></span><div><strong>{event.action.replaceAll("_", " ")}</strong><p>{event.detail}</p>{event.sourceIds.length ? <button className="text-button" onClick={() => onEvidence(event.sourceIds, event.action)}><Link2 size={13} />View evidence</button> : null}</div></li>)}</ol></> : <p className="empty-state">Run details are not available for this draft.</p>}</section>
      </div> : <div className="panel report-empty"><span className="empty-art"><FileCheck2 size={42} strokeWidth={1.3} /></span><h2>A clear story starts with good records.</h2><p>Generate your first quarterly report. You can inspect the source behind each figure, edit the draft, and approve it when you’re ready.</p><div className="report-steps"><span><span>1</span>Gather evidence</span><span><span>2</span>Review the draft</span><span><span>3</span>Approve & export</span></div></div>}
    </div>
  </div>;
}
