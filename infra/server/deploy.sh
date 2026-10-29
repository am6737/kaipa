#!/usr/bin/env bash
# Run on the NEW server, from a checkout that already has the runtime config
# bundle (export-runtime-config.sh) unpacked and the database data in place.
# Brings up the whole Kaipa backend in the order the single-purpose deploy
# scripts expect, then smoke-tests it. Safe to re-run.
#
#   infra/server/deploy.sh [--with-web] [--allow-empty-db]
#
#   --with-web        also build and publish the web guest app + admin
#                     (needs Node and the app/admin dependencies installed)
#   --allow-empty-db  let Postgres initialise an empty data directory. Only for
#                     a throwaway server: the repo's SQL files cannot rebuild the
#                     current schema, so production must carry the data over.
#
# See docs/server-deployment.md for the full checklist.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${KAIPA_SUPABASE_RUNTIME_DIR:-$ROOT/infra/supabase/docker}"
DB_CONTAINER="${KAIPA_SUPABASE_DB_CONTAINER:-kaipa-supabase-db}"
export KAIPA_SUPABASE_RUNTIME_DIR="$RUNTIME_DIR"
WITH_WEB=0
ALLOW_EMPTY_DB=0
for arg in "$@"; do
  case "$arg" in
    --with-web) WITH_WEB=1 ;;
    --allow-empty-db) ALLOW_EMPTY_DB=1 ;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }
read_env() { sed -n "s/^$1=//p" "$RUNTIME_DIR/.env" | tail -n 1; }

step 'Preflight'
for cmd in docker python3 rsync curl install; do
  command -v "$cmd" >/dev/null || die "$cmd is not installed"
done
compose_version="$(docker compose version --short 2>/dev/null || true)"
[[ -n "$compose_version" ]] || die 'docker compose plugin is not installed'
# production.compose.yml uses `!override`, added in Compose 2.24.
python3 - "$compose_version" <<'PY' || die "docker compose $compose_version is too old; need >= 2.24"
import sys
major, minor = (int(x) for x in sys.argv[1].lstrip('v').split('.')[:2])
sys.exit(0 if (major, minor) >= (2, 24) else 1)
PY
if [[ -f "$ROOT/supabase/.temp/project-ref" ]]; then
  die 'this checkout is linked to Supabase Cloud; run npx supabase unlink'
fi

missing=()
for f in .env kaipa-client.env docker-compose.yml volumes/api/kong.yml volumes/api/kong-entrypoint.sh \
  volumes/pooler/pooler.exs volumes/functions/main/index.ts volumes/db/roles.sql volumes/db/jwt.sql \
  volumes/db/webhooks.sql volumes/db/realtime.sql volumes/db/logs.sql volumes/db/pooler.sql volumes/db/_supabase.sql; do
  [[ -e "$RUNTIME_DIR/$f" ]] || missing+=("$f")
done
if (( ${#missing[@]} )); then
  printf '  missing %s\n' "${missing[@]}" >&2
  die 'runtime bootstrap files are missing; unpack the bundle from infra/server/export-runtime-config.sh first'
fi
chmod 600 "$RUNTIME_DIR/.env" "$RUNTIME_DIR/kaipa-client.env" "$ROOT/.env"

step 'Checking environment'
"$ROOT/infra/server/check-env.sh" || die 'fix the ERROR lines above (docs/server-deployment.md lists each variable)'

step 'Checking database data directory'
data_dir="$RUNTIME_DIR/volumes/db/data"
# Postgres owns its data dir with mode 700, so an unreadable dir is an initialised one.
if [[ -d "$data_dir" && ( ! -r "$data_dir" || ! -x "$data_dir" || -n "$(ls -A "$data_dir" 2>/dev/null)" ) ]]; then
  echo 'Data directory present.'
elif (( ALLOW_EMPTY_DB )); then
  echo 'Data directory empty; Postgres will initialise a blank database (--allow-empty-db).'
  mkdir -p "$data_dir" "$RUNTIME_DIR/volumes/storage" "$RUNTIME_DIR/volumes/snippets"
else
  die "no database data in $data_dir. Copy it from the old server first (docs/server-deployment.md), or pass --allow-empty-db for a throwaway server"
fi
mkdir -p "$RUNTIME_DIR/volumes/storage" "$RUNTIME_DIR/volumes/snippets"

step 'Starting the base stack (Kong and the pooler bound to 127.0.0.1)'
install -m 644 "$ROOT/infra/supabase/production.compose.yml" "$RUNTIME_DIR/production.compose.yml"
base=(--project-directory "$RUNTIME_DIR" -f "$RUNTIME_DIR/docker-compose.yml" -f "$RUNTIME_DIR/production.compose.yml")
docker compose "${base[@]}" config --quiet
# Whisper downloads its model on first start, hence the long wait.
docker compose "${base[@]}" up -d --wait --wait-timeout 900

step 'Checking the Kaipa schema'
has_schema="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -Atc "select to_regclass('public.journeys') is not null" 2>/dev/null || true)"
if [[ "$has_schema" != 't' ]]; then
  if (( ALLOW_EMPTY_DB )); then
    echo 'WARN: public.journeys is missing; sidecars and functions will start but fail on queries.' >&2
  else
    die 'the database has no Kaipa schema (public.journeys missing). The data directory is not the migrated one'
  fi
fi

step 'Raising the Kong timeout for long agent runs'
"$ROOT/infra/supabase/patch-runtime-kong-timeout.sh"

step 'Deploying query sidecars and the topic guard'
"$ROOT/infra/supabase/deploy-rail-query.sh"
if [[ -n "$(read_env FLYAI_API_KEY)" ]]; then
  "$ROOT/infra/supabase/deploy-flyai-query.sh"
else
  echo 'FLYAI_API_KEY empty: skipping flyai-query (flight queries off).'
fi
# Also deploys app-agent and runs the guard's evaluation set against the model.
"$ROOT/infra/supabase/deploy-topic-guard.sh"

step 'Deploying all Edge Functions'
"$ROOT/infra/supabase/deploy-functions.sh"

step 'Deploying background workers'
"$ROOT/infra/supabase/deploy-agent-worker.sh"
"$ROOT/infra/supabase/deploy-storage-sweeper.sh"
"$ROOT/infra/supabase/deploy-media-scrubber.sh"

step 'Recording the compose file set'
# So `sh run.sh …` and plain `docker compose` in the runtime dir see the same
# services and port bindings the deploy scripts use.
compose_file='docker-compose.yml:production.compose.yml'
for overlay in rail-query flyai-query topic-guard agent-worker storage-sweeper media-scrubber; do
  if [[ -f "$RUNTIME_DIR/$overlay.compose.yml" ]]; then compose_file+=":$overlay.compose.yml"; fi
done
python3 - "$RUNTIME_DIR/.env" "$compose_file" <<'PY'
from pathlib import Path
import sys
p, value = Path(sys.argv[1]), sys.argv[2]
lines = p.read_text().splitlines()
out = [l for l in lines if not l.startswith('COMPOSE_FILE=')]
idx = next((i for i, l in enumerate(lines) if l.startswith('COMPOSE_FILE=')), len(out))
out.insert(min(idx, len(out)), f'COMPOSE_FILE={value}')
p.write_text('\n'.join(out) + '\n')
PY
(cd "$RUNTIME_DIR" && docker compose config --quiet)
echo "COMPOSE_FILE=$compose_file"

if (( WITH_WEB )); then
  step 'Publishing web guest app and admin (bound to 127.0.0.1)'
  KAIPA_FRONTEND_BIND=127.0.0.1 "$ROOT/infra/web/deploy.sh"
fi

step 'Smoke tests'
failures=0
port="$(read_env KONG_HTTP_PORT)"
anon="$(read_env ANON_KEY)"
public_url="$(read_env SUPABASE_PUBLIC_URL)"
probe() {
  local label="$1" url="$2" code
  code="$(curl -sS -o /dev/null -w '%{http_code}' -H "apikey: $anon" "$url" || true)"
  if [[ "$code" == 200 ]]; then echo "ok    $label"; else echo "FAIL  $label (HTTP $code)"; failures=$((failures + 1)); fi
}
probe 'auth health (local)' "http://127.0.0.1:$port/auth/v1/health"
probe 'rest (local)' "http://127.0.0.1:$port/rest/v1/"
probe 'storage (local)' "http://127.0.0.1:$port/storage/v1/version"
probe "auth health via $public_url" "${public_url%/}/auth/v1/health"
while read -r name status; do
  case "$status" in
    *unhealthy*|Exited*|Restarting*|Created*) echo "FAIL  container $name: $status"; failures=$((failures + 1)) ;;
  esac
done < <(docker ps -a --filter name=kaipa- --format '{{.Names}} {{.Status}}')
if command -v ss >/dev/null; then
  exposed="$(ss -Hltn | awk '{print $4}' | grep -E "^(0\.0\.0\.0|\[::\]|\*):($(read_env POSTGRES_PORT)|$(read_env POOLER_PROXY_PORT_TRANSACTION)|$port)$" || true)"
  if [[ -n "$exposed" ]]; then echo "FAIL  listening on all interfaces: $exposed"; failures=$((failures + 1)); fi
fi
if (( failures )); then
  echo "$failures check(s) failed. The public URL probe fails until the reverse proxy and DNS are live." >&2
  exit 1
fi
echo 'Kaipa backend is up.'
