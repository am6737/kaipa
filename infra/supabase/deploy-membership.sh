#!/usr/bin/env bash
# Release the free-open-access backend, with purchases disabled throughout.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${KAIPA_SUPABASE_RUNTIME_DIR:-$ROOT/infra/supabase/docker}"
DB_CONTAINER="${KAIPA_SUPABASE_DB_CONTAINER:-kaipa-supabase-db}"
FUNCTIONS_CONTAINER="${KAIPA_SUPABASE_FUNCTIONS_CONTAINER:-kaipa-supabase-edge-functions}"
cd "$ROOT"
if [[ -f "$ROOT/supabase/.temp/project-ref" || ! -f "$ROOT/.env" || ! -f "$RUNTIME_DIR/kaipa-client.env" ]]; then
  echo 'Self-hosted environment is missing or this checkout is cloud-linked.' >&2; exit 2
fi
app_url="$(sed -n 's/^EXPO_PUBLIC_SUPABASE_URL=//p' "$ROOT/.env" | tail -n 1)"
runtime_url="$(sed -n 's/^EXPO_PUBLIC_SUPABASE_URL=//p' "$RUNTIME_DIR/kaipa-client.env" | tail -n 1)"
if [[ -z "$app_url" || "${app_url%/}" != "${runtime_url%/}" ]]; then
  echo 'App and self-hosted Supabase URLs do not match.' >&2; exit 3
fi
# Build/test first, before interrupting the running instance.
npx tsc --noEmit
(cd admin && npm run build)
node scripts/test-membership-runtime.cjs
node scripts/test-membership-runtime-concurrency.cjs
npx --yes deno check supabase/functions/resources/index.ts supabase/functions/app-agent/index.ts supabase/functions/gear-image-recognition/index.ts supabase/functions/gear-background-removal/index.ts supabase/functions/gear-link-preview/index.ts supabase/functions/map-search/index.ts supabase/functions/qr-login/index.ts supabase/functions/create-guest-account/index.ts supabase/functions/delete-account/index.ts supabase/functions/route-fact-analyze/index.ts
npx --yes deno test supabase/functions/_shared/resource-guard_test.ts supabase/functions/app-agent/model-metrics_test.ts supabase/functions/app-agent/attachments_test.ts
BACKUP_DIR="$ROOT/infra/supabase/.runtime/backups"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
backup="$BACKUP_DIR/membership-$(date -u +%Y%m%dT%H%M%SZ).dump"
umask 077
docker exec "$DB_CONTAINER" pg_dump -U supabase_admin -Fc -d postgres > "$backup"
echo "Database backup saved to the ignored runtime backup directory."
# A short maintenance window closes the old unmetered endpoints before installing
# strict storage policies. The updated App/web guest bundle must accompany this.
worker_running="$(docker inspect -f '{{.State.Running}}' kaipa-agent-worker 2>/dev/null || true)"
if [[ "$worker_running" == 'true' ]]; then docker stop -t 10 kaipa-agent-worker >/dev/null; fi
docker stop -t 10 "$FUNCTIONS_CONTAINER" >/dev/null
migration_file="$(mktemp "$ROOT/supabase/migrations/.membership-release.XXXXXX.sql")"
trap 'rm -f "$migration_file"' EXIT
printf 'begin;\n' > "$migration_file"
for entry in 'membership_runtime:20261008120000_membership_foundation.sql' 'resource_rate_rules:20261008130000_membership_runtime.sql' 'resource_upload_tickets:20261008140000_resource_uploads.sql'; do
  table_name="${entry%%:*}"; migration_name="${entry#*:}"
  installed="$(docker exec "$DB_CONTAINER" psql -X -At -U postgres -d postgres -c "select to_regclass('public.$table_name') is not null")"
  if [[ "$installed" != 't' ]]; then
    sed -e '/^begin;$/d' -e '/^commit;$/d' "$ROOT/supabase/migrations/$migration_name" >> "$migration_file"
  fi
done
sed -e '/^begin;$/d' -e '/^commit;$/d' "$ROOT/supabase/migrations/20261008150000_resource_maintenance_fix.sql" >> "$migration_file"
printf 'commit;\n' >> "$migration_file"
KAIPA_SUPABASE_DB_USER=supabase_admin "$ROOT/infra/supabase/apply-migration.sh" "$migration_file"
"$ROOT/infra/supabase/deploy-functions.sh" resources app-agent gear-image-recognition gear-background-removal gear-link-preview map-search qr-login create-guest-account delete-account route-fact-analyze
bash "$ROOT/infra/supabase/deploy-agent-worker.sh"
echo 'Membership resource backend released. Deploy the updated App/web guest bundle and admin/dist with it; purchases remain disabled.'
