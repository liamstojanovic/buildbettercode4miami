# Demo from this machine

Use the current machine as the single demo host. Present the web app locally and
use the protected HTTPS bridge for Google Sheets. The Docker bridge package and
its data volume can be moved to an always-on host later.

## Current arrangement

- Web app: production Next.js build at `http://127.0.0.1:3000`, including `/api/*`.
- Sheets: one Docker bridge with persistent workbook storage, published only at
  `127.0.0.1:3220`, reached by Apps Script through a Cloudflare HTTPS tunnel.
- Google: a separate demo account in a single-account browser session; the bound
  script has the current-spreadsheet, sidebar and external-request permissions.
- Data: the web app uses `.data/state.json`; Sheets uses its separate Docker volume.
  Importing into Sheets does not populate the web dashboard.
- Drafting: deterministic rehearsal mode works now. Live drafting requires a
  server-side `OPENAI_API_KEY` and has not been validated in this session.

## Start or recover

From the repository root, use separate terminals (commands also work in PowerShell):

```sh
npm start
```

This uses the existing production build. Run `npm run build` first if source has
changed since that build. The process must keep running during the demonstration.

```sh
docker compose -f deploy/sheets/compose.yaml up -d --wait
cloudflared tunnel --url http://127.0.0.1:3220
```

Keep the tunnel running. If its HTTPS address changes, update **Connect Tidepath**
in the Sheets sidebar. Retrieve the connection token locally using the command in
[SHEETS-DEPLOYMENT.md](SHEETS-DEPLOYMENT.md); never paste it into workbook cells.
Do not start the native Sheets bridge while Docker is using port 3220.

## Presentation checks

The native Sheets rehearsal passed on November 8 with the separate demo account:
seven gifts, $635, identity merge from five donors to three, a wrong-figure approval
block, corrected revision 3, a changed-source write block, a successful new report
tab and a duplicate-safe retry. Readback of the actual report cells confirmed the
approved revision and figures. Open the [approved report](https://docs.google.com/spreadsheets/d/1obnnwmQL-q9zRw5OLxCsVoT71iJ0n_82_AAO6haLxT4/edit#gid=1709986643)
or its fictional source tab for presentation. Keep using the isolated single-account
browser session; the original multiple-account session failed the sidebar storage call.

1. Open `/`, `/inbox`, `/grants`, and `/counseling` on localhost. All four routes and
   `GET /api/dashboard` returned HTTP 200 against the running production server
   during November 8 validation, without resetting existing data.
2. Open the test workbook under the demo account and choose **Tidepath → Open sidebar**.
3. Rehearse import → identity merge → report review/approval → new-tab write-back.
   Confirm actual spreadsheet output; an HTTPS health check alone is insufficient.
4. Keep the host awake using your existing wakefulness tools, Docker running, and
   the internet connection stable.
5. Present the web app from this machine. Its localhost address is not accessible
   to judges on other devices. Only the narrow Sheets bridge is tunneled.

Avoid changing hosting platforms, database storage, authentication architecture or
container base distribution during the remaining rehearsal time. The local web app
has no user authentication; the public bridge has a shared demo token. Use fictional
data throughout.
