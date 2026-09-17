#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${KAIPA_SUPABASE_RUNTIME_DIR:-$(cd "$ROOT/.." && pwd)/kaipa-supabase-docker}"
if [[ ! -f "$RUNTIME_DIR/docker-compose.yml" || ! -f "$RUNTIME_DIR/.env" ]]; then
  echo 'Self-hosted Supabase runtime is missing.' >&2
  exit 1
fi
install -m 644 "$ROOT/infra/supabase/agent-worker.mjs" "$RUNTIME_DIR/agent-worker.mjs"
install -m 644 "$ROOT/infra/supabase/agent-worker.compose.yml" "$RUNTIME_DIR/agent-worker.compose.yml"
docker compose --project-directory "$RUNTIME_DIR" -f "$RUNTIME_DIR/docker-compose.yml" -f "$RUNTIME_DIR/agent-worker.compose.yml" up -d --force-recreate --no-deps agent-worker
