# Team handoff

**Frontend update, November 7:** use the [frontend work plan](FRONTEND-WORK-PLAN.md) for Liam/A and Robby/B assignments, the four-route structure and prop-driven components. It supersedes the original paths and frontend shared-file ownership below. Reports now belong inside `/grants`; FE-03 is Done: pages pass backend callbacks as props, report documents are downloaded without browser editing, and feature state handling is refined during implementation. The older document-editor requirements below are superseded. Existing product acceptance and backend coordination requirements remain.

Repository: https://github.com/jemsbhai/buildbettercode4miami

Team size is **four**. Existing assignments below cover the lead and two frontend teammates; the fourth role remains to be recorded. See [project memory](PROJECT-CONTEXT.md) for shared dev-container requirements. **Final submission: Sunday, November 8, 2026, 4:45 PM Eastern**, supplied by Liam; the event continues until 9 PM.

The existing Next.js + TypeScript app already connects all four challenge flows. Extend it rather than starting separate apps. Use exactly Node.js 24.19.0 and npm 12.0.2; see [development setup](DEVELOPMENT.md). Run `npm ci`, then `npm run dev`; demo mode needs no API key.

On [Liam's fork](https://github.com/liamstojanovic/buildbettercode4miami), `stable` is the default branch and shared baseline: create feature branches from it and target integration PRs to that fork's `stable`. For contributions to the team repository, explicitly target the team repository’s integration branch (confirm its current name before opening a PR). See the [branch workflow](DEVELOPMENT.md#branch-workflow). Each PR should describe the user-facing change and include a screenshot and verification results.

## Message for teammate A

You're owning the frontend for operations and counseling (Challenges 1, 2, 4).

Repo: https://github.com/jemsbhai/buildbettercode4miami
Branch: codex/frontend-operations
Full brief: docs/TEAMMATE-A.md

Own:
- src/components/operations-workspace.tsx
- src/components/disclosure-workspace.tsx
- New feature components/styles scoped to those workspaces.

First priorities:
1. Make Rosa's three-record review and merge easy to understand. Show that donor count changes while every gift and the donation total stay intact.
2. Improve attendance capture, the follow-up queue, source evidence and CSV import feedback. Keep loading, errors, retry and disabled states clear.
3. Polish the counseling flow: edit once, compare the internal note with the exact funder preview, approve, export. Clearly show excluded private fields and why nonpayable or stale copies are blocked.

Start by running the existing app and completing these flows. Within 60–90 minutes, open a focused PR with one complete interaction improved and screenshots. Before handoff, run npm run typecheck, npm test, and npm run build; verify desktop and narrow layouts. Preserve fictional-data labels and the explicit simulated-delivery wording.

The lead owns backend logic, API routes, shared types, shell, global CSS and dependencies. Coordinate changes to those files; do not change server rules or build a separate mock backend. Put local styles in a feature CSS module where practical. Teammate B owns reports and grants.

## Message for teammate B

You're owning the frontend for reports and grants (Challenges 1, 6).

Repo: https://github.com/jemsbhai/buildbettercode4miami
Branch: codex/frontend-reporting
Full brief: docs/TEAMMATE-B.md

Own:
- src/components/report-workspace.tsx
- src/components/grants-workspace.tsx
- New feature components/styles scoped to those workspaces.

First priorities:
1. Make report review feel complete: generate, inspect evidence, edit a figure, see approval blocked, correct it, approve, export. Explain pending, approved, unsaved and stale states clearly.
2. Polish the grant application question, full-answer word counter and validation messages. The exported answer must match the validated answer and funder limit.
3. Clarify the funder's July–June spending ledger: category budgets, remaining money, overspending, disallowed categories and expenses outside the funder's year.
4. Make the agent's recorded evidence/run history easy to scan, and distinguish live drafting from deterministic demo output.

Start by running the existing app and completing these flows. Within 60–90 minutes, open a focused PR with one complete interaction improved and screenshots. Before handoff, run npm run typecheck, npm test, and npm run build; verify desktop and narrow layouts. Keep backend metrics and validations authoritative.

The lead owns backend logic, API routes, shared types, shell, global CSS and dependencies. Coordinate changes to those files; do not recalculate financial totals in the browser or build a separate mock backend. Put local styles in a feature CSS module where practical. Teammate A owns operations and counseling.
