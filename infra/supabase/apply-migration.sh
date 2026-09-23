#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_RUNTIME="$(cd "$ROOT/.." && pwd)/kaipa-supabase-docker"
RUNTIME_DIR="${KAIPA_SUPABASE_RUNTIME_DIR:-$DEFAULT_RUNTIME}"
DB_CONTAINER="${KAIPA_SUPABASE_DB_CONTAINER:-kaipa-supabase-db}"
# Which role applies the file. Most tables are owned by `postgres`, but the route
# facts objects are owned by `supabase_admin`, and postgres is not a superuser
# here, so a migration touching those fails with "must be owner of table
# route_fact_entries" and rolls back. Override with
# KAIPA_SUPABASE_DB_USER=supabase_admin for those.
DB_USER="${KAIPA_SUPABASE_DB_USER:-postgres}"

read_env() {
  local file="$1" key="$2"
  sed -n "s/^${key}=//p" "$file" | tail -n 1
}

normalize_url() {
  printf '%s' "${1%/}"
}

if [[ $# -ne 1 ]]; then
  echo "Usage: infra/supabase/apply-migration.sh supabase/migrations/<migration>.sql" >&2
  echo "  KAIPA_SUPABASE_DB_USER=<role>  applies as another role (default: postgres)." >&2
  echo "  Use supabase_admin for migrations touching route_fact_* (see the note above DB_USER)." >&2
  exit 2
fi

if [[ ! "$DB_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "Invalid KAIPA_SUPABASE_DB_USER: $DB_USER" >&2
  exit 9
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

docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres < "$migration"
echo "Applied $(basename "$migration") to the self-hosted Kaipa database as role $DB_USER."
