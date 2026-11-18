# Hosted fictional demo

Vercel runs the existing Next.js workspace in hosted-demo mode. There is no OpenAI call, Google request, database, bridge service, or persistent server filesystem. All records are fictional. The separate native Sheets sidebar remains local tooling; it is not part of this deployment.

## State and operations

The browser stores the complete fictional record under `laser-focus-demo:v1` in localStorage. Navigation and reload preserve changes. Separate browser profiles have separate records. Tabs on the same origin share the record, coordinate operations with Web Locks, and refresh when another tab saves. Reset demo restores only that browser's seed. Without browser storage or Web Locks, the app falls back to memory with a visible notice; reloading then loses changes. Corrupt or incompatible storage produces an error and can be recovered with Reset demo.

`POST /api/demo` takes `{ version: 1, path, method, body?, state, requestId? }`. A null state initializes the seed. It returns `{ version: 1, state, status, data, download? }`; `status` is the operation's HTTP status. Transport failures use ordinary HTTP errors. Downloads include text and `{ filename, contentType }`, converted into a browser Blob. Requests and responses are capped at three million bytes. Failed operations preserve browser state, including recorded domain failures. Exceeding the cap leaves the previous saved state intact.

Every request runs the existing domain dispatcher with isolated AsyncLocalStorage state. Regular file-backed `/api/*` endpoints are unavailable in hosted mode. Live requests are rejected even if an API key exists. No credentials are required. Browser-owned state and approval history are editable fictional demo data, not trusted real-world approvals. Use fictional inputs only; operations send the browser record to Vercel to execute the rules.

## Configuration and deployment

`vercel.json` selects Next.js and sets hosted-demo mode for build and runtime. `VERCEL=1` independently enforces it. `NEXT_PUBLIC_HOSTED_DEMO` is compiled from those server settings in `next.config.ts`; rebuild when changing modes. Native development retains the original file-backed behavior unless `LASER_FOCUS_HOSTED_DEMO=1` is explicitly set at build and runtime.

The install/build commands bootstrap Node 24.19.0 and npm 12.0.2 outside the project, then run `npm ci` and the production build under the pinned toolchain. This preserves the repository's exact engine policy. Vercel's managed function runtime selects Node 24.x and can receive patch updates independently of the build toolchain.

Create a personal Vercel project named `laser-focus-demo` (or an available suffix), connect `liamstojanovic/buildbettercode4miami`, select the repository root and Next.js, and set the production branch to `stable`. Use the committed install/build settings. Do not add OpenAI or Sheets credentials. Preview the integration branch before merging its PR to the fork's `stable`; verify the resulting production deployment's commit and default vercel.app URL afterward.

For local hosted-mode testing:

```sh
LASER_FOCUS_HOSTED_DEMO=1 npm run build
LASER_FOCUS_HOSTED_DEMO=1 npm run start
```

For the ordinary native baseline, run `npm run verify` without hosted mode. This uses disposable file state and disables model credentials. The hosted transport has separate request-isolation and workflow tests.

## Acceptance and rollback

Check direct navigation to `/`, `/inbox`, `/grants`, and `/counseling`; record edits, deterministic drafts, approval, export, simulated delivery, reload persistence, separate-profile isolation, cross-tab updates, and reset. Confirm live mode is unavailable and network traffic uses only same-origin operations and assets. Verify preview first, then production.

To roll back, select the previous successful production deployment in Vercel and use its rollback action. If the project has no previous production deployment, fix or revert the `stable` change and redeploy. Browser state is versioned separately; reset incompatible saved data rather than attempting an implicit migration.

Run `LASER_FOCUS_URL=https://your-deployment.vercel.app node scripts/smoke.mjs --hosted` for the full HTTP suite against hosted mode. Its state lives only in the smoke process; it never resets another visitor’s record. Optional `requestId` preserves generation idempotency across transport retries.

## November 18 verification

Native macOS ARM64 and the existing Linux ARM64 devcontainer passed 147 tests, typecheck, production build and 65 baseline HTTP checks. The hosted production variant also passed all 65 HTTP checks through `/api/demo`, including idempotent generation, disclosures, exports, approvals and simulated delivery. In Chrome, report drafting, approval, a completed download and persistence after reload were observed. Hosted CI architecture and remote deployment evidence are recorded separately when available.
