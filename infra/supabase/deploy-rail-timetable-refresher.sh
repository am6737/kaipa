#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${KAIPA_SUPABASE_RUNTIME_DIR:-$ROOT/infra/supabase/docker}"
if [[ ! -f "$RUNTIME_DIR/docker-compose.yml" || ! -f "$RUNTIME_DIR/.env" ]]; then
  echo 'Self-hosted Supabase runtime is missing.' >&2
  exit 1
fi
# Needs app-agent deployed with the refresh_rail_timetables action
# (supabase/functions/app-agent/rail-timetable-refresh.ts) and the rail-query sidecar.
install -m 644 "$ROOT/infra/supabase/rail-timetable-refresher.mjs" "$RUNTIME_DIR/rail-timetable-refresher.mjs"
install -m 644 "$ROOT/infra/supabase/rail-timetable-refresher.compose.yml" "$RUNTIME_DIR/rail-timetable-refresher.compose.yml"
docker compose --project-directory "$RUNTIME_DIR" -f "$RUNTIME_DIR/docker-compose.yml" -f "$RUNTIME_DIR/rail-timetable-refresher.compose.yml" up -d --force-recreate --no-deps rail-timetable-refresher
