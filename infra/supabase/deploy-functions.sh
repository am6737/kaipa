#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_RUNTIME="$(cd "$ROOT/.." && pwd)/kaipa-supabase-docker"
RUNTIME_DIR="${KAIPA_SUPABASE_RUNTIME_DIR:-$DEFAULT_RUNTIME}"
FUNCTIONS_CONTAINER="${KAIPA_SUPABASE_FUNCTIONS_CONTAINER:-kaipa-supabase-edge-functions}"

read_env() {
  local file="$1" key="$2"
  sed -n "s/^${key}=//p" "$file" | tail -n 1
}

normalize_url() {
  printf '%s' "${1%/}"
}

if [[ -f "$ROOT/supabase/.temp/project-ref" ]]; then
  echo "Refusing self-hosted deploy: this workspace is linked to a Supabase Cloud project." >&2
  echo "Run 'npx supabase unlink' before deploying Kaipa." >&2
  exit 2
fi

if [[ ! -f "$ROOT/.env" || ! -f "$RUNTIME_DIR/kaipa-client.env" ]]; then
  echo "Missing app or self-hosted client environment. Run infra/supabase/setup-kaipa-supabase.sh first." >&2
  exit 3
fi

app_url="$(normalize_url "$(read_env "$ROOT/.env" EXPO_PUBLIC_SUPABASE_URL)")"
runtime_url="$(normalize_url "$(read_env "$RUNTIME_DIR/kaipa-client.env" EXPO_PUBLIC_SUPABASE_URL)")"
if [[ -z "$app_url" || "$app_url" != "$runtime_url" ]]; then
  echo "Refusing deploy: App and self-hosted runtime Supabase URLs do not match." >&2
  exit 4
fi

source_dir="$ROOT/supabase/functions"
target_dir="$RUNTIME_DIR/volumes/functions"
if [[ ! -d "$source_dir" || ! -d "$target_dir" ]]; then
  echo "Missing Edge Function source or runtime mount directory." >&2
  exit 5
fi

if [[ $# -gt 0 ]]; then
  functions=("$@")
else
  mapfile -t functions < <(find "$source_dir" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
fi

if [[ ${#functions[@]} -eq 0 ]]; then
  echo "No Edge Functions found." >&2
  exit 6
fi

for function_name in "${functions[@]}"; do
  if [[ ! "$function_name" =~ ^[a-z0-9][a-z0-9-]*$ || ! -f "$source_dir/$function_name/index.ts" ]]; then
    echo "Invalid Edge Function: $function_name" >&2
    exit 7
  fi
  mkdir -p "$target_dir/$function_name"
  rsync -a --delete "$source_dir/$function_name/" "$target_dir/$function_name/"
  echo "Synced $function_name"
done

if docker inspect "$FUNCTIONS_CONTAINER" >/dev/null 2>&1; then
  docker restart "$FUNCTIONS_CONTAINER" >/dev/null
else
  (cd "$RUNTIME_DIR" && docker compose up -d functions)
fi

for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$FUNCTIONS_CONTAINER" 2>/dev/null || true)"
  [[ "$status" == "healthy" || "$status" == "running" ]] && break
  sleep 1
done
if [[ "$status" != "healthy" && "$status" != "running" ]]; then
  echo "Edge Functions container did not become ready." >&2
  exit 8
fi

http_port="$(read_env "$RUNTIME_DIR/.env" KONG_HTTP_PORT)"
http_port="${http_port:-8010}"
for function_name in "${functions[@]}"; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${http_port}/functions/v1/${function_name}" || true)"
  case "$code" in
    000|404|502|503)
      echo "Function health check failed for $function_name (HTTP $code)." >&2
      exit 9
      ;;
  esac
  echo "Ready $function_name (HTTP $code)"
done

echo "Self-hosted Edge Function deployment completed."
