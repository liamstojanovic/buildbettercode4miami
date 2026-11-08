"use client";

import WorkspaceShell from "@/components/layout/workspace-shell";
import { DisclosureWorkspace } from "@/components/disclosure-workspace";
import EvidenceDrawer from "@/components/shared/evidence/evidence-drawer";
import useWorkspaceData from "@/app/_hooks/use-workspace-data";

export default function Page() {
  const { dashboard, shell, evidence, onEvidence, onCloseEvidence, openNote, saveNote, createPreview, approveDisclosure, onError, reset } = useWorkspaceData();
  return <WorkspaceShell title="Write it once. Share with care." description="Start with session summaries; private notes stay closed." {...shell} onReset={reset}>
    {dashboard ? <DisclosureWorkspace
      dashboard={dashboard}
      onOpenNote={openNote}
      onSaveNote={saveNote}
      onCreatePreview={createPreview}
      onApproveDisclosure={approveDisclosure}
      onError={onError}
    /> : null}
    {evidence ? <EvidenceDrawer {...evidence} onClose={onCloseEvidence} /> : null}
  </WorkspaceShell>;
}
