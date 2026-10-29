#!/usr/bin/env bash
# Check the self-hosted runtime .env (and the App/client env files that must
# agree with it) before deploying Kaipa to a dedicated server.
#
# Prints variable names and problems only, never values. Exits 1 when any
# ERROR is found; WARN lines are features that will be off or degraded.
#
#   infra/server/check-env.sh            # checks infra/supabase/docker/.env
#   KAIPA_SUPABASE_RUNTIME_DIR=/srv/kaipa-runtime infra/server/check-env.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${KAIPA_SUPABASE_RUNTIME_DIR:-$ROOT/infra/supabase/docker}"

exec python3 - "$ROOT" "$RUNTIME_DIR" <<'PY'
import base64, hashlib, hmac, ipaddress, json, os, stat, sys, time
from pathlib import Path
from urllib.parse import urlparse

root, runtime = Path(sys.argv[1]), Path(sys.argv[2])
errors, warns = [], []
def err(msg): errors.append(msg)
def warn(msg): warns.append(msg)

def parse(path):
    values, dupes = {}, []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        if key in values:
            dupes.append(key)
        values[key] = value.strip().strip('"').strip("'")
    return values, dupes

env_path = runtime / '.env'
if not env_path.is_file():
    print(f'ERROR runtime .env not found: {env_path}')
    sys.exit(1)
env, dupes = parse(env_path)
example = parse(runtime / '.env.example')[0] if (runtime / '.env.example').is_file() else {}
get = lambda k: env.get(k, '')
truthy = lambda k: get(k).lower() == 'true'

for key in sorted(set(dupes)):
    err(f'{key} is defined more than once; Compose uses the last line, which silently overrides the first')

if stat.S_IMODE(env_path.stat().st_mode) & 0o077:
    warn('.env is readable by group/others; run chmod 600 on it')

# ---- Core secrets: carried over from the old server, never regenerated. ----
min_len = {
    'POSTGRES_PASSWORD': 16, 'JWT_SECRET': 32, 'SECRET_KEY_BASE': 64,
    'VAULT_ENC_KEY': 32, 'PG_META_CRYPTO_KEY': 32, 'DASHBOARD_PASSWORD': 16,
    # Storage serves the S3 protocol at /storage/v1/s3 through Kong; these keys
    # grant full bucket access, so the published example pair is an open door.
    'S3_PROTOCOL_ACCESS_KEY_ID': 16, 'S3_PROTOCOL_ACCESS_KEY_SECRET': 32,
    'POOLER_TENANT_ID': 8,
}
compose_text = (runtime / 'docker-compose.yml').read_text() if (runtime / 'docker-compose.yml').is_file() else ''
if '\n  analytics:' in compose_text:
    min_len.update({'LOGFLARE_PUBLIC_ACCESS_TOKEN': 16, 'LOGFLARE_PRIVATE_ACCESS_TOKEN': 16})
for key, n in min_len.items():
    value = get(key)
    if not value:
        err(f'{key} is empty')
    elif example.get(key) and value == example[key]:
        err(f'{key} still has the .env.example default')
    elif len(value) < n:
        err(f'{key} is shorter than {n} characters')

def b64d(part):
    return base64.urlsafe_b64decode(part + '=' * (-len(part) % 4))
def check_jwt(key, role):
    token, secret = get(key), get('JWT_SECRET')
    if not token:
        err(f'{key} is empty'); return
    try:
        head, body, sig = token.split('.')
        expected = hmac.new(secret.encode(), f'{head}.{body}'.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, b64d(sig)):
            err(f'{key} is not signed by JWT_SECRET (keys and secret must move together)'); return
        claims = json.loads(b64d(body))
        if claims.get('role') != role:
            err(f'{key} has role {claims.get("role")!r}, expected {role!r}')
        if claims.get('exp') and claims['exp'] < time.time() + 365 * 86400:
            warn(f'{key} expires within a year')
    except Exception:
        err(f'{key} is not a valid HS256 JWT')
check_jwt('ANON_KEY', 'anon')
check_jwt('SERVICE_ROLE_KEY', 'service_role')

if get('DASHBOARD_USERNAME') in ('', 'supabase'):
    warn('DASHBOARD_USERNAME is the default "supabase"; Studio is reachable through Kong with basic auth')

# ---- Public URLs: nothing may point at localhost or the coder workspace. ----
def url_problem(value, require_https=True):
    if not value:
        return 'is empty'
    u = urlparse(value)
    host = (u.hostname or '').lower()
    if host in ('localhost', '') or host.endswith('.localhost'):
        return 'points at localhost'
    if 'coder.dootask.com' in host:
        return 'still points at the coder workspace'
    try:
        if ipaddress.ip_address(host).is_private or ipaddress.ip_address(host).is_loopback:
            return 'points at a private IP'
    except ValueError:
        pass
    if require_https and u.scheme != 'https':
        return 'is not https'
    return None

public_url = get('SUPABASE_PUBLIC_URL').rstrip('/')
for key in ('SUPABASE_PUBLIC_URL', 'API_EXTERNAL_URL', 'SITE_URL'):
    problem = url_problem(get(key))
    if problem:
        err(f'{key} {problem}')
if get('API_EXTERNAL_URL').rstrip('/') != public_url:
    err('API_EXTERNAL_URL must equal SUPABASE_PUBLIC_URL (Apple callback and email links are built from it)')
for item in filter(None, (s.strip() for s in get('ADDITIONAL_REDIRECT_URLS').split(','))):
    if 'localhost' in item or 'coder.dootask.com' in item:
        warn('ADDITIONAL_REDIRECT_URLS still contains a localhost/coder entry')
        break

# GoTrue's resolver defaults to an address that only exists in the coder network.
if not get('AUTH_DNS_SERVER'):
    err('AUTH_DNS_SERVER is unset; the compose default 192.168.100.200 only exists on the old host '
        '(Apple sign-in fetches Apple keys through it). Set the new host resolver or a public one')

for key in ('KONG_HTTP_PORT', 'POSTGRES_PORT', 'POOLER_PROXY_PORT_TRANSACTION'):
    if not get(key).isdigit():
        err(f'{key} must be a port number')

# ---- Auth providers the App actually uses. ----
# Email: sign-up, password recovery, and email change all send mail.
if truthy('ENABLE_EMAIL_SIGNUP') and not truthy('ENABLE_EMAIL_AUTOCONFIRM'):
    if get('SMTP_HOST') in ('', 'supabase-mail'):
        err('SMTP_HOST is unset or the nonexistent "supabase-mail"; email sign-up and password reset cannot send mail')
    for key in ('SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_ADMIN_EMAIL'):
        if not get(key):
            err(f'{key} is empty (needed for email sign-up / recovery)')
    if get('SMTP_ADMIN_EMAIL').endswith('@example.com'):
        err('SMTP_ADMIN_EMAIL is still the example address')
if truthy('ENABLE_EMAIL_AUTOCONFIRM'):
    warn('ENABLE_EMAIL_AUTOCONFIRM=true: anyone can sign up with an unverified address')

# Phone: OTP goes through the sms-gateway Edge Function as a GoTrue hook.
if truthy('ENABLE_PHONE_SIGNUP'):
    if not truthy('SMS_HOOK_ENABLED'):
        err('ENABLE_PHONE_SIGNUP=true but SMS_HOOK_ENABLED is not true; no provider would send the code')
    if not get('SMS_HOOK_URI').startswith(('https://', 'http://localhost', 'http://127.0.0.1')):
        err('SMS_HOOK_URI must be https (GoTrue refuses plain http to non-localhost and the auth container exits)')
    for key in ('SMS_HOOK_SECRETS', 'SMS_GATEWAY_SECRET', 'SMS_HASH_SECRET', 'SMS_PROVIDER_ORDER'):
        if not get(key):
            err(f'{key} is empty (needed for phone sign-in)')
    if 'SMS_HASH_SECRET' not in compose_text:
        err('docker-compose.yml does not pass SMS_HASH_SECRET to the functions container; sms-gateway throws on every send')
    if truthy('ENABLE_PHONE_AUTOCONFIRM'):
        err('ENABLE_PHONE_AUTOCONFIRM must be false in production')
else:
    warn('ENABLE_PHONE_SIGNUP is false: phone OTP sign-in is off')

# ---- Feature credentials: missing ones turn a feature off. ----
features = [
    (('KAIPA_AI_API_KEY', 'OPENROUTER_API_KEY'), 'app-agent / smart planning and topic-guard', True),
    (('AMAP_WEB_KEY',), 'map-search (POI search, directions)', False),
    (('DOOPUSH_APP_ID',), 'push notifications (send-push-notifications no-ops)', False),
    (('DOOPUSH_API_KEY',), 'push notifications (send-push-notifications no-ops)', False),
    (('FLYAI_API_KEY',), 'flight queries (flyai-query sidecar is skipped)', False),
    (('TAOBAO_APP_KEY', 'JD_APP_KEY'), 'gear link previews for Taobao/JD', False),
]
for keys, feature, required in features:
    if not any(get(k) for k in keys):
        (err if required else warn)(f'{" / ".join(keys)} empty: {feature}')
sources = [s.strip() for s in (get('TRAVEL_SEARCH_SOURCES') or 'tavily').split(',') if s.strip()]
if 'tavily' in sources and not (get('TAVILY_API_KEYS') or get('TAVILY_API_KEY')):
    warn('TRAVEL_SEARCH_SOURCES uses tavily but TAVILY_API_KEYS is empty')
if {'xhs', 'douyin'} & set(sources):
    crawler = get('MEDIACRAWLER_SEARCH_URL')
    if not crawler:
        warn('TRAVEL_SEARCH_SOURCES uses xhs/douyin but MEDIACRAWLER_SEARCH_URL is empty')
    else:
        host = urlparse(crawler).hostname or ''
        if host.startswith('172.') or host in ('localhost', '127.0.0.1'):
            warn('MEDIACRAWLER_SEARCH_URL points at a host-local gateway; the crawler runs outside Docker '
                 'and does not move with this deploy. Run it on the new host or point at a reachable one')
        if not get('MEDIACRAWLER_API_KEY'):
            warn('MEDIACRAWLER_API_KEY is empty')

# ---- Client env files must match the runtime. ----
def check_client(path, label, required):
    if not path.is_file():
        (err if required else warn)(f'{label} not found ({path})'); return
    client = parse(path)[0]
    if client.get('EXPO_PUBLIC_SUPABASE_URL', '').rstrip('/') != public_url:
        err(f'{label}: EXPO_PUBLIC_SUPABASE_URL must equal SUPABASE_PUBLIC_URL')
    if client.get('EXPO_PUBLIC_SUPABASE_ANON_KEY', '') != get('ANON_KEY'):
        err(f'{label}: EXPO_PUBLIC_SUPABASE_ANON_KEY must equal ANON_KEY')
    if 'EXPO_PUBLIC_WEB_URL' in client and url_problem(client['EXPO_PUBLIC_WEB_URL']):
        warn(f'{label}: EXPO_PUBLIC_WEB_URL {url_problem(client["EXPO_PUBLIC_WEB_URL"])}')
check_client(runtime / 'kaipa-client.env', 'kaipa-client.env', True)
# The deploy scripts refuse to run unless the checkout's .env agrees with the runtime.
check_client(root / '.env', 'repo .env', True)

for line in errors:
    print(f'ERROR {line}')
for line in warns:
    print(f'WARN  {line}')
print(f'{len(errors)} error(s), {len(warns)} warning(s) in {env_path}')
sys.exit(1 if errors else 0)
PY
