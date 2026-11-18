import { hostedDemo } from "./runtime-mode";
import { randomUUID } from "node:crypto";
import { getMetrics, getQueue, renderDraft, validateDraft } from "./domain";
import { disclosureIsCurrent, getGrantLedgers, renderApplicationAnswer, validateApplication } from "./programs";
import { draftApprovalDigest, draftIsCurrent, draftSourceFingerprint, stableJson } from "./evidence";
import type { Dashboard, DemoState, Draft, OutboxMessage, ValidationIssue } from "./types";

export class AppError extends Error {
  constructor(message: string, public status = 400, public issues?: ValidationIssue[]) { super(message); }
}

export function dashboard(state: DemoState): Dashboard {
  const drafts = state.drafts.map(draft => presentDraft(state, draft));
  return {
    state: { ...state, drafts,
      disclosures: state.disclosures.map(disclosure => ({ ...disclosure, originDataRevision: disclosure.originDataRevision ?? disclosure.dataRevision, dataRevision: disclosureIsCurrent(state, disclosure) ? state.revision : disclosure.dataRevision })),
      notes: state.notes.map(({ id, familyCode, grantId, payable, date, counselor }) => ({ id, familyCode, grantId, payable, date, counselor })) },
    metrics: getMetrics(state), queue: getQueue({ ...state, drafts }),
    liveAvailable: !hostedDemo() && Boolean(process.env.OPENAI_API_KEY), ledgers: getGrantLedgers(state),
  };
}

/** Compatibility view: existing clients compare dataRevision to the current dashboard revision. */
export function presentDraft(state: DemoState, draft: Draft): Draft {
  return { ...draft, originDataRevision: draft.originDataRevision ?? draft.dataRevision, dataRevision: draftIsCurrent(state, draft) ? state.revision : draft.dataRevision };
}

export function findDraft(state: DemoState, id: string) {
  const draft = state.drafts.find(item => item.id === id);
  if (!draft) throw new AppError("Draft not found.", 404);
  return draft;
}

export function checkDraft(state: DemoState, draft: Draft) {
  const current = draftIsCurrent(state, draft);
  const validatedDraft = current ? { ...draft, dataRevision: state.revision } : draft;
  const issues = [...validateDraft(state, validatedDraft), ...(draft.kind === "application" ? validateApplication(state, draft) : [])];
  if (!current && !issues.some(issue => issue.code === "stale")) issues.push({ code: "stale", message: "The evidence changed after this draft was created. Generate a fresh draft before approval." });
  return issues;
}

export function editDraft(state: DemoState, id: string, edit: { revision: number; narrative?: string; claims?: Draft["claims"] }) {
  const draft = findDraft(state, id);
  if (draft.revision !== edit.revision) throw new AppError("This draft changed. Refresh before editing.", 409);
  if ((edit.narrative === undefined || edit.narrative === draft.narrative) && (edit.claims === undefined || stableJson(edit.claims) === stableJson(draft.claims))) return draft;
  if (edit.narrative !== undefined) draft.narrative = edit.narrative;
  if (edit.claims !== undefined) draft.claims = edit.claims;
  draft.revision += 1;
  draft.status = "pending";
  delete draft.approvedAt;
  delete draft.approvedDigest;
  // A data change requires regeneration so updated values cannot launder a stale evidence snapshot.
  state.audit.push({ id: randomUUID(), at: new Date().toISOString(), action: "draft_edited", detail: `${draft.title}; revision ${draft.revision}. Previous approval invalidated.`, sourceIds: draft.sourceIds });
  return draft;
}

export function approveDraft(state: DemoState, id: string, revision: number) {
  const draft = findDraft(state, id);
  if (draft.revision !== revision) throw new AppError("This draft changed. Review the current revision.", 409);
  const issues = checkDraft(state, draft);
  if (issues.length) throw new AppError("Approval blocked. Correct the flagged facts or regenerate a stale draft.", 422, issues);
  if (draft.status === "approved" && draft.approvedDigest === draftApprovalDigest(draft)) return draft;
  // Legacy drafts acquire scoped evidence only while still current and being explicitly reviewed.
  draft.sourceFingerprint ??= draftSourceFingerprint(state, draft);
  draft.status = "approved";
  draft.approvedAt = new Date().toISOString();
  draft.approvedDigest = draftApprovalDigest(draft);
  state.audit.push({ id: randomUUID(), at: draft.approvedAt, action: "draft_approved", detail: `Staff approved ${draft.title}, revision ${draft.revision}, with its exact fact sheet.`, sourceIds: draft.sourceIds });
  return draft;
}

export function exportDraft(state: DemoState, id: string) {
  const draft = findDraft(state, id);
  if (draft.status !== "approved") throw new AppError("Approve this exact draft before exporting.", 409);
  const issues = checkDraft(state, draft);
  if (issues.length) throw new AppError("Approved draft is no longer valid. Regenerate and review.", 422, issues);
  if (!draft.approvedDigest || draft.approvedDigest !== draftApprovalDigest(draft)) throw new AppError("Approval does not match this content. Review and approve the current draft again.", 409);
  return draft.kind === "application" ? renderApplicationAnswer(state, draft) : renderDraft(state, draft);
}

export function simulateDelivery(state: DemoState, id: string, revision: number): OutboxMessage {
  const draft = findDraft(state, id);
  if (draft.kind !== "followup") throw new AppError("Only follow-up messages can enter the outbox.");
  if (draft.revision !== revision) throw new AppError("Review the current revision before delivery.", 409);
  exportDraft(state, id); // Verify approval without putting internal evidence in the recipient message.
  const body = draft.narrative;
  const prior = state.outbox.find(message => message.draftId === id && message.draftRevision === revision);
  if (prior) return prior;
  const task = getQueue(state).find(item => item.id === draft.queueItemId);
  if (!task) throw new AppError("The follow-up is no longer current.", 409);
  const recipient = task.kind === "attendance" ? state.participants.find(person => person.id === task.entityId)?.guardian ?? task.name : task.name;
  const message: OutboxMessage = { id: randomUUID(), draftId: id, draftRevision: revision, recipient, body, sentAt: new Date().toISOString(), transport: "simulation", status: "simulated_sent" };
  state.outbox.push(message);
  state.audit.push({ id: randomUUID(), at: message.sentAt, action: "simulated_delivery", detail: `Simulated delivery to ${task.name}. No external email or SMS was sent.`, sourceIds: draft.sourceIds });
  return message;
}
