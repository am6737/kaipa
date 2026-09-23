#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_RUNTIME="$ROOT/infra/supabase/docker"
RUNTIME_DIR="${KAIPA_SUPABASE_RUNTIME_DIR:-$DEFAULT_RUNTIME}"
SOURCE_DIR="${SUPABASE_DOCKER_SOURCE:-}"
PUBLIC_URL="${KAIPA_SUPABASE_PUBLIC_URL:-https://8010--main--am--am6737.coder.dootask.com}"
API_EXTERNAL_URL="${KAIPA_SUPABASE_API_EXTERNAL_URL:-http://localhost:8010}"
KONG_HTTP_PORT="${KAIPA_SUPABASE_KONG_HTTP_PORT:-8010}"
KONG_HTTPS_PORT="${KAIPA_SUPABASE_KONG_HTTPS_PORT:-8453}"
POSTGRES_PORT="${KAIPA_SUPABASE_POSTGRES_PORT:-5434}"
POOLER_PORT="${KAIPA_SUPABASE_POOLER_PORT:-6544}"
TEST_EMAIL="${KAIPA_TEST_EMAIL:-demo@kaipa.app}"
TEST_PASSWORD="${KAIPA_TEST_PASSWORD:-demo123456}"
TEST_USER_ID="${KAIPA_TEST_USER_ID:-9bc22e65-7352-4936-8f8a-68d02c88a403}"
UPDATE_APP_ENV=1
START_STACK=1
INIT_DB=1

usage() {
  cat <<EOF
Usage: infra/supabase/setup-kaipa-supabase.sh [options]

Creates an isolated self-hosted Supabase runtime for Kaipa.
Runtime data/secrets live in infra/supabase/docker/ and are gitignored.

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
import base64, hashlib, hmac, json, os, re, secrets, sys, time
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

# Sign in with Apple（iOS 原生 ID token 流程）。CLIENT_ID 是逗号分隔的 audience 白名单：
# com.hitosea.letsgo 对应正式包，com.hitosea.letsgo.dev 对应 EAS dev build（development
# profile 注入 APP_VARIANT=development，见 app.config.js），host.exp.Exponent 对应 Expo Go
# 调试。模板里残留的是 yibai 的 com.hitosea.moments100，必须改写，否则真机登录会因
# audience 不匹配被拒。
#
# 这里按「整行归一化」而不是替换某个固定旧值：--source 既可能是 yibai 模板
# （com.hitosea.moments100），也可能是一份已经生成的 kaipa runtime（旧版白名单，例如
# 少了 com.hitosea.letsgo.dev 的那版）。两种来源都要能收敛到当前值，否则脚本会在中途
# 退出，逼着人手改 runtime 里的 compose。
s=compose.read_text()
apple_audiences='com.hitosea.letsgo,com.hitosea.letsgo.dev,host.exp.Exponent'
s, replaced=re.subn(r'GOTRUE_EXTERNAL_APPLE_CLIENT_ID: "[^"]*"',
                    f'GOTRUE_EXTERNAL_APPLE_CLIENT_ID: "{apple_audiences}"', s)
if replaced != 1:
    raise SystemExit(f'Expected exactly one GOTRUE_EXTERNAL_APPLE_CLIENT_ID in docker-compose.yml, found {replaced}')
# Edge Function 侧的 Apple 撤销（注销换码用）默认值同样别指向 yibai。
s, replaced=re.subn(r'APPLE_CLIENT_ID: "\$\{APPLE_CLIENT_ID:-[^}]*\}"',
                    'APPLE_CLIENT_ID: "${APPLE_CLIENT_ID:-com.hitosea.letsgo}"', s)
if replaced > 1:
    raise SystemExit(f'Expected at most one APPLE_CLIENT_ID default in docker-compose.yml, found {replaced}')
# 校验 ID token 时 GoTrue 要在运行时拉取 Apple 的 OIDC discovery 与签名密钥；Docker 内嵌
# DNS 对外部域名解析偶发失败，显式指定宿主解析器。
if 'AUTH_DNS_SERVER' not in s:
    auth_marker='    container_name: kaipa-supabase-auth\n'
    if auth_marker not in s:
        raise SystemExit('Could not find the auth service in docker-compose.yml')
    s=s.replace(auth_marker, auth_marker+'    # Apple ID token 校验需要在运行时拉取 Apple 的 OIDC 与签名密钥。\n    dns:\n      - ${AUTH_DNS_SERVER:-192.168.100.200}\n', 1)
compose.write_text(s)

# Map, AI, and product-link preview credentials are server-only. Keep the values in
# the generated runtime .env and expose only these names to the Edge Runtime.
s=compose.read_text()
map_env='''      # map-search: server-side AMap Web Service credential
      AMAP_WEB_KEY: "${AMAP_WEB_KEY:-}"
'''
ai_env='''      # app-agent：服务端模型凭证与 OpenAI 兼容端点
      KAIPA_AI_API_KEY: "${KAIPA_AI_API_KEY:-}"
      KAIPA_AI_BASE_URL: "${KAIPA_AI_BASE_URL:-https://ai.dootask.com/v1}"
      KAIPA_AI_MODEL: "${KAIPA_AI_MODEL:-gpt-5.6-sol}"
      KAIPA_AI_FLASH_MODEL: "${KAIPA_AI_FLASH_MODEL:-gpt-5.6-luna}"
      KAIPA_AI_USE_RESPONSES: "${KAIPA_AI_USE_RESPONSES:-}"
      TAVILY_API_KEY: "${TAVILY_API_KEY:-}"
      TAVILY_API_KEYS: "${TAVILY_API_KEYS:-}"
      TRAVEL_SEARCH_SOURCES: "${TRAVEL_SEARCH_SOURCES:-tavily}"
      TRAVEL_SEARCH_TIMEOUT_MS: "${TRAVEL_SEARCH_TIMEOUT_MS:-8000}"
      TRAVEL_SEARCH_MAX_RESULTS: "${TRAVEL_SEARCH_MAX_RESULTS:-10}"
      TRAVEL_SEARCH_CACHE_TTL_SECONDS: "${TRAVEL_SEARCH_CACHE_TTL_SECONDS:-900}"
      TRAVEL_KNOWLEDGE_CACHE_TTL_SECONDS: "${TRAVEL_KNOWLEDGE_CACHE_TTL_SECONDS:-15552000}"
      RAIL_CACHE_TTL_SECONDS: "${RAIL_CACHE_TTL_SECONDS:-86400}"
      FLIGHT_CACHE_TTL_SECONDS: "${FLIGHT_CACHE_TTL_SECONDS:-300}"
      MEDIACRAWLER_SEARCH_URL: "${MEDIACRAWLER_SEARCH_URL:-}"
      MEDIACRAWLER_API_KEY: "${MEDIACRAWLER_API_KEY:-}"
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
transport_env='''      # Production-only flight offers; never expose these to the App
      AMADEUS_CLIENT_ID: "${AMADEUS_CLIENT_ID:-}"
      AMADEUS_CLIENT_SECRET: "${AMADEUS_CLIENT_SECRET:-}"
      AMADEUS_ENVIRONMENT: "${AMADEUS_ENVIRONMENT:-}"
'''
if 'AMAP_WEB_KEY:' not in s or 'KAIPA_AI_API_KEY:' not in s or 'TAVILY_API_KEY:' not in s or 'TAVILY_API_KEYS:' not in s or 'MEDIACRAWLER_SEARCH_URL:' not in s or 'TAOBAO_APP_KEY:' not in s or 'AMADEUS_CLIENT_ID:' not in s:
    marker='      VERIFY_JWT: "${FUNCTIONS_VERIFY_JWT}"\n'
    if marker not in s:
        raise SystemExit('Could not find Edge Functions environment marker in docker-compose.yml')
    missing=''
    if 'AMAP_WEB_KEY:' not in s:
        missing+=map_env
    if 'KAIPA_AI_API_KEY:' not in s:
        missing+=ai_env
    else:
        if 'TAVILY_API_KEY:' not in s:
            missing+='      TAVILY_API_KEY: "${TAVILY_API_KEY:-}"\n'
        if 'TAVILY_API_KEYS:' not in s:
            missing+='      TAVILY_API_KEYS: "${TAVILY_API_KEYS:-}"\n'
        if 'MEDIACRAWLER_SEARCH_URL:' not in s:
            missing+='''      TRAVEL_SEARCH_SOURCES: "${TRAVEL_SEARCH_SOURCES:-tavily}"
      TRAVEL_SEARCH_TIMEOUT_MS: "${TRAVEL_SEARCH_TIMEOUT_MS:-8000}"
      TRAVEL_SEARCH_MAX_RESULTS: "${TRAVEL_SEARCH_MAX_RESULTS:-10}"
      MEDIACRAWLER_SEARCH_URL: "${MEDIACRAWLER_SEARCH_URL:-}"
      MEDIACRAWLER_API_KEY: "${MEDIACRAWLER_API_KEY:-}"
'''
    if 'TAOBAO_APP_KEY:' not in s:
        missing+=gear_env
    if 'AMADEUS_CLIENT_ID:' not in s:
        missing+=transport_env
    s=s.replace(marker, marker+missing, 1)
s='\n'.join(line for line in s.splitlines() if 'SMART_PLAN_PROVIDERS:' not in line and 'SMART_PLAN_DEFAULT_PROVIDER:' not in line)+'\n'
compose.write_text(s)

# Agent turns may include multiple external searches before the final model
# response, so the stock one-minute self-hosted worker limit is too short.
router=runtime/'volumes/functions/main/index.ts'
if router.exists():
    router_source=router.read_text()
    router_source=router_source.replace('const workerTimeoutMs = 1 * 60 * 1000', 'const workerTimeoutMs = 5 * 60 * 1000')
    router_source=router_source.replace('const workerTimeoutMs = 3 * 60 * 1000', 'const workerTimeoutMs = 5 * 60 * 1000')
    router.write_text(router_source)

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
existing_env={}
for line in env.read_text().splitlines():
    if line and not line.lstrip().startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        existing_env[key] = value

def configured(name: str, fallback: str = '') -> str:
    return os.environ.get(name, existing_env.get(name, fallback))

agent_env={
 'AMAP_WEB_KEY': configured('AMAP_WEB_KEY'),
 'KAIPA_AI_API_KEY': configured('KAIPA_AI_API_KEY'),
 'KAIPA_AI_BASE_URL': configured('KAIPA_AI_BASE_URL', 'https://ai.dootask.com/v1'),
 'KAIPA_AI_MODEL': configured('KAIPA_AI_MODEL', 'gpt-5.6-sol'),
 'KAIPA_AI_FLASH_MODEL': configured('KAIPA_AI_FLASH_MODEL', 'gpt-5.6-luna'),
 'KAIPA_AI_USE_RESPONSES': configured('KAIPA_AI_USE_RESPONSES'),
 'TAVILY_API_KEY': configured('TAVILY_API_KEY'),
 'TAVILY_API_KEYS': configured('TAVILY_API_KEYS'),
 'TRAVEL_SEARCH_SOURCES': configured('TRAVEL_SEARCH_SOURCES', 'tavily'),
 'TRAVEL_SEARCH_TIMEOUT_MS': configured('TRAVEL_SEARCH_TIMEOUT_MS', '8000'),
 'TRAVEL_SEARCH_MAX_RESULTS': configured('TRAVEL_SEARCH_MAX_RESULTS', '10'),
 'TRAVEL_SEARCH_CACHE_TTL_SECONDS': configured('TRAVEL_SEARCH_CACHE_TTL_SECONDS', '900'),
 'TRAVEL_KNOWLEDGE_CACHE_TTL_SECONDS': configured('TRAVEL_KNOWLEDGE_CACHE_TTL_SECONDS', '15552000'),
 'RAIL_CACHE_TTL_SECONDS': configured('RAIL_CACHE_TTL_SECONDS', '86400'),
 'FLIGHT_CACHE_TTL_SECONDS': configured('FLIGHT_CACHE_TTL_SECONDS', '300'),
 'MEDIACRAWLER_SEARCH_URL': configured('MEDIACRAWLER_SEARCH_URL'),
 'MEDIACRAWLER_API_KEY': configured('MEDIACRAWLER_API_KEY'),
 'AMADEUS_CLIENT_ID': configured('AMADEUS_CLIENT_ID'),
 'AMADEUS_CLIENT_SECRET': configured('AMADEUS_CLIENT_SECRET'),
 'AMADEUS_ENVIRONMENT': configured('AMADEUS_ENVIRONMENT'),
}
out=[]; seen=set()
for line in env.read_text().splitlines():
    if line and not line.lstrip().startswith('#') and '=' in line:
        k=line.split('=',1)[0]
        seen.add(k)
        if k in updates:
            out.append(f'{k}={updates[k]}')
            continue
        if k in agent_env:
            out.append(f'{k}={agent_env[k]}')
            continue
    out.append(line)
for k,v in agent_env.items():
    if k not in seen: out.append(f'{k}={v}')
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
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/kaipa-storage.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/journey-timeline-groups.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/timeline-route-segments.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/journey-participant-permissions.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/journey-packing-lists.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/gear-photo-uris.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/gear-packing-migration.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/gear-categories-per-user.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/gear-category-delete-to-uncategorized.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/account-deletion.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/journey-agent-thread-cascade.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/journey-invites.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/qr-login.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260904170000_journey_complete_versions.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260906120000_journey_version_retention.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260906130000_group_agent_journey_versions.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260907130000_agent_background_jobs.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260907150000_agent_clarification_receipts.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260907180000_agent_context_revisions.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260907181000_agent_atomic_writes.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260907190000_agent_schedule_edits.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260908040000_agent_task_harness.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260908120000_agent_packing_drafts.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260908130000_fix_agent_track_summary.sql"
  # Drops the broad routes_insert/routes_update policies schema.sql creates and
  # replaces them with owner-scoped ones. Without it a fresh install lets any
  # authenticated user write to the route catalog.
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260915120000_restrict_route_catalog_writes.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260916120000_tracks_library.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260917140000_import_hiking_routes.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260918120000_journey_passphrase.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260918130000_notifications_realtime.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260918140000_real_notifications.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260918150000_journey_realtime.sql"
  # Applied in timestamp order, one file at a time: several of these narrow a
  # constraint or replace a function the previous one created, so the order is
  # part of the migration rather than an accident of listing. The seed of
  # unverified route-fact drafts (20260922193000) is deliberately not here — a
  # fresh install should not open with a review queue.
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260919000000_agent_staged_pipeline.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260919100000_leave_journey.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260919150000_agent_failure_idempotency.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260919170000_agent_external_cache.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260920100000_admin_roles.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260920110000_bootstrap_service_owner.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260920120000_content_moderation.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260920140000_agent_retry_once.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260920141000_agent_transport_stage.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260921120000_timeline_transport_items.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260921130000_admin_route_track_fields.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260921150000_agent_degraded_plan_stage.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260921160000_timeline_group_route.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260922120000_agent_observability.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260922180000_route_facts.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260922200000_route_access_transport_cost_fields.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260922210000_route_fact_review_clock.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260922210000_timeline_row_location.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260922220000_route_fact_revisions.sql"
  docker exec -i kaipa-supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/supabase/migrations/20260922230000_agent_route_fact_stats.sql"
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
  KAIPA_SUPABASE_RUNTIME_DIR="$RUNTIME_DIR" bash "$ROOT/infra/supabase/deploy-agent-worker.sh"
fi

# The runtime is generated with Kong's stock 150s functions timeout; the staged
# pipeline needs the raised ceiling, so re-apply the idempotent patch whenever
# setup regenerates the runtime.
if [[ -x "$ROOT/infra/supabase/patch-runtime-kong-timeout.sh" ]]; then
  KAIPA_SUPABASE_RUNTIME_DIR="$RUNTIME_DIR" bash "$ROOT/infra/supabase/patch-runtime-kong-timeout.sh"
fi

echo "Kaipa Supabase runtime created: $RUNTIME_DIR"
echo "Public URL: $PUBLIC_URL"
echo "Client env: $RUNTIME_DIR/kaipa-client.env"
