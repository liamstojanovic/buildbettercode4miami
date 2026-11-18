# Teammate B: trusted reports and approval

**November 7 frontend agreement:** Robby (Roberto Beltran) owns B. The [frontend work plan](FRONTEND-WORK-PLAN.md) supersedes this document's original component paths and parent-request wiring: reports, applications and ledger live inside `/grants`, views receive props, and pages own view data loading. FE-03 is now Done: pages pass backend callbacks as props; reporting documents are downloadable, with no browser document editing. Older editor/correct-save requirements below are superseded; validation still applies. Feature state handling is worked out during implementation. Retain the acceptance requirements below and use the [latest backend handoff](BACKEND-HANDOFF.md) for current contracts.

## Copy-paste assignment

> Work in the existing Laser Focus Next.js + TypeScript application on Node.js 22+. Enhance the functional base in `src/components/report-workspace.tsx`; do not build a separate app. Own quarterly reports, the one-funder application and category ledger, structured claims, evidence, draft editing, validation, approval, export and recorded run history. Demonstrate a wrong claim blocking approval, a complete application answer staying within its word limit, and category spending using the funder's own year. Make pending/approved/stale state obvious and use server calculations throughout.

## Ownership

You own `src/components/report-workspace.tsx`, `src/components/grants-workspace.tsx`, and new files under `src/components/reports/`. The lead owns the dashboard shell, shared types/components, global CSS, `src/lib/*`, `src/app/api/*` and package files. Teammate A owns operations and counseling disclosure. Coordinate a shared evidence component through the lead to avoid duplicate patterns and conflicting edits.

Start with `npm ci` if dependencies are absent, then `npm run dev`. Read the root README for startup/environment instructions. Use the existing props and `src/lib/types.ts`; keep the server's dashboard as the source of truth.

## User experience

1. Generate a quarterly draft in visible `live` or `demo` mode. Describe the period and show a useful pending state.
2. Present narrative and numeric claims distinctly. Each claim uses a real metric ID, label, value, unit and evidence. The model does not own the metric calculation.
3. Let staff edit the draft and show when changes are unsaved. Save changes before approval; do not send approval against a revision the editor has superseded.
4. Display validation issues beside the relevant claim and in a concise status area. A blocked action must explain the next step.
5. Support the demo: change a claim's value, attempt approval, read the mismatch, restore the metric's current value, save and approve the new revision.
6. Expose recorded run events and sources without overwhelming the report. Call it recorded execution/history, not proof of identical model regeneration.
7. Export only through the server route and honor its approval rules. Do not label an export as a submitted report.
8. Show the application's actual question, configured limit and full answer word count including rendered numeric claim lines. Surface limit failures from the server.
9. Show `dashboard.ledgers`: the funder's fiscal start/end, category budgets/spending/remaining amounts, near-limit and over-budget states, disallowed expenses and outside-period expenses. Convert cents for display only; do not recalculate ledger totals in the browser.

## Contract

The authoritative shapes are `Draft`, `Claim`, `Metric`, `ValidationIssue`, `AgentRun` and `Dashboard` in `src/lib/types.ts`.

| Request | Body | Successful response |
| --- | --- | --- |
| `GET /api/dashboard` | — | `Dashboard` |
| `POST /api/drafts` | `{ kind: "report", mode }` | `{ draft, dashboard }` |
| `POST /api/drafts` | `{ kind: "application", grantId, mode }` | `{ draft, dashboard }` |
| `PATCH /api/drafts/:id` | `{ revision, narrative?, claims? }` | `{ draft, dashboard }` |
| `POST /api/drafts/:id/approve` | `{ revision }` | `{ draft, dashboard }` |
| `GET /api/drafts/:id/export` | — | Server-generated export; inspect route content type |

`revision` is the draft revision currently loaded by the editor. `dataRevision` is the data snapshot the draft was generated from; the API validates it separately. Use `claims: [{ metricId, value }]` and derive labels/units from `dashboard.metrics`; never invent metric IDs or report totals. `mode` is `"live"` or `"demo"`.

Inspect the implemented routes for error envelopes and export format, and retain server validation messages. A non-success response must not optimistically mark a draft approved. An import or merge can make a draft stale: preserve the user's text, explain the conflict, and offer the supported refresh/regeneration action rather than quietly overwriting edits.

Get evidence by resolving `draft.sourceIds` and relevant metric `sourceIds` against `state.sources`. Get the execution by matching `draft.runId` to `state.runs`. A source row should display its source name and row number.

## Milestones

**First 30 minutes:** run the base, inspect props/types and generate one report. Agree the editing and error display with the lead.

**First 60–90 minutes:** make generate → inspect evidence → edit → block → correct → approve → export usable against actual routes.

**Integration checkpoint:** let A merge or import after you generate a report. Confirm stale approval is explained and rejected. Exercise a failed live call and make its mode/error visible.

## Done means

- [ ] Report figures come from server metrics and each figure opens its evidence.
- [ ] Wrong values cannot be approved; validation is enforced by the API even if a button is enabled.
- [ ] Unsaved changes, draft revision and approval state stay consistent.
- [ ] Editing an approved draft requires revalidation and approval of the new revision.
- [ ] A changed data snapshot cannot be approved as current; recovery does not silently discard edits.
- [ ] Live and deterministic demo output are visibly distinguished.
- [ ] Export follows server state; approval, export and external delivery are not conflated.
- [ ] Recorded history is readable, and failed requests have actionable retry feedback.
- [ ] Keyboard navigation, focus, narrow layouts and `npm run typecheck` pass.
- [ ] Application word-count feedback includes rendered claims, and an excessive answer cannot be approved.
- [ ] Ledger labels clearly distinguish the funder's fiscal year from the organization's displayed quarter.
- [ ] Over-budget, near-limit, disallowed-category and outside-year examples all explain their evidence.

Keep the application and ledger bounded to the seeded funder. Defer a second funder, accounting integrations, chart polish and multi-question workflow expansion until the required one-grant slice passes.
