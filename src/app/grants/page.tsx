"use client";

import { useState } from "react";
import WorkspaceShell from "@/components/layout/workspace-shell";
import EvidenceDrawer from "@/components/shared/evidence/evidence-drawer";
import DraftEditor from "@/components/shared/drafts/draft-editor";
import Modal from "@/components/shared/layout/modal";
import useWorkspaceData from "@/app/_hooks/use-workspace-data";
import { GrantsWorkspace } from "@/components/grants-workspace";
import { ReportWorkspace } from "@/components/report-workspace";

export default function Page() {
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [applicationDraftId, setApplicationDraftId] = useState<string | null>(null);
  const [reportModalId, setReportModalId] = useState<string | null>(null);
  const [approvePulse, setApprovePulse] = useState(false);
  const { dashboard, shell, evidence, onEvidence, onCloseEvidence, onError, generateReport, generateApplication, saveDraft, approveDraft, sendDraft, addExpense } = useWorkspaceData();
  const applicationDraft = dashboard?.state.drafts.find((draft) => draft.id === applicationDraftId && draft.kind === "application");
  const reportDraft = dashboard?.state.drafts.find((draft) => draft.id === reportModalId && draft.kind === "report");
  const applicationGrant = dashboard?.state.grants.find((grant) => grant.id === applicationDraft?.grantId);
  const approveWithPulse = async (draftId: string, revision: number) => {
    const draft = await approveDraft(draftId, revision);
    setApprovePulse(true);
    setTimeout(() => setApprovePulse(false), 850);
    return draft;
  };
  return <WorkspaceShell title="Every grant, on its own terms." description="Keep quarterly reports, applications and spending together." {...shell}>
    {dashboard ? <div className="workspace-content">
      <ReportWorkspace dashboard={dashboard} kinds={["report"]} selectedDraftId={selectedDraftId} onSelectDraft={setSelectedDraftId} onGenerateReport={async () => { const draft = await generateReport(); setReportModalId(draft.id); return draft; }} onSaveDraft={saveDraft} onApproveDraft={approveDraft} onSendDraft={sendDraft} onError={onError} onEvidence={onEvidence} />
      <GrantsWorkspace dashboard={dashboard} onGenerateApplication={generateApplication} onAddExpense={addExpense} onError={onError} onEvidence={onEvidence} onDrafted={(draft) => setApplicationDraftId(draft.id)} />
    </div> : null}
    {dashboard && applicationDraft ? <Modal title={applicationGrant ? `Application review: ${applicationGrant.name}` : "Application review"} pulse={approvePulse} onClose={() => setApplicationDraftId(null)}>
      <DraftEditor draft={applicationDraft} dashboard={dashboard} onError={onError} onEvidence={onEvidence} onSaveDraft={saveDraft} onApproveDraft={approveWithPulse} onSendDraft={sendDraft} />
    </Modal> : null}
    {dashboard && reportDraft ? <Modal title="Report review" pulse={approvePulse} onClose={() => setReportModalId(null)}>
      <DraftEditor draft={reportDraft} dashboard={dashboard} onError={onError} onEvidence={onEvidence} onSaveDraft={saveDraft} onApproveDraft={approveWithPulse} onSendDraft={sendDraft} />
    </Modal> : null}
    {evidence ? <EvidenceDrawer {...evidence} onClose={onCloseEvidence} /> : null}
  </WorkspaceShell>;
}
