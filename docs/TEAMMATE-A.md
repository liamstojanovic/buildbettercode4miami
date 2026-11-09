# Teammate A: operations and the call list

**November 7 frontend agreement:** Liam owns A. The [frontend work plan](FRONTEND-WORK-PLAN.md) supersedes this document's original component paths and parent-request wiring: A owns `/inbox` and `/counseling`, views receive props, and pages own view data loading. FE-03 is now Done: pages pass backend callbacks as props; feature state handling is worked out during implementation. Browser document editing is out of scope; older shared-editor wording is superseded. Retain the acceptance requirements below and use the [latest backend handoff](BACKEND-HANDOFF.md) for current contracts.

## Copy-paste assignment

> Work in the existing Laser Focus Next.js + TypeScript application on Node.js 22+. Enhance the functional base in `src/components/operations-workspace.tsx`; do not build a separate app. Own import, Rosa duplicate review, participant/donor call list, evidence and the counseling disclosure view. Make the operations flow clear, then show one note beside the exact limited funder payload with explicit counselor approval. Keep calculations, field filtering and approval checks on the server. Label fictional data and simulated delivery. Preserve the shared API contract and coordinate shell/global-style changes with the lead.

## Ownership

You own `src/components/operations-workspace.tsx`, `src/components/disclosure-workspace.tsx`, and new files under `src/components/operations/`. The lead owns the dashboard shell, `src/lib/types.ts`, `src/lib/*`, `src/app/api/*`, package files, global CSS and app layout. Teammate B owns reports and grants. Propose a shared component or style to the lead instead of editing a shared file concurrently.

Start with `npm ci` if dependencies are absent, then `npm run dev`. Read the root README for required environment and startup details. Use the existing `Dashboard` and domain types; do not recreate fixture shapes inside the component. A live API key is not required for the labeled demo mode.

## User experience

1. Present an obvious source/import entry point and a readable summary of records. Imported CSV data needs understandable inserted/skipped counts and errors.
2. Rosa's card presents the three donor identities, evidence and explicit Approve / Keep separate actions. Neither name similarity nor a model response should silently approve a merge.
3. After approval, refresh the dashboard. Explain that unique donors changed while gifts and money were preserved. Use server metrics, not a client-side recount.
4. Show the call list with names, human-readable reasons, kind and action. Distinguish attendance follow-up from donor outreach without suggesting the two people are ranked by financial value.
5. Expand a queue row to show contributing records and draft a follow-up. Make progress, failure, retry, pending and approved states clear.
6. Keep evidence reachable by keyboard. Empty and error states should say what the user can do next.
7. Load a full counseling note only on explicit open; the dashboard contains note summaries. Show the funder payload separately with included/excluded field names, payable status and a clear preview → approve → export sequence. Never reconstruct the funder payload on the client or send private details to drafting.

## Contract

The authoritative shape is `src/lib/types.ts`. Reuse the existing parent refresh/callback wiring rather than introducing a second cache.

| Request | Body | Successful response |
| --- | --- | --- |
| `GET /api/dashboard` | — | `Dashboard` |
| `POST /api/import` | `{ csv, sourceName }` | `{ inserted, skipped, dashboard }` |
| `POST /api/merge` | `{ candidateId, decision }` | `Dashboard` |
| `POST /api/drafts` | `{ kind: "followup", queueItemId, mode }` | `{ draft, dashboard }` |
| `POST /api/drafts/:id/send` | `{ revision }` | `{ message, dashboard }`; simulation receipt only |
| `POST /api/reset` | — | `Dashboard` |
| `POST /api/attendance` | `{ participantId, date, status }` | `{ attendance, dashboard }` |
| `GET /api/notes/:id` | — | `{ note, dashboard }`; opening is audited |
| `PATCH /api/notes/:id` | `{ goal, progress, privateDetail, durationMinutes }` | `{ note, dashboard }`; invalidates old previews |
| `POST /api/disclosures` | `{ noteId, grantId }` | `{ disclosure, dashboard }` |
| `POST /api/disclosures/:id/approve` | `{ payloadHash }` | `{ disclosure, dashboard }` |
| `GET /api/disclosures/:id/export` | — | Approved, current payload only |

Merge `decision` is `"approve"` or `"reject"`. `mode` is `"live"` or `"demo"`; `dashboard.liveAvailable` signals configuration, not a guarantee that a network call will succeed. Do not silently present fallback text as live output. Do not call reset during normal browsing; expose it as an explicit demo control.

Useful data: `state.sources`, `state.candidates`, `state.donors`, `state.gifts`, `queue` and `metrics`. Source details are resolved by matching `sourceIds` to `state.sources`; retain source name and row number. Render text safely.

## Milestones

**First 30 minutes:** run the base, inspect the existing props and types, agree any shared style needs, and improve one Rosa/call-list interaction without changing endpoints.

**First 60–90 minutes:** complete review states, evidence details, import feedback and draft status. Walk through the flow against the actual API with the lead.

**Integration checkpoint:** test rejected merges, repeated import, request failures and a narrow viewport. Then focus on concise labels and demo pacing.

## Done means

- [ ] A teammate can complete the operations demo using the UI only.
- [ ] Merge approval/rejection persists and the UI does not double-submit on repeated clicks.
- [ ] Rosa's gift history remains inspectable after the merge; donation totals are unchanged.
- [ ] The seeded participant, annual donor and interrupted monthly donor show correct, source-backed reasons.
- [ ] No screen says an absent payment proves an expired card unless the payment-failure record says so.
- [ ] Draft state says pending/approved accurately; nothing claims delivery from approval alone.
- [ ] Loading, disabled, empty and error states work; controls have accessible names and visible focus.
- [ ] `npm run typecheck` passes and the integrated demo still works.
- [ ] The counselor can inspect the private internal note and confirm the sensitive sentinel is absent from the separate funder preview.
- [ ] Nonpayable or wrong-funder sessions display a useful blocked state; stale payloads require a fresh preview.
- [ ] Note access, preview and approval are visible in the audit trail without leaking private text into audit details.

Do not spend the first pass on charts, maps, a generalized CRM editor or a new design system. Protect the operations and counseling slices with one funder and clear, working actions.
