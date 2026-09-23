#!/usr/bin/env bash
set -euo pipefail

MEDIA_CRAWLER_DIR="${MEDIA_CRAWLER_DIR:-$HOME/workspaces/MediaCrawler}"
SUPABASE_ENV="${KAIPA_SUPABASE_ENV:-$HOME/workspaces/kaipa/infra/supabase/docker/.env}"
STATE_DIR="${KAIPA_GATEWAY_STATE_DIR:-$HOME/.local/state/kaipa-gateway}"
UV_BIN="${UV_BIN:-$HOME/.local/bin/uv}"
PID_FILE="$STATE_DIR/gateway.pid"
LOG_FILE="$STATE_DIR/gateway.log"
MODE_FILE="$STATE_DIR/xhs-search-mode"
restart=false
requested_mode=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --restart) restart=true; shift ;;
    --xhs-search-mode)
      [[ $# -ge 2 ]] || { echo "--xhs-search-mode requires api or browser" >&2; exit 1; }
      requested_mode="$2"; restart=true; shift 2 ;;
    *) echo "Usage: $0 [--restart] [--xhs-search-mode api|browser]" >&2; exit 1 ;;
  esac
done

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/start.lock"
flock -n 9 || exit 0

saved_mode="$(cat "$MODE_FILE" 2>/dev/null || printf api)"
mode="${requested_mode:-${XHS_SEARCH_MODE:-$saved_mode}}"
[[ "$mode" == api || "$mode" == browser ]] || { echo "XHS search mode must be api or browser" >&2; exit 1; }
browser_url="${XHS_BROWSER_SEARCH_URL:-http://127.0.0.1:8073/v1/search}"
browser_key_file="${XHS_BROWSER_SEARCH_KEY_FILE:-${KAIPA_BROWSER_STATE_DIR:-$HOME/.local/state/kaipa-browser-verification}/search-api-key.txt}"
if [[ "$mode" == browser && ! -s "$browser_key_file" && -z "${XHS_BROWSER_SEARCH_API_KEY:-}" ]]; then
  echo "Start the browser search service first; its authentication key is missing" >&2
  exit 1
fi

if [[ -f "$PID_FILE" ]]; then
  pid="$(cat "$PID_FILE")"
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    if [[ "$restart" == false ]] && curl --silent --fail --max-time 2 http://127.0.0.1:8072/health >/dev/null; then
      exit 0
    fi
    process_command="$(ps -p "$pid" -o args= || true)"
    if [[ "$process_command" != *"uvicorn api.kaipa_gateway:app"* ]]; then
      echo "Refusing to stop an unrelated process recorded in $PID_FILE" >&2
      exit 1
    fi
    kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 40); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
    done
  fi
  rm -f "$PID_FILE"
fi

if pgrep -f 'uvicorn api\.kaipa_gateway:app' >/dev/null; then
  echo "Another Kaipa gateway process is already running" >&2
  exit 1
fi

if [[ ! -d "$MEDIA_CRAWLER_DIR" ]]; then
  echo "MediaCrawler directory not found: $MEDIA_CRAWLER_DIR" >&2
  exit 1
fi
if [[ ! -f "$SUPABASE_ENV" ]]; then
  echo "Supabase environment file not found: $SUPABASE_ENV" >&2
  exit 1
fi
if [[ ! -x "$UV_BIN" ]]; then
  echo "uv executable not found: $UV_BIN" >&2
  exit 1
fi

gateway_key="$(sed -n 's/^MEDIACRAWLER_API_KEY=//p' "$SUPABASE_ENV" | tail -n 1)"
if [[ -z "$gateway_key" ]]; then
  echo "MEDIACRAWLER_API_KEY is not configured in $SUPABASE_ENV" >&2
  exit 1
fi

if [[ -n "$requested_mode" ]]; then
  printf '%s\n' "$mode" >"$MODE_FILE"
fi

# Worker profiles are disposable copies. Rebuild them from the authenticated
# base profiles whenever the gateway process is started.
rm -rf \
  "$MEDIA_CRAWLER_DIR"/browser_data/xhs_user_data_dir_kaipa_* \
  "$MEDIA_CRAWLER_DIR"/browser_data/dy_user_data_dir_kaipa_*

cd "$MEDIA_CRAWLER_DIR"
nohup setsid env \
  KAIPA_GATEWAY_API_KEY="$gateway_key" \
  XHS_SEARCH_MODE="$mode" \
  XHS_BROWSER_SEARCH_URL="$browser_url" \
  XHS_BROWSER_SEARCH_KEY_FILE="$browser_key_file" \
  KAIPA_GATEWAY_SEARCH_TIMEOUT_SECONDS=120 \
  XHS_SEARCH_WORKERS=2 \
  DOUYIN_SEARCH_WORKERS=2 \
  SEARCH_QUEUE_LIMIT=20 \
  SEARCH_QUEUE_TIMEOUT_SECONDS=20 \
  SEARCH_CACHE_TTL_SECONDS=600 \
  "$UV_BIN" run uvicorn api.kaipa_gateway:app --host 0.0.0.0 --port 8072 \
  >>"$LOG_FILE" 2>&1 </dev/null 9>&- &
pid=$!
printf '%s\n' "$pid" >"$PID_FILE"

for _ in $(seq 1 20); do
  if curl --silent --fail --max-time 1 http://127.0.0.1:8072/health >/dev/null; then
    exit 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    tail -n 40 "$LOG_FILE" >&2 || true
    rm -f "$PID_FILE"
    exit 1
  fi
  sleep 0.5
done

echo "Kaipa gateway did not become healthy on port 8072" >&2
kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
rm -f "$PID_FILE"
exit 1
