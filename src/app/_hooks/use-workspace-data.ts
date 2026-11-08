"use client";

import { useEffect, useState } from "react";
import { apiRequest, errorMessage } from "@/lib/client-api";
import type { Attendance, Claim, CounselingNote, Dashboard, Disclosure, Draft, Expense, SourceRow } from "@/lib/types";

// Page-layer orchestration. Display components receive props and never import this hook.
export default function useWorkspaceData() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [resetting, setResetting] = useState(false);
  const [evidence, setEvidence] = useState<{ title: string; sources: SourceRow[] } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setDashboard(null);
    setEvidence(null);
    apiRequest<Dashboard>("/api/dashboard", "GET", undefined, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setDashboard(data); })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(errorMessage(err)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  // Mutations. On success the server's refreshed dashboard replaces local state. On failure the
  // ApiError is rethrown unchanged; views catch it and decide how to present the message.
  async function mergeCandidate(candidateId: string, decision: "approve" | "reject") {
    setDashboard(await apiRequest<Dashboard>("/api/merge", "POST", { candidateId, decision }));
  }

  async function importGifts(csv: string, sourceName: string) {
    const result = await apiRequest<{ inserted: number; skipped: number; dashboard: Dashboard }>("/api/import", "POST", { csv, sourceName });
    setDashboard(result.dashboard);
    return { inserted: result.inserted, skipped: result.skipped };
  }

  async function saveAttendance(participantId: string, date: string, status: "present" | "absent" | "cancelled" | "scheduled") {
    const result = await apiRequest<{ attendance: Attendance; dashboard: Dashboard }>("/api/attendance", "POST", { participantId, date, status });
    setDashboard(result.dashboard);
  }

  async function draftFollowup(queueItemId: string) {
    const result = await apiRequest<{ draft: Draft; dashboard: Dashboard }>("/api/drafts", "POST", { kind: "followup", queueItemId, mode });
    setDashboard(result.dashboard);
    return result.draft;
  }

  async function generateReport() {
    const result = await apiRequest<{ draft: Draft; dashboard: Dashboard }>("/api/drafts", "POST", { kind: "report", mode });
    setDashboard(result.dashboard);
    return result.draft;
  }

  async function generateApplication(grantId: string) {
    const result = await apiRequest<{ draft: Draft; dashboard: Dashboard }>("/api/drafts", "POST", { kind: "application", grantId, mode });
    setDashboard(result.dashboard);
    return result.draft;
  }

  async function saveDraft(draftId: string, revision: number, narrative: string, claims: Claim[]) {
    const result = await apiRequest<{ draft: Draft; dashboard: Dashboard }>(`/api/drafts/${draftId}`, "PATCH", { revision, narrative, claims });
    setDashboard(result.dashboard);
    return result.draft;
  }

  async function approveDraft(draftId: string, revision: number) {
    const result = await apiRequest<{ draft: Draft; dashboard: Dashboard }>(`/api/drafts/${draftId}/approve`, "POST", { revision });
    setDashboard(result.dashboard);
    return result.draft;
  }

  async function sendDraft(draftId: string, revision: number) {
    const result = await apiRequest<{ message: string; dashboard: Dashboard }>(`/api/drafts/${draftId}/send`, "POST", { revision });
    setDashboard(result.dashboard);
  }

  async function addExpense(grantId: string, expense: { id: string; date: string; category: string; amountCents: number; description: string }) {
    const result = await apiRequest<{ expense: Expense; inserted: boolean; dashboard: Dashboard }>(`/api/grants/${grantId}/expenses`, "POST", expense);
    setDashboard(result.dashboard);
    return { expense: result.expense, inserted: result.inserted };
  }

  async function openNote(noteId: string) {
    const result = await apiRequest<{ note: CounselingNote; dashboard: Dashboard }>(`/api/notes/${noteId}`, "GET");
    setDashboard(result.dashboard);
    return result.note;
  }

  async function saveNote(noteId: string, body: { goal: string; progress: string; privateDetail: string; durationMinutes: number }, expectedNoteHash?: string) {
    const result = await apiRequest<{ note: CounselingNote; dashboard: Dashboard }>(`/api/notes/${noteId}`, "PATCH", expectedNoteHash === undefined ? body : { ...body, expectedNoteHash });
    setDashboard(result.dashboard);
    return result.note;
  }

  async function createPreview(noteId: string, grantId: string) {
    const result = await apiRequest<{ disclosure: Disclosure; dashboard: Dashboard }>("/api/disclosures", "POST", { noteId, grantId });
    setDashboard(result.dashboard);
    return result.disclosure;
  }

  async function approveDisclosure(disclosureId: string, payloadHash: string) {
    const result = await apiRequest<{ disclosure: Disclosure; dashboard: Dashboard }>(`/api/disclosures/${disclosureId}/approve`, "POST", { payloadHash });
    setDashboard(result.dashboard);
    return result.disclosure;
  }

  async function reset() {
    if (!window.confirm("Reset this synthetic demo? This removes imported demo rows, reviews, drafts, and run history, and restores the starting scenario.")) return;
    setResetting(true);
    setError("");
    try {
      setDashboard(await apiRequest<Dashboard>("/api/reset", "POST"));
      setEvidence(null);
    } finally {
      setResetting(false);
    }
  }

  return {
    dashboard,
    loading,
    error,
    mode,
    shell: {
      loading,
      error,
      period: dashboard?.state.period.label,
      asOf: dashboard?.state.asOf,
      liveAvailable: dashboard?.liveAvailable ?? false,
      mode,
      resetting,
      onRetry: () => setAttempt((value) => value + 1),
      onModeChange: setMode,
      onReset: reset,
    },
    evidence,
    onEvidence: (ids: string[], title: string) => {
      const selected = new Set(ids);
      setEvidence({ title, sources: dashboard?.state.sources.filter((source) => selected.has(source.id)) ?? [] });
    },
    onCloseEvidence: () => setEvidence(null),
    onError: (message: string) => setError(message),
    clearError: () => setError(""),
    mergeCandidate,
    importGifts,
    saveAttendance,
    draftFollowup,
    generateReport,
    generateApplication,
    saveDraft,
    approveDraft,
    sendDraft,
    addExpense,
    openNote,
    saveNote,
    createPreview,
    approveDisclosure,
    reset,
  };
}
