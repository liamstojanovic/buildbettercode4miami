#!/usr/bin/env bash
set -euo pipefail
export LASER_FOCUS_BUILD_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export LASER_FOCUS_BUILD_TASK="${1:?Expected install or build}"
# Bootstrap outside the application so its exact-engine policy remains enforced
# for npm ci, rather than rejecting Vercel's initial build-image toolchain.
bootstrap=$(mktemp -d)
trap 'rm -rf "$bootstrap"' EXIT
cd "$bootstrap"
npm exec --yes --package=node@24.19.0 --package=npm@12.0.2 --call 'node "$LASER_FOCUS_BUILD_ROOT/scripts/vercel-task.mjs" "$LASER_FOCUS_BUILD_TASK"'
