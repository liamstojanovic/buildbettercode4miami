# Laser Focus

**Less admin. More human.** One nonprofit workspace for records, timely follow-ups, grounded grant work, and counseling copies that disclose only approved fields.

Built for the [DevDay Exchange Miami nonprofit challenges](https://docs.google.com/document/d/1dTh6wVOAtDjGyCIVv28Pm94Yfz8Z4kGo8DFhRNDpgsw/edit), covering a bounded slice of **1 + 2 + 6 + 4**. All people, gifts, funders, and sessions in this app are fictional.

Team upstream: [jemsbhai/buildbettercode4miami](https://github.com/jemsbhai/buildbettercode4miami), branch `codex/laser-focus-mvp`.

For Liam and collaborators, use [Liam's fork](https://github.com/liamstojanovic/buildbettercode4miami): **`stable` is the default branch and shared, verified baseline**. Create feature branches from `stable` and target pull requests to the fork's `stable`. Merge work after `npm run verify` passes and the relevant UI flows have been checked. To contribute integrated changes upstream, explicitly target `jemsbhai/buildbettercode4miami:codex/laser-focus-mvp`; the fork's default branch does not change that destination. See [branch workflow](docs/DEVELOPMENT.md#branch-workflow).

## Run locally

The primary workflow is **VS Code → Dev Containers: Reopen in Container**, with Docker running in Linux-container mode. The container installs dependencies automatically; then run `npm run dev` and open the forwarded port 3000. No API key is needed for demo mode.

Native development requires exactly **Node.js 24.19.0 and npm 12.0.2**. See [development setup](docs/DEVELOPMENT.md) for macOS, Windows/WSL2 and Linux prerequisites, runtime installation, rebuilds, and validation.

```sh
git clone --branch stable https://github.com/liamstojanovic/buildbettercode4miami.git
cd buildbettercode4miami
npm ci
npm run dev
```

Open the local URL printed by Next.js. The optional Windows launcher, `powershell -File scripts/dev.ps1`, checks the same pinned toolchain and runs the development server.

The demo starts with a deterministic fictional Q3 2026 dataset. The **Reset demo** control restores the same scenario. State is saved in `.data/state.json` and survives a server restart. See [local runtime data and cleanup](docs/DEVELOPMENT.md#local-runtime-data-data-and-cleanup) before deleting `.data/` or rebuilding your workspace.

Demo drafting needs no credentials. For real model drafting, copy `.env.example` to `.env.local`, set `OPENAI_API_KEY` there or in the server environment, then choose **Live · OpenAI agent** in the workspace. The default is `gpt-5.4-mini`; `OPENAI_MODEL` can override it. Keys remain on the server. No real email, SMS, or funder submission is performed.

## What works

| Challenge | Working vertical slice |
| --- | --- |
| 1 — Programs | Thirteen weeks of signups, attendance, mentor assignments and volunteer hours; attendance capture/upsert; evidence-backed absence queue; drafted, reviewed follow-ups; simulated delivery receipts; source-derived quarterly report |
| 2 — Donors | Four gift channels; normalized CSV import with idempotency; Rosa's three identities proposed for approval; original gifts preserved; monthly lapse with explicit expired-card evidence and historical annual lapse |
| 6 — Grants | One funder's application question and word limit; editable, verified numeric claims; approval of the exact answer and fact sheet; July–June category ledger with overspending, near-limit, disallowed-category and fiscal-boundary examples |
| 4 — Counseling | Twenty-five sessions across a week; write/edit the internal note once; deterministic required-field copy; exact counselor preview and approval; nonpayable exclusion; metadata-only access log; private note bodies excluded from the general dashboard and agent context |

The initial quarter has **4 participants, 5 quarter donor identities, $635 in gifts, 50 attended sessions and 65 volunteer hours**. Approving Rosa changes the donor count to **3** and leaves $635 and every gift intact. The annual alert is explicitly a retrospective discovery of a missed December 2025 gift, using earlier history; it is not advertised as a timely first alert.

The grant example uses a **120-word answer limit**, counting narrative and rendered fact lines. It has a $500 personnel overrun, materials at 90% of budget, and a disallowed $45 expense. Fiscal-year evidence distinguishes June 30 from July 1.

## Google Sheets sidebar

The new sidebar brings donation reconciliation and report approval into Google Sheets: select rows, map columns, preview/import, review duplicate identities, and write an approved report to a new tab. It reuses the existing backend and keeps workbook sessions separate from the web-app demo. Program metrics remain explicitly fictional; the integration does not synchronize arbitrary spreadsheets or expose counseling notes.

Use Node.js 24 and start `npm run sheets:bridge`, then follow the [Google Sheets installation and demo guide](docs/GOOGLE-SHEETS.md) for the protected HTTPS connection and bound Apps Script files. The complete native workflow passed in a single-account Chrome Incognito session: import, Rosa merge, live report, wrong-figure approval block, changed-source write block, approved new-tab write and duplicate-safe retry. All 138 automated tests and the production build also pass.

## Collaborate

- [Project memory: four-person team, portable development requirements and deadline](docs/PROJECT-CONTEXT.md)
- [Build plan and acceptance gates](docs/BUILD-PLAN.md)
- [Teammate A: operations and counseling](docs/TEAMMATE-A.md)
- [Teammate B: reports and grants](docs/TEAMMATE-B.md)
- [Copy-paste team handoff](docs/TEAM-HANDOFF.md)
- [Backend contracts and frontend integration priorities](docs/BACKEND-HANDOFF.md)
- [Demo script](docs/DEMO.md)
- [Decisions and boundaries](docs/DECISIONS.md)

The frontend is a functioning base to extend. A owns `operations-workspace.tsx` and `disclosure-workspace.tsx`; B owns `report-workspace.tsx` and `grants-workspace.tsx`. The lead owns shared types, API routes, data logic, common shell and global styling. Coordinate shared-file edits.

## Architecture

One Next.js + TypeScript application; shared request/response types live in `src/lib/types.ts`.

- `seed.ts` / `programs.ts`: deterministic fictional data and row-level source references.
- `domain.ts`: exact-cent gift records, contact-based merge candidates, attendance/late-gift rules and metric validation.
- `agent.ts`: a bounded OpenAI Agents SDK run with a read-only evidence tool and structured draft output. It cannot approve, send, merge, or read counseling bodies.
- `generation.ts` / `evidence.ts`: persisted generation reservations, request-key retries, scoped evidence fingerprints and recorded-run integrity checks.
- `service.ts`: revision-aware editing/approval, approved export and idempotent simulated delivery.
- `programs.ts`: funder-year ledgers, application limits, note access, allowlisted disclosure and payload-bound approvals.
- `store.ts`: atomic file replacement, with synchronous transactions inside one Node process.
- `src/app/api/[...path]/route.ts`: validated endpoints used by every workspace.

Live runs allow three initial turns and one optional repair turn, with 1,600 output tokens per model turn under a shared 45-second deadline. Transport retries are disabled. One generation runs at a time; twelve live attempts are allowed per reset session, including failed attempts. Reservations survive a restart and interrupted jobs recover after their 90-second lease. These are request limits, not a hard dollar budget. Token checkpoints are retained, and `usageKnown: false` identifies incomplete or unavailable provider usage. Hosted tracing is disabled. The recorded input, output and validation attempts can be read through `GET /api/runs/:id/replay` without another model request.

Clients can attach an `Idempotency-Key` to `POST /api/drafts` and reuse it with the same body after a network interruption. Completed retries return the saved result with `replayed: true`. Reusing a running or failed key, or using a key with different input, returns an explanatory conflict instead of silently starting another live attempt. Recorded-run hashes check saved input/output consistency; they do not authenticate the record or rerun the model. The [backend handoff](docs/BACKEND-HANDOFF.md) specifies response shapes, retry behavior and the frontend labels required for partial or unknown token usage. [Verification](docs/VERIFICATION.md) records 94 passing tests, the successful production build and 74 passing HTTP checks, including real report, application and follow-up calls. New frontend controls still need browser rehearsal after teammate integration.

Numeric facts are structured metric references and checked on the server. Unbound numbers in narrative are conservatively blocked. This is **not a general truth detector**: staff still review qualitative prose. Approval binds exact content to the evidence it used: relevant changes require new review, while unrelated note or donor edits preserve validity. Counseling filtering is deterministic and does not ask a model to decide what to disclose. It also blocks complete private details copied into permitted fields, without claiming to detect paraphrases or every sensitive passage.

## Import format

Use the file/CSV import control with [the sample](public/samples/gifts.csv). Headers are:

```csv
gift_id,donor_id,name,email,phone,amount_cents,date,channel
```

Amounts must be positive integer cents; dates must be ISO `YYYY-MM-DD`; channels are `online`, `tickets`, `auction`, or `check`. Exact transaction repeats are skipped. Conflicting IDs reject the entire import. This first slice accepts a normalized gift CSV; live donation-tool integrations and arbitrary spreadsheet column mapping are future work. Operations records begin seeded, and attendance can be entered or corrected in the app.

## Verify

```sh
npm run verify
```

This runs the toolchain check, typecheck, tests, production build, and deterministic HTTP smoke checks on port 3210 using disposable state. Port 3210 must be free. It stops its server afterward and does not use live API calls or reset your saved demo.

With a local server on port 3210:

```sh
node scripts/smoke.mjs
node scripts/smoke.mjs --live
```

Set `LASER_FOCUS_URL` for a different local port. The smoke script **resets local demo state** at the beginning and end. `--live` makes real, bounded calls for report, application and follow-up drafts using the configured key. The checks exercise source calculations, approval bypass attempts, word limits, disclosure leaks, replayed imports, simulated delivery, expenses, recorded runs and stale records. Use only fictional data. Set `LASER_FOCUS_STATE_FILE` to a separate local file when starting a verification server so tests do not overwrite a presenter’s session.

## Demo boundaries and submission

This is a local, single-operator hackathon app. It has no authentication, independent reviewer identity, multi-instance database or clinical security boundary. The counselor role in audit entries is a demo actor. Do not use it for real counseling records; a pilot needs authenticated roles, a transactional store, access controls, and a reviewed retention/deployment design. Approved funder copies are exported, not submitted. The follow-up outbox visibly simulates delivery and does not prove deliverability to a real recipient.

**Final submission is due Sunday, November 8, 2026, at 4:45 PM Eastern**, as supplied by Liam on November 7. The [organizer page](https://luma.com/codexmiami) lists Codex, OpenAI API and OpenAI Agents SDK and an event close of 9 PM Eastern, separate from submission. The judging rubric still needs confirmation. The challenge overview requires a public GitHub repository with MIT or Apache 2.0 licensing by submission. The public repository includes an MIT license. Event submission remains unfinished.
