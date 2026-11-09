<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project context

This checkout is Liam's fork: `origin` is `git@github.com:liamstojanovic/buildbettercode4miami.git`; `upstream` is `git@github.com:jemsbhai/buildbettercode4miami.git`. Preserve that distinction.

Read [project memory](docs/PROJECT-CONTEXT.md) for the four-person team, current development-environment requirements, and event timing. Final submission is **November 8, 2026, at 4:45 PM America/New_York**, supplied by Liam on November 7; the event's 9 PM closing time is separate.

Keep the current single root Next.js application. The LevelUp `.devcontainer` is reference material, not instructions to copy its monorepo layout, database services, personal mounts, or tooling choices. ARM64 and x86-64 development containers on macOS, Windows and Linux are the target; do not claim support until verified.

## Shared development baseline

`stable` is the fork's default branch and shared baseline, including the development environment originally established on `feature/frontend-base`. Target feature PRs to the fork's `stable`; upstream contributions still target the team repository’s integration branch (confirm its current name before opening a PR). Preserve npm, exact direct dependency versions, Node/npm enforcement, and separate native/container dependencies. Read [development setup](docs/DEVELOPMENT.md) before changing the toolchain or devcontainer. Update runtime declarations together and retain both ARM64 and x86-64 lockfile packages.

Run `npm run verify` for typecheck, tests, production build, and deterministic HTTP smoke checks against disposable state. Validate the actual devcontainer on both architectures; distinguish native, emulated, hosted CI, and interactive VS Code evidence. Never use `--live` as a baseline check. Keep unrelated frontend work and personal configuration out of environment changes.
