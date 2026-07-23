#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_RUNTIME="$(cd "$ROOT/.." && pwd)/kaipa-supabase-docker"
RUNTIME_DIR="${KAIPA_SUPABASE_RUNTIME_DIR:-$DEFAULT_RUNTIME}"
SOURCE_DIR="${SUPABASE_DOCKER_SOURCE:-}"
PUBLIC_URL="${KAIPA_SUPABASE_PUBLIC_URL:-https://8010--main--am--am6737.coder.dootask.com}"
API_EXTERNAL_URL="${KAIPA_SUPABASE_API_EXTERNAL_URL:-http://localhost:8010}"
KONG_HTTP_PORT="${KAIPA_SUPABASE_KONG_HTTP_PORT:-8010}"
KONG_HTTPS_PORT="${KAIPA_SUPABASE_KONG_HTTPS_PORT:-8453}"
POSTGRES_PORT="${KAIPA_SUPABASE_POSTGRES_PORT:-5434}"
POOLER_PORT="${KAIPA_SUPABASE_POOLER_PORT:-6544}"
TEST_EMAIL="${KAIPA_TEST_EMAIL:-test@kaipa.app}"
TEST_PASSWORD="${KAIPA_TEST_PASSWORD:-kaipa123}"
TEST_USER_ID="${KAIPA_TEST_USER_ID:-9bc22e65-7352-4936-8f8a-68d02c88a403}"
UPDATE_APP_ENV=1
START_STACK=1
INIT_DB=1

usage() {
  cat <<EOF
Usage: infra/supabase/setup-kaipa-supabase.sh [options]

Creates an isolated self-hosted Supabase runtime for Kaipa.
Runtime data/secrets are generated outside the app repo by default.

Options:
  --runtime DIR        Runtime Supabase directory. Default: $DEFAULT_RUNTIME
  --source DIR         Existing self-hosted Supabase docker directory to copy.
                       If omitted, tries ../yibai/supabase-docker, then ../supabase-docker.
  --public-url URL     Public URL written into Kaipa .env. Default: $PUBLIC_URL
  --api-url URL        Internal API_EXTERNAL_URL for Gotrue. Default: $API_EXTERNAL_URL
  --http-port PORT     Kong HTTP host port. Default: $KONG_HTTP_PORT
  --https-port PORT    Kong HTTPS host port. Default: $KONG_HTTPS_PORT
  --db-port PORT       Supavisor/Postgres host port. Default: $POSTGRES_PORT
  --pooler-port PORT   Supavisor transaction port. Default: $POOLER_PORT
  --no-start           Generate runtime only; do not docker compose up.
  --no-init            Do not apply schema/seed/test user.
  --no-env             Do not update app .env.
  -h, --help           Show this help.

Environment variables mirror the options, e.g. KAIPA_SUPABASE_PUBLIC_URL.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --runtime) RUNTIME_DIR="$2"; shift 2 ;;
    --source) SOURCE_DIR="$2"; shift 2 ;;
    --public-url) PUBLIC_URL="$2"; shift 2 ;;
    --api-url) API_EXTERNAL_URL="$2"; shift 2 ;;
    --http-port) KONG_HTTP_PORT="$2"; shift 2 ;;
    --https-port) KONG_HTTPS_PORT="$2"; shift 2 ;;
    --db-port) POSTGRES_PORT="$2"; shift 2 ;;
    --pooler-port) POOLER_PORT="$2"; shift 2 ;;
    --no-start) START_STACK=0; shift ;;
    --no-init) INIT_DB=0; shift ;;
    --no-env) UPDATE_APP_ENV=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "$SOURCE_DIR" ]]; then
  for candidate in \
    "$(cd "$ROOT/.." && pwd)/yibai/supabase-docker" \
    "$(cd "$ROOT/.." && pwd)/supabase-docker"; do
    if [[ -f "$candidate/docker-compose.yml" && -f "$candidate/.env" ]]; then
      SOURCE_DIR="$candidate"
      break
    fi
  done
fi

if [[ -z "$SOURCE_DIR" || ! -f "$SOURCE_DIR/docker-compose.yml" || ! -f "$SOURCE_DIR/.env" ]]; then
  cat >&2 <<EOF
Could not find a source self-hosted Supabase docker directory.

Provide one with:
  SUPABASE_DOCKER_SOURCE=/path/to/supabase-docker infra/supabase/setup-kaipa-supabase.sh

It must contain docker-compose.yml, .env, and volumes/api + volumes/db bootstrap files.
EOF
  exit 1
fi

if [[ -e "$RUNTIME_DIR" ]]; then
  echo "Runtime already exists: $RUNTIME_DIR" >&2
  echo "Refusing to overwrite it. Move it away or set --runtime to a new path." >&2
  exit 3
fi

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing command: $1" >&2; exit 1; }; }
need docker
need python3
need rsync

mkdir -p "$RUNTIME_DIR"
rsync -a \
  --exclude 'volumes/db/data/***' \
  --exclude 'volumes/storage/***' \
  --exclude 'volumes/snippets/*' \
  --exclude '.git/***' \
  "$SOURCE_DIR/" "$RUNTIME_DIR/"
mkdir -p "$RUNTIME_DIR/volumes/db/data" "$RUNTIME_DIR/volumes/storage" "$RUNTIME_DIR/volumes/snippets"
touch "$RUNTIME_DIR/volumes/snippets/.gitkeep"

# Kaipa owns its Edge Functions. The main router is required by this compose template.
rm -rf "$RUNTIME_DIR/volumes/functions"
mkdir -p "$RUNTIME_DIR/volumes/functions"
if [[ -d "$ROOT/supabase/functions" ]]; then
  cp -a "$ROOT/supabase/functions/." "$RUNTIME_DIR/volumes/functions/"
fi
if [[ -f "$SOURCE_DIR/volumes/functions/main/index.ts" && ! -f "$RUNTIME_DIR/volumes/functions/main/index.ts" ]]; then
  mkdir -p "$RUNTIME_DIR/volumes/functions/main"
  cp "$SOURCE_DIR/volumes/functions/main/index.ts" "$RUNTIME_DIR/volumes/functions/main/index.ts"
fi

python3 - "$RUNTIME_DIR" "$PUBLIC_URL" "$API_EXTERNAL_URL" "$KONG_HTTP_PORT" "$KONG_HTTPS_PORT" "$POSTGRES_PORT" "$POOLER_PORT" <<'PY'
from pathlib import Path
import base64, hashlib, hmac, json, secrets, sys, time
runtime=Path(sys.argv[1])
public_url, api_url, kong_http, kong_https, pg_port, pooler_port = sys.argv[2:8]
compose=runtime/'docker-compose.yml'
s=compose.read_text()
s=s.replace('name: supabase', 'name: supabase-kaipa', 1)
repls={
 'container_name: supabase-studio':'container_name: kaipa-supabase-studio',
 'container_name: supabase-kong':'container_name: kaipa-supabase-kong',
 'container_name: supabase-auth':'container_name: kaipa-supabase-auth',
 'container_name: supabase-rest':'container_name: kaipa-supabase-rest',
 'container_name: realtime-dev.supabase-realtime':'container_name: kaipa-realtime-dev.supabase-realtime',
 'container_name: supabase-storage':'container_name: kaipa-supabase-storage',
 'container_name: supabase-imgproxy':'container_name: kaipa-supabase-imgproxy',
 'container_name: supabase-meta':'container_name: kaipa-supabase-meta',
 'container_name: supabase-edge-functions':'container_name: kaipa-supabase-edge-functions',
 'container_name: whisper-asr':'container_name: kaipa-whisper-asr',
 'container_name: supabase-db':'container_name: kaipa-supabase-db',
 'container_name: supabase-pooler':'container_name: kaipa-supabase-pooler',
}
for a,b in repls.items(): s=s.replace(a,b)
compose.write_text(s)

# AI and product-link preview credentials are server-only. Keep the values in
# the generated runtime .env and expose only these names to the Edge Runtime.
s=compose.read_text()
ai_env='''      # smart-plan：统一大模型服务端凭证
      KAIPA_AI_API_KEY: "${KAIPA_AI_API_KEY:-}"
'''
gear_env='''      # gear-link-preview：淘宝/天猫、京东开放平台服务端凭证
      TAOBAO_APP_KEY: "${TAOBAO_APP_KEY:-}"
      TAOBAO_APP_SECRET: "${TAOBAO_APP_SECRET:-}"
      TAOBAO_ADZONE_ID: "${TAOBAO_ADZONE_ID:-}"
      TAOBAO_SESSION: "${TAOBAO_SESSION:-}"
      TAOBAO_API_METHOD: "${TAOBAO_API_METHOD:-}"
      TAOBAO_MATERIAL_SEARCH_METHOD: "${TAOBAO_MATERIAL_SEARCH_METHOD:-}"
      TAOBAO_MATERIAL_ID: "${TAOBAO_MATERIAL_ID:-}"
      TAOBAO_BIZ_SCENE_ID: "${TAOBAO_BIZ_SCENE_ID:-}"
      JD_APP_KEY: "${JD_APP_KEY:-}"
      JD_APP_SECRET: "${JD_APP_SECRET:-}"
      JD_ACCESS_TOKEN: "${JD_ACCESS_TOKEN:-}"
      JD_API_METHOD: "${JD_API_METHOD:-}"
      GEAR_LINK_ALLOWED_HOSTS: "${GEAR_LINK_ALLOWED_HOSTS:-}"
'''
if 'KAIPA_AI_API_KEY:' not in s or 'TAOBAO_APP_KEY:' not in s:
    marker='      SMART_PLAN_DEFAULT_PROVIDER: "${SMART_PLAN_DEFAULT_PROVIDER:-}"\n'
    if marker not in s:
        raise SystemExit('Could not find Edge Functions environment marker in docker-compose.yml')
    missing=''
    if 'KAIPA_AI_API_KEY:' not in s:
        missing+=ai_env
    if 'TAOBAO_APP_KEY:' not in s:
        missing+=gear_env
    s=s.replace(marker, marker+missing, 1)
    compose.write_text(s)

def b64url(data: bytes): return base64.urlsafe_b64encode(data).rstrip(b'=').decode()
def jwt(role: str, secret: str):
    header={'alg':'HS256','typ':'JWT'}
    payload={'role':role,'iss':'supabase','iat':int(time.time()),'exp':4102444800}
    signing=f"{b64url(json.dumps(header,separators=(',',':')).encode())}.{b64url(json.dumps(payload,separators=(',',':')).encode())}"
    sig=hmac.new(secret.encode(), signing.encode(), hashlib.sha256).digest()
    return signing+'.'+b64url(sig)
jwt_secret=secrets.token_hex(32)
updates={
 'JWT_SECRET': jwt_secret,
 'ANON_KEY': jwt('anon', jwt_secret),
 'SERVICE_ROLE_KEY': jwt('service_role', jwt_secret),
 'SUPABASE_PUBLIC_URL': public_url,
 'API_EXTERNAL_URL': api_url,
 'POSTGRES_PORT': pg_port,
 'POOLER_PROXY_PORT_TRANSACTION': pooler_port,
 'POOLER_TENANT_ID': secrets.token_hex(8),
 'STUDIO_DEFAULT_ORGANIZATION': 'Kaipa',
 'STUDIO_DEFAULT_PROJECT': 'Kaipa',
 'KONG_HTTP_PORT': kong_http,
 'KONG_HTTPS_PORT': kong_https,
 'SECRET_KEY_BASE': secrets.token_urlsafe(48),
 'VAULT_ENC_KEY': secrets.token_hex(16),
}
env=runtime/'.env'
out=[]
for line in env.read_text().splitlines():
    if line and not line.lstrip().startswith('#') and '=' in line:
        k=line.split('=',1)[0]
        if k in updates:
            out.append(f'{k}={updates[k]}')
            continue
    out.append(line)
env.write_text('\n'.join(out)+'\n')
(runtime/'kaipa-client.env').write_text(
    f"EXPO_PUBLIC_SUPABASE_URL={public_url}\nEXPO_PUBLIC_SUPABASE_ANON_KEY={updates['ANON_KEY']}\n"
)
PY

if [[ "$UPDATE_APP_ENV" == 1 ]]; then
  python3 - "$ROOT/.env" "$RUNTIME_DIR/kaipa-client.env" <<'PY'
from pathlib import Path
import sys
app=Path(sys.argv[1]); client=Path(sys.argv[2])
vals=dict(line.split('=',1) for line in client.read_text().splitlines() if '=' in line)
lines=app.read_text().splitlines() if app.exists() else []
out=[]; seen=set()
for line in lines:
    if line and not line.lstrip().startswith('#') and '=' in line:
        k=line.split('=',1)[0]
        if k in vals:
            out.append(f'{k}={vals[k]}'); seen.add(k); continue
    out.append(line)
for k,v in vals.items():
    if k not in seen: out.append(f'{k}={v}')
app.write_text('\n'.join(out)+'\n')
PY
fi

if [[ "$START_STACK" == 1 ]]; then
  (cd "$RUNTIME_DIR" && docker compose up -d)
fi

if [[ "$INIT_DB" == 1 ]]; then
  for i in $(seq 1 60); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' kaipa-supabase-db 2>/dev/null || true)"
    [[ "$status" == "healthy" ]] && break
    sleep 2
  done
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/schema.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/guest-schema.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/gear-photo-uris.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/gear-packing-migration.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/gear-categories-per-user.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/gear-category-delete-to-uncategorized.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, email_change_token_current,
  recovery_token, reauthentication_token, phone, phone_change, phone_change_token,
  raw_app_meta_data, raw_user_meta_data, is_sso_user
) values (
  '00000000-0000-0000-0000-000000000000',
  '$TEST_USER_ID', 'authenticated', 'authenticated', '$TEST_EMAIL',
  crypt('$TEST_PASSWORD', gen_salt('bf')),
  now(), now(), now(), '', '', '', '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', false
)
on conflict (id) do update set email = excluded.email, encrypted_password = excluded.encrypted_password, email_confirmed_at = excluded.email_confirmed_at, updated_at = now();

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
values ('$TEST_USER_ID', '$TEST_USER_ID', jsonb_build_object('sub', '$TEST_USER_ID', 'email', '$TEST_EMAIL'), 'email', '$TEST_USER_ID', now(), now(), now())
on conflict (provider, provider_id) do update set user_id = excluded.user_id, identity_data = excluded.identity_data, updated_at = now();

insert into public.profiles (id, display_name, avatar_ini)
values ('$TEST_USER_ID', split_part('$TEST_EMAIL', '@', 1), '')
on conflict (id) do nothing;
SQL
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/seed.sql"
fi

echo "Kaipa Supabase runtime created: $RUNTIME_DIR"
echo "Public URL: $PUBLIC_URL"
echo "Client env: $RUNTIME_DIR/kaipa-client.env"
