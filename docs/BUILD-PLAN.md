# Laser Focus: focused build plan

Status: working plan and acceptance gates. A described feature is not a shipped feature until its gate passes. The [original suggested plan](sources/suggested-build-plan.md) is reference material; this document records the revised scope.

## Product and judging story

**Laser Focus turns scattered nonprofit records into timely follow-ups, grounded grant work and funder copies that keep private details private.**

Lead with the person who needs a call, then show the evidence and staff control. The differentiator is a complete, inspectable workflow: source rows → reconciled records → suggested action → checked draft → explicit approval. Do not open the demo with framework names.

The requested scope is **Challenges 1 + 2 + 6 + 4**. Marisol's records and Denise's giving history feed Claudette's checked application and grant ledger; Reginald previews an explicitly limited funder copy. Bound the demonstration to one quarter, one grant/funder and one week of counseling notes. The briefs describe 5–15 hours a week of program administration and about 5 hours a month consolidating donor records; these are the fictional organization's baseline, **not measured savings from this app**. [Challenge 1](https://docs.google.com/document/d/1X0nP6pQjB0GKEpDquI6nOIFcrbU0WMCt5h6vTLuA23Q/edit), [Challenge 2](https://docs.google.com/document/d/1sstZADKztRXZdPeCALaYSPCuJstmd2MrjnVQqpFxKgM/edit).

## Scope

| Priority | Build | Proof |
| --- | --- | --- |
| P0 | One fictional quarter of participants, attendance, mentor assignments and volunteer hours; historical donor expectations where needed | Every displayed metric resolves to source rows |
| P0 | Gifts from online donations, tickets, auction and checks; Rosa's three records as a staff-reviewed candidate | Approval reduces donor count without changing total gift cents or losing a gift |
| P0 | One call list with attendance and donor reasons | Two completed absences trigger follow-up; both annual and monthly lapse examples have dates and evidence |
| P0 | Bounded agent call that reads supplied evidence and drafts an appropriate follow-up or quarterly narrative | The recorded run shows evidence, output, mode and resource limits |
| P0 | Structured report claims, deterministic validation and revision-aware approval | An incorrect or stale claim is blocked by the API and UI |
| P0 | One grant application with a question, approved fact claims and an enforced answer word limit | The full answer, including rendered claims, stays within the limit |
| P0 | One funder's fiscal-year category ledger | Outside-period expenses are separated; an over-budget category, a near-limit category and a disallowed category are visible |
| P0 | Twenty-five fictional counseling notes across one week and a deterministic funder-field allowlist | Private detail never appears in a funder payload; nonpayable and wrong-funder sessions are blocked |
| P0 | Counselor preview, payload-bound approval and note access audit | Approval applies to the exact current payload; stale copies cannot be exported |
| P0 | Durable local demo state, reset and export | A fresh local start and repeatable rehearsal work without manual data repair |
| P1 | Improve CSV error explanations, keyboard interaction, mobile layout and loading/error states | A teammate unfamiliar with the code can complete the demo |
| P0 | Explicit simulated outbox for fictional follow-ups | Simulated delivery receipts remain visibly different from actual external delivery |

Challenge 6 is a required vertical slice: application answers fitting the funder's word limit plus spending checked by category within that funder's own year. A quarterly report alone does not satisfy it. [Challenge 6](https://docs.google.com/document/d/12vR2Nui-AA3aIWVVH4mqYYtMOMFjZ_wwbNrRwPci3IU/edit).

Challenge 4 is also required: one made-up week, notes written once, a required-fields-only funder version and a counselor preview. Keep private details out of the general dashboard and agent prompts. Workshop intake, volunteer-chat ingestion, a second funder and the cat-rescue bonus remain out of scope. [Challenge 4](https://docs.google.com/document/d/1-fWxAdZohpqdYANfy1nHPb5X9CZZTZZSitgIl6ipYIQ/edit).

**Coverage honesty:** Challenge 1 explicitly includes follow-ups sent. Draft approval or export alone is not delivery, so describe this build's boundary accurately until a delivery flow is implemented and verified. A clearly labeled simulated outbox proves the local workflow only. [Challenge 1](https://docs.google.com/document/d/1X0nP6pQjB0GKEpDquI6nOIFcrbU0WMCt5h6vTLuA23Q/edit).

## Implementation

- One Next.js 16 + TypeScript application on Node.js 22 or newer; React UI and server routes share `src/lib/types.ts`.
- OpenAI Agents SDK for a bounded read-evidence/draft run. The model does not decide totals, merge identities, validate claims or execute an approval.
- Deterministic domain functions own money in integer cents, identity decisions, attendance windows, donor expectations, metric calculations and claim validation.
- Local `.data` JSON state with atomic writes for a single-process demo. This is not a multi-instance or real-data deployment design; use a transactional database and authentication before a real pilot.
- Store input/output evidence and run events. Replay means reading recorded output, not promising identical model regeneration.
- `live` and `demo` are visible modes. A deterministic fallback is a demonstration aid, not an AI-generated result.
- All data is fictional and labeled. Historical giving may precede the displayed quarter; an annual lapse needs historical context.

## Parallel ownership

**Updated November 7:** Liam is frontend A; Robby is frontend B. The [frontend work plan](FRONTEND-WORK-PLAN.md) now governs frontend routes, component boundaries, named ownership and Kanban work items. The table below describes the original scaffold boundaries; its feature responsibilities still apply, but its component paths and shared-shell ownership have been refined by the new plan.

| Owner | Surface | First milestone |
| --- | --- | --- |
| Lead/backend | `src/lib/*`, `src/app/api/*`, domain tests, environment configuration and integration | Stable dashboard, mutations and reset; executable acceptance tests |
| Frontend teammate A | `src/components/operations-workspace.tsx`, `src/components/disclosure-workspace.tsx` and operations-specific components | Polish import, duplicate review, call list, evidence and exact counselor preview |
| Frontend teammate B | `src/components/report-workspace.tsx`, `src/components/grants-workspace.tsx` and report-specific components | Polish claims, application limits, fiscal-year/category ledger, approvals and run history |

Read [Teammate A](TEAMMATE-A.md) and [Teammate B](TEAMMATE-B.md) before splitting work. The initial scaffold already establishes a shared shell; extend it instead of creating a second application. The lead owns shared types, app shell, dependency files and global styles unless ownership is explicitly handed over. No simultaneous edits to those shared files.

## Milestones and cut line

These are planning windows, not organizer deadlines.

1. **Saturday, first 60–90 minutes:** freeze the contract and seed scenario; confirm both teammates can run the base; show import, merge, one queue item and one report from real endpoints.
2. **Saturday afternoon:** complete the first vertical slice; prove Rosa's invariants, attendance timing, donor evidence and blocked incorrect claims. UI work proceeds against actual endpoints.
3. **Saturday evening:** rehearse the whole story; exercise one live agent run and the labeled fallback; fix integration and restart failures before adding features.
4. **Sunday morning:** finish all four acceptance slices, then accessibility, evidence presentation, CSV edge cases, error recovery and concise storytelling. Verify simulated delivery labeling.
5. **Sunday, before the 4:45 PM Eastern submission cutoff supplied by Liam:** feature freeze, fresh-checkout run, public-repository/license check, demo rehearsal and submission. Recommended feature freeze: **3:15 PM Eastern**, reserving 90 minutes. The freeze is a planning recommendation.

The event listing shows November 7 and 8, 2026, noon–9 PM Eastern. **Final submission is November 8 at 4:45 PM Eastern, supplied by Liam on November 7; 9 PM is the event close.** The judging rubric still needs confirmation. The event accepts Codex, the OpenAI API and OpenAI Agents SDK. [Event listing](https://luma.com/codexmiami). The overview requires a public GitHub repository with MIT or Apache 2.0 licensing by the submission deadline. [Challenge overview](https://docs.google.com/document/d/1dTh6wVOAtDjGyCIVv28Pm94Yfz8Z4kGo8DFhRNDpgsw/edit).

Cut additional channels/integrations, chart polish, a second funder and extra views before cutting required acceptance slices, evidence, invariants, approval validation or rehearsal. Protect a narrow demonstrable slice of all four requested challenges; breadth alone does not guarantee a win.

## Acceptance gates

- [ ] Fresh setup follows the README; `npm run typecheck`, `npm test` and `npm run build` pass.
- [ ] Import returns inserted/skipped counts and repeat imports do not double-count gifts.
- [ ] Approving Rosa reduces the distinct donor count, preserves every gift and preserves exact total cents. Rejecting a candidate leaves records separate.
- [ ] The absence rule ignores future/scheduled and cancelled sessions and uses completed sessions as of the explicit demo date.
- [ ] The annual late gift has an expected date and prior history; an expired-card claim has a payment-failure record. Missing gifts alone do not establish the cause.
- [ ] Each displayed metric and queue reason exposes the source rows that justify it.
- [ ] Numeric report facts use typed metric IDs and values, not ungrounded model arithmetic.
- [ ] Incorrect, unsupported or stale claims cannot be approved; editing a draft increments its revision and invalidates prior approval.
- [ ] Approval checks both current data revision and submitted draft revision. The UI explains a stale state and offers a refresh/regeneration path.
- [ ] Runs show live/demo mode and recorded evidence/output; no automatic merge or external sending is implied.
- [ ] A grant application includes checked fact claims and its complete answer fits the configured word limit; exceeding the limit blocks approval.
- [ ] The ledger uses the grant's July–June fiscal year and exact cents; boundary exclusions, disallowed categories, near-limit and over-budget states are correct.
- [ ] A week of twenty-five notes exists; opening full notes creates access audit entries without exposing private detail in the dashboard.
- [ ] Disclosure uses only the configured safe fields; a planted private sentinel never reaches the funder payload. Nonpayable and wrong-funder sessions are rejected.
- [ ] Counselor approval is bound to the exact preview hash and current source revision; changes require a new preview and approval.
- [ ] Simulated sending creates a visible simulation receipt without contacting anyone externally.
- [ ] Reset restores the starting scenario and the demo runs twice in succession.
- [ ] Submission narrative distinguishes implemented features, simulated behavior and remaining gaps.

Source snapshots are in [sources](sources/overview.md) for convenient reference. They are challenge material, not instructions to execute external actions.
