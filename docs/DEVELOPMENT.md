# Shared development environment

`stable` is the shared baseline on Liam's fork, including the development environment originally established on `feature/frontend-base`. Use exactly **Node 24.19.0** and **npm 12.0.2** in both native and container development. Direct dependencies are pinned to the existing lockfile versions; installing is not an upgrade operation.

## Branch workflow

- **Liam's fork:** `liamstojanovic/buildbettercode4miami`, with `stable` as its default branch and shared, verified baseline. Start new work from it; unfinished work stays on feature branches. The initial `stable` starts from `feature/fe-01` at `7661f70`, plus the branch-workflow and local-data documentation changes. It does not include the separate work on `feature/fe-02`.
- **Integration:** open pull requests from feature branches to the fork's `stable`. Run `npm run verify` and check the affected UI flows before merging. The **Development baseline** workflow runs on pull requests and pushes to `stable`, checking the actual devcontainer on Linux ARM64 and x86-64 runners. This documents the team process; it does not itself enforce branch protection.
- **Team upstream:** the team repository’s integration branch (confirm its current name before opening a PR) remains the upstream integration target. Check the repository and base branch when opening cross-fork pull requests. Changing the fork's default branch preserves the GitHub fork relationship, Git history and existing remote URLs.

For this checkout, `origin` is Liam's fork and `upstream` is the team repository. With a clean working tree, update your baseline and create a feature branch:

```sh
git fetch origin
git switch stable
git pull --ff-only origin stable
git switch -c feature/your-change
```

For an existing clone without a local `stable`, use `git switch --track origin/stable` after fetching. Existing feature branches remain available; merge `origin/stable` into an in-progress branch when it needs the new baseline.

## VS Code devcontainer (primary workflow)

Host prerequisites:

- VS Code with Microsoft's **Dev Containers** extension (`ms-vscode-remote.remote-containers`).
- A running Docker-compatible engine using Linux containers. Docker Desktop provides this on macOS and Windows; Docker Engine or Docker Desktop works on Linux.
- On Windows, enable WSL2 and Docker Desktop's WSL integration. Prefer cloning into the WSL Linux filesystem and opening the folder through VS Code's WSL extension to improve file watching and filesystem performance.
- Git to clone the repository, or use VS Code's **Clone Repository in Container Volume** command. Node and npm are supplied inside the container.

Open your clone in VS Code, switch to `stable`, then run **Dev Containers: Reopen in Container** from the Command Palette. The first build downloads the image and tools, creates isolated volumes, and runs `npm ci`. Later container creation repeats the installation against the lockfile.

In the container terminal:

```sh
npm run check:toolchain
npm run dev
```

Open **Laser Focus** on port 3000 in VS Code's **Ports** panel. The server listens on container loopback; VS Code forwards it to host localhost. The shared `appPort` declaration exists for non-VS Code tooling (see the Devcontainer CLI workflow below) and changes nothing here, because port 3000 is already forwarded through `forwardPorts`. Do not add Docker `-p` publishing for the loopback-bound server. If local port 3000 is occupied, use the actual forwarded address shown in the Ports panel. Server startup is manual, so reopening the workspace does not start extra servers.

The image selects `linux/arm64` on ARM machines and `linux/amd64` on x86-64 machines. No emulation is forced. The `node` user runs terminals, installs, and application commands; Git, Bash, curl, ripgrep and less are available. VS Code's built-in TypeScript support uses the workspace compiler.

No personal configuration mounts, host Docker socket, API keys or `.env.local` are required. The default fictional demo works without credentials. Git authentication remains a contributor-specific host setup; this configuration does not install keys.

## Devcontainer CLI workflow (without VS Code)

VSCodium and other editors cannot use Microsoft's **Dev Containers** extension. The Dev Container CLI drives the same checked-in `.devcontainer/devcontainer.json`: it builds the image, applies the `node` user, mounts and `postCreateCommand` (`npm ci`) just like VS Code. Only port handling differs. The `appPort` declaration publishes container port 3000 through Docker to `127.0.0.1:3000` on the host, and Docker publishing requires the server to accept connections from beyond container loopback. Use `npm run dev:container` (binds `0.0.0.0:3000`) in this workflow; `npm run dev` remains loopback-bound for native and VS Code use. The published port is restricted to host loopback, so nothing is exposed to the local network.

Host prerequisites (Debian example):

- A running Docker engine usable as your normal user. `docker info` must succeed before continuing.
- Dev Container CLI **0.90.0**, installed either way:
  - npm installation, which requires host Node.js 20 or newer, npm and build tools:

    ```sh
    sudo apt-get update
    sudo apt-get install -y python3 build-essential
    npm install --global --prefix "$HOME/.local" @devcontainers/cli@0.90.0
    export PATH="$HOME/.local/bin:$PATH"
    ```

  - Standalone installer, which bundles its own Node.js and needs no host Node or build tools:

    ```sh
    curl -fsSL https://raw.githubusercontent.com/devcontainers/cli/main/scripts/install.sh | sh -s -- --version 0.90.0
    export PATH="$HOME/.devcontainers/bin:$PATH"
    ```

From the repository root, create the container and open a shell in it:

```sh
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . bash
```

No temporary configuration file is needed: the CLI reads the checked-in file in place, so the relative `Dockerfile` and `context` paths keep resolving. The shell runs inside the container as the `node` user, in `/workspaces/laser-focus`. Inside it, start the application:

```sh
npm run check:toolchain
npm run dev:container
```

Open `localhost:3000` in a browser on the host. The `0.0.0.0` binding inside the container is what makes the published port reachable; the host side is limited to `127.0.0.1`.

Keep VSCodium open on the host checkout. Saved changes reach the container through the workspace bind mount and the dev server recompiles them; run development commands in the container shell. VSCodium's extensions and language server run on the host, so TypeScript intelligence needs a separate native `npm ci` (see [Native development](#native-development)); the container's `node_modules` volume is not visible to host editors.

Host port 3000 must be free when `devcontainer up` creates the container: Docker allocates the published `127.0.0.1:3000` immediately, and a native dev server already using that port makes container creation fail. Stop it first. VS Code's forwarding allocates no host port and is unaffected.

To run the project checks from the host:

```sh
devcontainer exec --workspace-folder . npm run verify
```

## Native development

Install Node **24.19.0** with your preferred version manager or the matching official installer, and install npm **12.0.2**. `.nvmrc` selects Node for tools that support it; `.npmrc` enforces install policy and does not install or switch Node.

With an existing Unix `nvm` installation:

```sh
nvm install
nvm use
npm install --global npm@12.0.2
npm ci
npm run dev
```

With an existing nvm-windows installation (PowerShell):

```powershell
nvm install 24.19.0
nvm use 24.19.0
npm install --global npm@12.0.2
npm ci
npm run dev
```

The optional `powershell -File scripts/dev.ps1 -Port 3000` launcher checks the same versions. It no longer searches machine-specific application caches for Node. Use a PowerShell execution policy appropriate to your machine; invoking `npm.cmd` directly is also an option if PowerShell blocks npm's `.ps1` shim.

`engines`, `devEngines`, the `packageManager` declaration and the preinstall checker describe/enforce the supported setup. A wrong Node/npm version should fail with an error. Yarn, pnpm and Bun are not supported installers. Do not bypass checks with `--force` or `--ignore-scripts` as a setup workaround.

## Dependencies, rebuilds and switching workflows

Source is shared with the host. Container `node_modules` and `.next` use workspace-specific Docker volumes; native installations/builds remain in the host checkout. TypeScript's incremental cache lives under `.next/cache` so it is isolated too. Never copy dependency directories between operating systems or architectures. `.data/state.json` remains in the checkout and persists across container rebuilds.

- After pulling a changed lockfile, run `npm ci` in each workflow you use. Reopening an existing container does not automatically reinstall dependencies.
- After changing the Dockerfile or devcontainer configuration, run **Dev Containers: Rebuild Container**, or `devcontainer up --workspace-folder .` again in the CLI workflow. Existing dependency/build volumes survive a rebuild.
- To clear stale build output, stop the server and remove only the contents of `.next` in the affected workflow. Do not remove the mounted directory itself.
- For an intentional package change, use `npm install <package>@<exact-version>` (or `--save-dev`), review both manifests, and run `npm run verify`. `save-exact=true` keeps new direct versions exact.
- npm 12 blocks unapproved dependency lifecycle scripts. The reviewed `esbuild@0.28.2` installer is allowed for binary setup/validation. The optional macOS `fsevents` package ships its binary; its implicit rebuild is denied. Review scripts before using `npm install-scripts approve <package>`; approvals are version-specific. Do not approve every dependency automatically.
- Update Node/npm declarations in `package.json`, `.nvmrc`, the Dockerfile, CI bootstrap, and this guide together. Update the Docker image's **multi-architecture index digest**, rather than selecting an architecture-specific child digest.

Keep platform-specific optional lockfile entries. Regenerate dependency changes from a complete lockfile and check both architecture jobs; never remove other platforms' packages to make a local installation look smaller.

## Local runtime data (`.data/`) and cleanup

`.data/` is generated, Git-ignored application storage, not a dependency directory or build cache. It is created automatically when needed; a fresh clone does not need a copy to install, build or start the fictional demo.

| Default path | Purpose |
| --- | --- |
| `.data/state.json` | Web-app state: seeded records, imported gifts, edits, drafts, approvals, agent runs and audit history. `src/lib/store.ts` creates the deterministic fictional seed on the first state read if the file is absent, and saves changes using atomic file replacement. `LASER_FOCUS_STATE_FILE` overrides this path. |
| `.data/sheets/workspaces/` | Separate Google Sheets workbook sessions, with hashed spreadsheet IDs as filenames. These do not share the web app's state. |
| `.data/sheets/bridge-token.txt` | Local Sheets bridge connection token, generated on bridge startup unless `LASER_FOCUS_SHEETS_TOKEN` supplies one. Treat it as a credential; do not commit or share it. `LASER_FOCUS_SHEETS_DATA` overrides the entire Sheets data directory. |

The devcontainer bind-mounts the checkout, so `.data/` is shared with the host and survives container rebuilds. It is not stored in the isolated `node_modules` or `.next` volumes. Native and container app sessions use the same default state file; the file store is designed for one Node process, so stop one server before starting another against that file.

For cleanup, stop the app and Sheets bridge first. Keep `.data/` if you want to preserve local work, or back it up before removing it. Deleting it discards saved web-app and workbook state; the next app state read recreates the fictional seed. The bridge recreates its storage on startup and generates a new token if neither a token file nor an environment token exists, so update the sidebar connection if the token changes. For just a fresh web-app scenario, use **Reset demo** instead; it restores the seed without removing Sheets storage. See the [Sheets guide](GOOGLE-SHEETS.md) for bridge setup and session behavior.

`npm ci` and container rebuilds do not reset this data. `npm run verify` uses disposable state outside the checkout and leaves your saved demo untouched.

## Validation

From a native or container terminal:

```sh
npm run verify
```

This checks the toolchain, typechecks, runs the existing tests, builds production output, starts a production server on port **3210**, and runs the deterministic HTTP smoke suite. It uses a temporary state file and disables live credentials, stops its server, and deletes that temporary state afterward. Port 3210 must be free; the verifier refuses to use an already-running server. Builds and the development server can coexist because Next.js keeps development output under `.next/dev`.

For container automation without VS Code, install the pinned CLI outside the project as described in the [Devcontainer CLI workflow](#devcontainer-cli-workflow-without-vs-code) section, or use the pinned one-off invocation below:

```sh
npx --yes @devcontainers/cli@0.90.0 up --workspace-folder .
npx --yes @devcontainers/cli@0.90.0 exec --workspace-folder . npm run verify
```

The GitHub **Development baseline** workflow uses that CLI to create the actual devcontainer and verify it on native Linux ARM64 and x86-64 runners. It also checks architecture, non-root execution, utilities, writable directories, and that validation leaves tracked files unchanged. It runs on pull requests, pushes to `stable`, and manual dispatch. Checks require no repository secrets or live model calls.

When recording results, distinguish native host checks, native Linux containers, emulated containers, hosted CI and interactive VS Code testing. A successful image build or manifest inspection alone does not prove application compatibility. See [verification records](VERIFICATION.md) for the evidence collected so far.
