#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${KAIPA_SUPABASE_RUNTIME_DIR:-$(cd "$ROOT/.." && pwd)/kaipa-supabase-docker}"
test -f "$RUNTIME_DIR/docker-compose.yml"
test -f "$RUNTIME_DIR/.env"
mkdir -p "$RUNTIME_DIR/rail-query"
install -m 644 "$ROOT"/infra/supabase/rail-query/{Dockerfile,server.mjs,policy.mjs,gate.mjs,connections.mjs,upstream-single-page.patch} "$RUNTIME_DIR/rail-query/"
install -m 644 "$ROOT/infra/supabase/rail-query.compose.yml" "$RUNTIME_DIR/rail-query.compose.yml"
docker compose --project-directory "$RUNTIME_DIR" -f "$RUNTIME_DIR/docker-compose.yml" -f "$RUNTIME_DIR/rail-query.compose.yml" up -d --build --no-deps rail-query functions
