"use client";

import { useState } from "react";
import WorkspaceShell from "@/components/layout/workspace-shell";
import EvidenceDrawer from "@/components/shared/evidence/evidence-drawer";
import DraftEditor from "@/components/shared/drafts/draft-editor";
import Modal from "@/components/shared/layout/modal";
import ToastNotice from "@/components/shared/notice/toast-notice";
import { OperationsWorkspace } from "@/components/operations-workspace";
import useWorkspaceData from "@/app/_hooks/use-workspace-data";

export default function Page() {
  const { dashboard, shell, evidence, onEvidence, onCloseEvidence, onError, mergeCandidate, importGifts, saveAttendance, draftFollowup, saveDraft, approveDraft, sendDraft } = useWorkspaceData();
  const [selectedFollowupId, setSelectedFollowupId] = useState<string | null>(null);
  const [followupName, setFollowupName] = useState("");
  const [deliveryNotice, setDeliveryNotice] = useState("");
  const [approvePulse, setApprovePulse] = useState(false);
  const followup = dashboard?.state.drafts.find((draft) => draft.id === selectedFollowupId && draft.kind === "followup");
  return <WorkspaceShell title="Bring the records together." description="See the records and follow-ups waiting for review, then draft and approve the next step." {...shell}>
    {dashboard ? <OperationsWorkspace
      dashboard={dashboard}
      onMerge={mergeCandidate}
      onImport={importGifts}
      onSaveAttendance={saveAttendance}
      onDraftFollowup={draftFollowup}
      readCsvFile={async (file) => ({ name: file.name, text: await file.text() })}
      onError={onError}
      onEvidence={onEvidence}
      onDrafted={(draft, personName) => { setSelectedFollowupId(draft.id); setFollowupName(personName ?? ""); }}
    /> : null}
    {dashboard && followup ? <Modal title={followupName ? `${followup.title}: ${followupName}` : "Follow-up review"} pulse={approvePulse} onClose={() => setSelectedFollowupId(null)}>
      <DraftEditor
        draft={followup}
        dashboard={dashboard}
        onError={onError}
        onEvidence={onEvidence}
        onSaveDraft={saveDraft}
        onApproveDraft={async (draftId, revision) => { const draft = await approveDraft(draftId, revision); setApprovePulse(true); setTimeout(() => setApprovePulse(false), 850); return draft; }}
        onSendDraft={async (draftId, revision) => {
          await sendDraft(draftId, revision);
          setSelectedFollowupId(null);
          setDeliveryNotice("Simulated delivery recorded. No external message was sent.");
        }}
      />
    </Modal> : null}
    {deliveryNotice ? <ToastNotice message={deliveryNotice} onDismiss={() => setDeliveryNotice("")} /> : null}
    {evidence ? <EvidenceDrawer {...evidence} onClose={onCloseEvidence} /> : null}
  </WorkspaceShell>;
}
