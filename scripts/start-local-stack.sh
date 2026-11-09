#!/usr/bin/env bash
# Run from the host with Docker Desktop running. Reuses existing containers and data.
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
app_url=http://127.0.0.1:3000
bridge_url=http://127.0.0.1:3220
app_log=/tmp/laser-focus-local-stack.log

die() { printf '%s\n' "$*" >&2; exit 1; }

# Inspect saved port mappings too, so stopped containers can be found and started.
find_container() {
  local port=$1 id matches=()
  shift
  for id in $(docker ps -aq "$@"); do
    if [[ $(docker inspect --format "{{range index .HostConfig.PortBindings \"$port/tcp\"}}{{if and (eq .HostIp \"127.0.0.1\") (eq .HostPort \"$port\")}}yes{{end}}{{end}}" "$id") == yes ]]; then
      matches+=("$id")
    fi
  done
  if [[ ${#matches[@]} -eq 1 ]]; then printf '%s\n' "${matches[0]}"; fi
}

ensure_running() {
  if [[ $(docker inspect --format '{{.State.Running}}' "$1") != true ]]; then
    docker start "$1" >/dev/null
  fi
}

healthy() { curl -fsS --max-time 3 "$1" >/dev/null 2>&1; }
wait_for() {
  local url=$1 attempt
  for ((attempt=0; attempt<30; attempt++)); do
    if healthy "$url"; then return 0; fi
    sleep 1
  done
  return 1
}

docker info >/dev/null 2>&1 || die 'Start Docker Desktop and retry.'
app=${LASER_FOCUS_APP_CONTAINER:-$(find_container 3000 --filter "label=devcontainer.local_folder=$root")}
# The demo bridge and an older Compose bridge share the same saved port mapping.
bridge=${LASER_FOCUS_BRIDGE_CONTAINER:-$(find_container 3220 --filter 'label=com.docker.compose.service=bridge' --filter 'name=-bridge-demo$')}
[[ -n $app ]] || die 'Could not uniquely find the app devcontainer. Set LASER_FOCUS_APP_CONTAINER to its Docker name or ID.'
[[ -n $bridge ]] || die 'Could not uniquely find the existing Sheets bridge. Set LASER_FOCUS_BRIDGE_CONTAINER to its Docker name or ID.'

ensure_running "$app"
ensure_running "$bridge"
if ! healthy "$app_url/api/dashboard"; then
  if ! docker exec "$app" pgrep -f '[n]ext dev|[n]ext-server' >/dev/null; then
    workspace=$(docker inspect --format '{{.Config.WorkingDir}}' "$app")
    docker exec -d -w "$workspace" "$app" sh -c 'npm run dev:container > "$1" 2>&1' sh "$app_log"
  fi
fi
wait_for "$app_url/api/dashboard" || die "App did not become ready. Check: docker exec $app tail -40 $app_log"
wait_for "$bridge_url/health" || die "Sheets bridge did not become ready. Check: docker logs --tail 40 $bridge"
printf 'App and backend: %s\nSheets bridge: %s\n' "$app_url" "$bridge_url"

if pgrep -f '[c]loudflared .*tunnel .*--url(=| )http://127\.0\.0\.1:3220( |$)' >/dev/null; then
  printf '%s\n' 'Existing Sheets tunnel left running. Keep the current HTTPS address in the sidebar.'
  exit 0
fi

command -v cloudflared >/dev/null || die 'App and bridge are ready. Install cloudflared or start your existing Sheets tunnel separately.'
mkdir -p "$root/.data"
tunnel_log=$(mktemp "$root/.data/sheets-tunnel.XXXXXX")
nohup cloudflared tunnel --url "$bridge_url" --no-autoupdate </dev/null >"$tunnel_log" 2>&1 &
tunnel_pid=$!
for ((attempt=0; attempt<30; attempt++)); do
  origin=$(sed -nE 's/.*(https:\/\/[a-z0-9-]+\.trycloudflare\.com).*/\1/p' "$tunnel_log" | head -n 1)
  if [[ -n $origin ]] && healthy "$origin/health"; then
    printf 'New Sheets HTTPS address: %s\nUpdate the sidebar address and reuse the same bridge token.\n' "$origin"
    exit 0
  fi
  kill -0 "$tunnel_pid" 2>/dev/null || break
  sleep 1
done
die "Tunnel is not ready. Check: $tunnel_log"
