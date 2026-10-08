#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${KAIPA_SUPABASE_RUNTIME_DIR:-$ROOT/infra/supabase/docker}"
test -f "$RUNTIME_DIR/docker-compose.yml"
test -f "$RUNTIME_DIR/.env"
python3 - "$RUNTIME_DIR/.env" <<'PY'
from pathlib import Path
import secrets, sys
p = Path(sys.argv[1])
s = p.read_text()
if not any(line.startswith('FLYAI_QUERY_TOKEN=') and line.split('=', 1)[1] for line in s.splitlines()):
    s = '\n'.join(line for line in s.splitlines() if not line.startswith('FLYAI_QUERY_TOKEN='))
    p.write_text(s.rstrip() + '\nFLYAI_QUERY_TOKEN=' + secrets.token_urlsafe(32) + '\n')
p.chmod(0o600)
PY
mkdir -p "$RUNTIME_DIR/flyai-query"
install -m 644 "$ROOT"/infra/supabase/flyai-query/{Dockerfile,server.mjs} "$RUNTIME_DIR/flyai-query/"
install -m 644 "$ROOT/infra/supabase/flyai-query.compose.yml" "$RUNTIME_DIR/flyai-query.compose.yml"
compose=(-f "$RUNTIME_DIR/docker-compose.yml")
# Preserve the existing rail provider when recreating Edge with its new env.
if [[ -f "$RUNTIME_DIR/rail-query.compose.yml" ]]; then compose+=(-f "$RUNTIME_DIR/rail-query.compose.yml"); fi
compose+=(-f "$RUNTIME_DIR/flyai-query.compose.yml")
if [[ -f "$RUNTIME_DIR/topic-guard.compose.yml" ]]; then compose+=(-f "$RUNTIME_DIR/topic-guard.compose.yml"); fi
docker compose --project-directory "$RUNTIME_DIR" "${compose[@]}" up -d --build --no-deps flyai-query functions
