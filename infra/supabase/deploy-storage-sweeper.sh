#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${KAIPA_SUPABASE_RUNTIME_DIR:-$ROOT/infra/supabase/docker}"
if [[ ! -f "$RUNTIME_DIR/docker-compose.yml" || ! -f "$RUNTIME_DIR/.env" ]]; then
  echo 'Self-hosted Supabase runtime is missing.' >&2
  exit 1
fi
# Needs public.storage_objects_present (supabase/migrations/20261023200000_storage_upload_sweep.sql).
# STORAGE_SWEEP_DRY_RUN=1 only logs what would be removed.
install -m 644 "$ROOT/infra/supabase/storage-sweeper.mjs" "$RUNTIME_DIR/storage-sweeper.mjs"
install -m 644 "$ROOT/infra/supabase/storage-sweeper.compose.yml" "$RUNTIME_DIR/storage-sweeper.compose.yml"
docker compose --project-directory "$RUNTIME_DIR" -f "$RUNTIME_DIR/docker-compose.yml" -f "$RUNTIME_DIR/storage-sweeper.compose.yml" up -d --force-recreate --no-deps storage-sweeper
