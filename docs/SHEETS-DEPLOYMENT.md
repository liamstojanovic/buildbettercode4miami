# Single-host Sheets bridge

The Sheets adapter is an independent Node HTTP service. The host package is
[`deploy/sheets/compose.yaml`](../deploy/sheets/compose.yaml), built with the pinned
Node 24.19.0/npm 12.0.2 runtime on Debian slim. It runs the existing bridge without
VS Code or Next.js. The image retains development dependencies because the existing
launcher needs `tsx`; this first package does not optimize the dependency set.

## Google connection

```text
Google Sheets sidebar → bound Apps Script → HTTPS → host bridge:3220
                                                   ↓
                                            persistent /data
                                                   ↓
                                       OpenAI (live mode only)
```

The script's Google authorization is for the current spreadsheet, container UI,
and external HTTP requests. No Google API key, service account, OAuth client secret,
or Google refresh token belongs on the host. Apps Script reads/writes the sheet;
the bridge receives JSON commands authenticated by its shared bearer token.
This does not provide Google Docs support, Google login to the web app, or
organization-level authorization.

Install `Code.gs`, `Sidebar.html` and `appsscript.json` in the workbook's bound
Apps Script project as described in [GOOGLE-SHEETS.md](GOOGLE-SHEETS.md). Keep the
script bound to the workbook; a public Apps Script web-app deployment is unnecessary.

On November 8, a fresh installation under Liam's primary Google account reached
authorization but Google Advanced Protection rejected it with
`Error 400: policy_enforced`. A separate demo account subsequently authorized all
three scopes successfully after review of Google's unverified-app warning. With
both accounts signed into the same Chrome profile, the installed sidebar then
reported that Google could not read its user storage. In an isolated browser
session signed into only the demo account, the full native flow subsequently passed:
import, identity merge, report generation, wrong-figure approval block, corrected
approval, source-change write block, new-tab write-back and duplicate-safe retry.
See [Google account permission errors](GOOGLE-SHEETS.md#google-account-permission-errors).
Neither earlier error indicated a missing Sheets API key or a failed bridge deployment.

## Run on one Docker host

From the repository root, in Bash, zsh or PowerShell:

```sh
docker compose -f deploy/sheets/compose.yaml up --build -d --wait
docker compose -f deploy/sheets/compose.yaml ps
```

The container runs as `node`, with a read-only root filesystem and writable `/data`
and temporary storage. Only `127.0.0.1:3220` is published on the host. Its internal
bind address is explicitly `0.0.0.0`; native `npm run sheets:bridge` still defaults
to `127.0.0.1`. Neither the web app nor its general API is included or exposed.

The named `workbook-data` volume stores a generated connection token and workbook
sessions. Rebuilding/restarting the service retains them. Keep exactly one bridge
instance; its locks and file storage do not coordinate multiple replicas.
The container does not import existing native `.data/sheets` sessions automatically.

Read the token locally only when configuring the sidebar (this prints a credential):

```sh
docker compose -f deploy/sheets/compose.yaml exec -T bridge node -e 'process.stdout.write(require("node:fs").readFileSync("/data/bridge-token.txt","utf8"))'
```

Enter the token only into the sidebar connection settings. Do not put it in cells,
commit it, or include it in screenshots. Apps Script stores it in UserProperties.

For live drafting, supply `OPENAI_API_KEY` and optionally `OPENAI_MODEL` through the
host environment. An ignored `.env.local` can alternatively be supplied explicitly:

```sh
docker compose --env-file .env.local -f deploy/sheets/compose.yaml up -d --wait
```

Without a key, deterministic rehearsal mode works. No credential files are copied
into the image. The Dockerfile-specific build ignore file limits the source context.

## HTTPS ingress

Apps Script runs on Google's servers and cannot call the host's localhost. Put an
HTTPS reverse proxy or tunnel in front of `http://127.0.0.1:3220`. Enter its final
HTTPS origin in the sidebar, without a path. Forward `Authorization` unchanged and
allow at least 65 seconds for command responses. An interactive browser login gate
in front of the bridge will not work with the current Apps Script bearer-token client.

For a temporary local demo, run on the same host:

```sh
cloudflared tunnel --url http://127.0.0.1:3220
```

Keep the tunnel running. Its URL may change after restart; a durable service needs
a stable HTTPS origin and an always-on host. On November 8, the local DNS resolver
initially returned `0.0.0.0`/`::` for `api.trycloudflare.com`; changing the resolver
allowed tunnel registration and a successful external `/health` request.

`GET /health` is public and returns only service availability. `POST /v1/command`
requires the bridge token. Preserve that boundary when configuring ingress.

## Validate and stop

Observed on November 8, 2026:

- Native macOS ARM64: `npm run verify` passed 142 tests, the production build and
  65 HTTP smoke checks after the launcher change.
- Docker Linux ARM64: the actual Debian-slim image built and became healthy as the
  non-root `node` user with the read-only filesystem enabled. Its published port
  was restricted to host loopback.
- Against that container over localhost: unauthenticated commands were rejected;
  seven gifts were imported, Rosa's identities merged to three donors with $635
  preserved, a deterministic report generated, approval of a wrong figure rejected,
  the correct revision approved, and the report exported.
- A container restart preserved the connection token, gifts, approved revision and
  exact export digest. No live model calls were made.
- The native bridge returned a successful public HTTPS `/health` response after
  the DNS change. After explicit approval to transmit the demo token through the
  tunnel, authenticated HTTPS checks against the container also passed: the saved
  gifts, approved draft, token hash and exact export digest matched after restart.
- A separate demo account completed Google consent. After isolating that account
  in its own browser session, the actual Sheets sidebar imported seven gifts for
  $635, merged five donor identities to three, generated a rehearsal report,
  rejected approval with giving set to 999, then approved corrected revision 3.
  Changing source cell F2 from 125 to 126 blocked write-back; restoring 125 allowed
  export. A repeated write reused the same report tab. Native cell readback confirmed
  revision 3, three donors, $635 and the source range `Tidepath demo gifts!A1:H8`.
- The validated output is [the approved report tab](https://docs.google.com/spreadsheets/d/1obnnwmQL-q9zRw5OLxCsVoT71iJ0n_82_AAO6haLxT4/edit#gid=1709986643).
  The workbook retains its default Sheet1, the fictional source tab and one report
  tab. Sharing permissions were not changed.
- x86-64 execution and live model calls remain unverified for this host package.

Run `npm run verify` for typecheck, tests, production build and disposable HTTP smoke
checks. Validate the actual container's health, authenticated commands and persistence
across restart separately. Then use a permitted Google account to rehearse the
[native Sheets flow](GOOGLE-SHEETS.md#rehearse-the-full-flow). Automated bridge tests
and an HTTPS health response do not establish that Google consent or write-back works.

```sh
docker compose -f deploy/sheets/compose.yaml logs --tail 50 bridge
docker compose -f deploy/sheets/compose.yaml restart bridge
docker compose -f deploy/sheets/compose.yaml stop
```

Stopping retains the data volume. Do not use `down --volumes` unless intentionally
discarding every saved workbook session and the connection token.

This remains a single-process, shared-token demo service. The main Next.js app uses
separate state and is deployed independently. ARM64 and x86-64 runtime results must
be recorded separately; publishing a multi-architecture base image alone is not proof.
