#!/usr/bin/env bash
# Run on the OLD server: pack the Postgres data directory and the Storage files
# so infra/server/import-runtime-data.sh can drop them into a new server.
#
# Postgres files are only consistent while the server is down, so this stops
# every kaipa-* container first (workers and gateways before the database, so
# nothing writes during shutdown). Pick what happens afterwards:
#
#   --trial   restart the same containers once the archive is written
#             (a rehearsal; writes after this point are NOT in the archive)
#   --final   leave everything stopped (the real cutover)
#   --dry-run show what would be stopped and packed, change nothing
#
#   infra/server/export-runtime-data.sh --trial|--final|--dry-run [output.tgz]
#
# Needs sudo: the data directory belongs to the container's postgres user.
# The archive keeps numeric owners and is written outside the checkout, mode 600.
# If anything fails, the stopped containers are started again.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${KAIPA_SUPABASE_RUNTIME_DIR:-$ROOT/infra/supabase/docker}"
DB_CONTAINER="${KAIPA_SUPABASE_DB_CONTAINER:-kaipa-supabase-db}"
POOLER_CONTAINER="${KAIPA_SUPABASE_POOLER_CONTAINER:-kaipa-supabase-pooler}"
CONTAINER_FILTER="${KAIPA_CONTAINER_FILTER:-kaipa-}"
MANIFEST=kaipa-data-manifest.txt

mode="${1:-}"
case "$mode" in
  --trial|--final|--dry-run) ;;
  *) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
out="${2:-$HOME/kaipa-data-$(date -u +%Y%m%dT%H%M%SZ).tgz}"
out_dir="$(cd "$(dirname "$out")" && pwd)"
out="$out_dir/$(basename "$out")"
case "$out_dir/" in
  "$ROOT"/*) echo "Refusing to write the data archive inside the checkout ($ROOT)." >&2; exit 2 ;;
esac
if [[ -e "$out" ]]; then echo "$out already exists." >&2; exit 2; fi
for dir in "$RUNTIME_DIR/volumes/db/data" "$RUNTIME_DIR/volumes/storage"; do
  sudo test -d "$dir" || { echo "Missing $dir" >&2; exit 3; }
done
sudo test -f "$RUNTIME_DIR/volumes/db/data/PG_VERSION" || { echo 'volumes/db/data has no PG_VERSION; not a Postgres data dir.' >&2; exit 3; }

db_image="$(sed -n 's/^ *image: \(supabase\/postgres:.*\)$/\1/p' "$RUNTIME_DIR/docker-compose.yml" | head -n 1)"
[[ -n "$db_image" ]] || { echo 'Cannot find the supabase/postgres image in docker-compose.yml.' >&2; exit 3; }

# Stop order: everything else, then the pooler, then Postgres last.
mapfile -t running < <(docker ps --filter "name=$CONTAINER_FILTER" --format '{{.Names}}' | sort)
others=()
for name in "${running[@]}"; do
  [[ "$name" == "$DB_CONTAINER" || "$name" == "$POOLER_CONTAINER" ]] || others+=("$name")
done
stop_order=("${others[@]}")
for name in "$POOLER_CONTAINER" "$DB_CONTAINER"; do
  if printf '%s\n' "${running[@]}" | grep -qx "$name"; then stop_order+=("$name"); fi
done

echo "Mode:        ${mode#--}"
echo "Postgres:    $db_image (PG $(sudo cat "$RUNTIME_DIR/volumes/db/data/PG_VERSION"))"
echo "Data sizes:  $(sudo du -sh "$RUNTIME_DIR/volumes/db/data" | cut -f1) db, $(sudo du -sh "$RUNTIME_DIR/volumes/storage" | cut -f1) storage"
echo "Will stop:   ${stop_order[*]:-(nothing running)}"
echo "Archive:     $out"
if [[ "$mode" == --dry-run ]]; then exit 0; fi

stopped=()
restart_stopped() {
  (( ${#stopped[@]} )) || return 0
  # Start in reverse: Postgres first, workers last.
  local i
  for (( i=${#stopped[@]}-1; i>=0; i-- )); do docker start "${stopped[i]}" >/dev/null && echo "  started ${stopped[i]}"; done
}
on_exit() {
  local status=$?
  if [[ -n "${manifest_tmp:-}" ]]; then rm -rf "$manifest_tmp"; fi
  if (( status != 0 )); then
    rm -f "$out"
    echo 'Export failed; restarting what was stopped.' >&2
    restart_stopped
  fi
}
trap on_exit EXIT

echo 'Stopping containers...'
for name in "${stop_order[@]}"; do
  # The agent worker waits up to 320s for an in-flight run (its stop_grace_period).
  if [[ "$name" == "$DB_CONTAINER" ]]; then docker stop -t 120 "$name" >/dev/null; else docker stop "$name" >/dev/null; fi
  stopped+=("$name")
  echo "  stopped $name"
done
if [[ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null || true)" == true ]]; then
  echo "$DB_CONTAINER is still running." >&2; exit 4
fi

manifest_tmp="$(mktemp -d)"
cat > "$manifest_tmp/$MANIFEST" <<EOF
created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mode=${mode#--}
source_host=$(hostname)
source_commit=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)
db_image=$db_image
pg_version=$(sudo cat "$RUNTIME_DIR/volumes/db/data/PG_VERSION")
db_bytes=$(sudo find "$RUNTIME_DIR/volumes/db/data" -type f -printf '%s\n' | awk '{n+=$1} END {print n+0}')
storage_bytes=$(sudo find "$RUNTIME_DIR/volumes/storage" -type f -printf '%s\n' | awk '{n+=$1} END {print n+0}')
storage_files=$(sudo find "$RUNTIME_DIR/volumes/storage" -type f | wc -l)
EOF

echo 'Packing...'
umask 077
# tar runs as root to read the data dir; the redirect makes the archive ours.
sudo tar --numeric-owner -cpzf - \
  -C "$manifest_tmp" "$MANIFEST" \
  -C "$RUNTIME_DIR/volumes" db/data storage > "$out"
chmod 600 "$out"
rm -rf "$manifest_tmp"; manifest_tmp=''
gzip -t "$out"
tar -tzf "$out" "$MANIFEST" db/data/PG_VERSION >/dev/null

if [[ "$mode" == --trial ]]; then
  echo 'Restarting containers (trial run)...'
  restart_stopped
  stopped=()
else
  stopped=()
  echo 'Containers left stopped (final cutover). Do not start them again on this server.'
fi

echo
echo "Wrote $out ($(du -h "$out" | cut -f1))"
sha256sum "$out"
echo
echo 'Copy it to the new server, then run there (from the checkout root):'
echo "  infra/server/import-runtime-data.sh $(basename "$out")"
