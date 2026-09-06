#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_RUNTIME="$(cd "$ROOT/.." && pwd)/kaipa-supabase-docker"
RUNTIME_DIR="${KAIPA_SUPABASE_RUNTIME_DIR:-$DEFAULT_RUNTIME}"
DB_CONTAINER="${KAIPA_SUPABASE_DB_CONTAINER:-kaipa-supabase-db}"

read_env() {
  local file="$1" key="$2"
  sed -n "s/^${key}=//p" "$file" | tail -n 1
}

normalize_url() {
  printf '%s' "${1%/}"
}

if [[ $# -ne 1 ]]; then
  echo "Usage: infra/supabase/apply-migration.sh supabase/migrations/<migration>.sql" >&2
  exit 2
fi

if [[ -f "$ROOT/supabase/.temp/project-ref" ]]; then
  echo "Refusing self-hosted migration: this workspace is linked to a Supabase Cloud project." >&2
  echo "Run 'npx supabase unlink' first." >&2
  exit 3
fi

if [[ ! -f "$1" ]]; then
  echo "Migration not found: $1" >&2
  exit 4
fi
migration="$(realpath "$1")"
case "$migration" in
  "$ROOT"/supabase/*.sql|"$ROOT"/supabase/migrations/*.sql) ;;
  *) echo "Migration must be a SQL file inside $ROOT/supabase." >&2; exit 5 ;;
esac
if [[ ! -f "$RUNTIME_DIR/docker-compose.yml" ]]; then
  echo "Self-hosted runtime not found: $RUNTIME_DIR" >&2
  exit 6
fi
if [[ ! -f "$ROOT/.env" || ! -f "$RUNTIME_DIR/kaipa-client.env" ]]; then
  echo "Missing app or self-hosted client environment." >&2
  exit 7
fi

app_url="$(normalize_url "$(read_env "$ROOT/.env" EXPO_PUBLIC_SUPABASE_URL)")"
runtime_url="$(normalize_url "$(read_env "$RUNTIME_DIR/kaipa-client.env" EXPO_PUBLIC_SUPABASE_URL)")"
if [[ -z "$app_url" || "$app_url" != "$runtime_url" ]]; then
  echo "Refusing migration: App and self-hosted runtime Supabase URLs do not match." >&2
  exit 8
fi

docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$migration"
echo "Applied $(basename "$migration") to the self-hosted Kaipa database."
