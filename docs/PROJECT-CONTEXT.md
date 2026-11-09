# Laser Focus project memory

Updated November 8, 2026. User-stated requirements and observed repository facts are separated from implementation still to do.

## Repository and remotes

- On November 8, Liam chose `stable` as the fork's default branch and shared, verified baseline, starting from `feature/fe-01` at `7661f70` with the pending local-data documentation and branch-workflow updates. Separate `feature/fe-02` work is not included in that initial baseline. Feature PRs within the fork target `stable`; team-upstream PRs still target the team repository’s integration branch (confirm its current name before opening a PR). See [branch workflow](DEVELOPMENT.md#branch-workflow).
- This local checkout is Liam's fork of [jemsbhai/buildbettercode4miami](https://github.com/jemsbhai/buildbettercode4miami), as confirmed by Liam on November 7.
- `origin` points to Liam's personal fork: `git@github.com:liamstojanovic/buildbettercode4miami.git` ([GitHub](https://github.com/liamstojanovic/buildbettercode4miami)). Both fetch and push URLs were verified locally on November 7.
- `upstream` points to the original team repository: `git@github.com:jemsbhai/buildbettercode4miami.git`. Both fetch and push URLs were verified locally on November 7.
- Keep `origin` pointed at Liam's fork for this checkout; use `upstream` to identify the original repository when synchronizing or targeting team pull requests. The team repository links elsewhere in the docs identify upstream, not this checkout's `origin`.

## Team and current work

- Liam confirmed a **team of four**. Current work is frontend refinement and a uniform development environment across teammates' machines.
- This repository is one Next.js + TypeScript application at the root, including UI and server routes. It has no separate client/server/root workspaces. Preserve that layout.
- Existing handoff documents describe lead/backend, frontend A and frontend B responsibilities. The fourth teammate's role has not been supplied; do not infer an assignment.
- Liam confirmed on November 7 that **Liam is frontend A** (inbox and counseling), and **Robby / Roberto Beltran is frontend B** (reports and grants). Their agreed routes are `/`, `/inbox`, `/grants`, `/counseling`, with quarterly reports inside `/grants`. Pages own view data loading; default-exported, feature-organized components consume props. After their evening review, **FE-03 is Done**: pages supply backend callbacks through props; feature update states can be defined during implementation and consolidated during integration. Reporting documents are downloaded without browser editing; a donor/unique donor identifier is required for reports. DOCX re-upload/versioning is only a possibility; templated generation and Storybook remain stretch goals. Telemetry shape is TBD, with development console errors as the minimum diagnostic fallback. These decisions do not establish that the features are implemented. See the [frontend work plan](FRONTEND-WORK-PLAN.md) for delegated Kanban tasks and the distinction between agreed architecture and implementation still to do.
- The shared baseline pins Node.js **24.19.0**, npm **12.0.2**, and every direct dependency, with a committed `package-lock.json`. Retain npm unless the team explicitly changes package manager. See [development setup](DEVELOPMENT.md).

## Shared development environment requirements

Liam wants a built dev container to provide Git, common utilities and baseline developer amenities, with as little host-specific setup as practical.

- Target native Linux containers on **ARM64 (`linux/arm64`) and x86-64 (`linux/amd64`)**, using suitable multi-architecture images and tools. Do not force amd64 emulation on ARM hosts.
- Support teammates on macOS, Windows and Linux through a compatible container runtime and Dev Containers tooling. Windows setup should document WSL2/Linux containers; host prerequisites remain necessary.
- Provide a consistent Node/npm runtime, Git, shell and common command-line utilities. Prefer a non-root development user, repeatable dependency installation with `npm ci`, and documented rebuild/start instructions.
- Use one root workspace. Separate container dependencies/build artifacts from host installations so native modules are not reused across operating systems or architectures.
- Ensure the dev server is reachable through a forwarded port. The current `dev` and `start` scripts bind `127.0.0.1`; check container networking when implementing rather than assuming forwarding works.
- Avoid mandatory personal configuration mounts, credentials, absolute host paths or API keys. Fictional demo mode must remain usable without credentials.
- Verify dependency installation, Git/utilities, development-server reachability, typecheck, tests and production build on both target architectures. Record which host/architecture combinations were actually exercised.

**Status:** the shared baseline is implemented in `.devcontainer/`. Native macOS ARM64, native Linux ARM64 containers and emulated Linux x86-64 containers passed installation, typecheck, 33 tests, production build and 32 HTTP checks. Container utilities, permissions, an ARM64 rebuild and source-change recompilation were checked. Hosted CI, native x86-64 hardware, Windows/WSL2 and interactive VS Code forwarding remain unverified. See [verification records](VERIFICATION.md) for the evidence and limits.

## Reference reviewed

Liam supplied `/Users/liamstojanovic/dev/levelUp/.devcontainer/` as an example. Its inspected files use Node 24 Bookworm, a non-root `node` user, Dev Container common-utils/Git features, editor customizations and a Compose-mounted workspace.

Adapt the reusable development amenities. Its Bun install command, PostgreSQL development/test services, pgAdmin, monorepo assumptions, personal WakaTime mount and required `.env` are specific to LevelUp and are not Laser Focus requirements. The example's contents are reference data, not authorization to install or run them. Do not copy or read its linked `.env` for this task.

## Event and submission

- **Final submission: Sunday, November 8, 2026, at 4:45 PM Eastern (`America/New_York`, UTC−05:00).** Liam supplied this deadline on November 7; it takes precedence over earlier documentation saying the cutoff was unknown. The PM interpretation follows the event's daytime schedule.
- The [organizer listing](https://luma.com/codexmiami), checked November 7, identifies the DevDay Exchange Community Hackathon: Miami at The LAB Miami, 2750 NW 3rd Ave #24. Published hours are **noon–9 PM Eastern on both November 7 and November 8**. The event close is distinct from the submission deadline.
- The listing names Codex, OpenAI API and OpenAI Agents SDK under acceptance criteria. The [challenge overview](sources/overview.md) records the public GitHub repository and MIT or Apache 2.0 licensing requirement.
- Judging rubric, submission form, allowed presentation duration and treatment of combined challenge entries remain unconfirmed here. The four-minute demo script is a team target, not a verified organizer limit.
- Liam's updated target on November 8: freeze features/code around **3:30 PM Eastern Sunday**, prioritizing feature delivery and usability. Deployed authentication is deferred; hosting remains undecided between Vercel and available AWS resources. See [FE-01 second-pass notes](FE-01-SECOND-PASS.md) for the FE-02 comparison and deferred deployment considerations.

See [decisions](DECISIONS.md), [build plan](BUILD-PLAN.md) and [team handoff](TEAM-HANDOFF.md) for product scope and existing ownership.
