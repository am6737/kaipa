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
if not any(line.startswith('TOPIC_GUARD_TOKEN=') and line.split('=', 1)[1] for line in s.splitlines()):
    s = '\n'.join(line for line in s.splitlines() if not line.startswith('TOPIC_GUARD_TOKEN='))
    p.write_text(s.rstrip() + '\nTOPIC_GUARD_TOKEN=' + secrets.token_urlsafe(32) + '\n')
p.chmod(0o600)
PY
mkdir -p "$RUNTIME_DIR/topic-guard"
install -m 644 "$ROOT"/infra/supabase/topic-guard/{Dockerfile,requirements.txt,server.py,config.yml,prompts.yml,evaluate.py,eval_cases.json} "$RUNTIME_DIR/topic-guard/"
install -m 644 "$ROOT/infra/supabase/topic-guard.compose.yml" "$RUNTIME_DIR/topic-guard.compose.yml"
compose=(-f "$RUNTIME_DIR/docker-compose.yml")
for overlay in rail-query flyai-query; do
  if [[ -f "$RUNTIME_DIR/$overlay.compose.yml" ]]; then compose+=(-f "$RUNTIME_DIR/$overlay.compose.yml"); fi
done
compose+=(-f "$RUNTIME_DIR/topic-guard.compose.yml")
# Build and verify the guard before changing the running Edge environment.
docker compose --project-directory "$RUNTIME_DIR" "${compose[@]}" up -d --build --wait --wait-timeout 120 --no-deps topic-guard
docker exec kaipa-topic-guard python /app/evaluate.py
# Use the workspace's self-hosted deployment entrypoint for function sources.
"$ROOT/infra/supabase/deploy-functions.sh" app-agent
docker compose --project-directory "$RUNTIME_DIR" "${compose[@]}" up -d --force-recreate --wait --wait-timeout 60 --no-deps functions
echo 'NeMo topic guard and app-agent are ready.'
