#!/usr/bin/env bash
# Run on the NEW server, before infra/server/deploy.sh: unpack the archive from
# export-runtime-data.sh into the runtime's volumes/db/data and volumes/storage.
#
#   infra/server/import-runtime-data.sh <kaipa-data-*.tgz> [--replace]
#
# Refuses while the database container is running, and refuses to overwrite
# existing data unless --replace is given; replaced data is moved aside to
# volumes/*.replaced-<timestamp>, never deleted. The archive's Postgres image
# must match docker-compose.yml: a data directory only opens under the same
# major version, and the Supabase image ships its own extensions.
# Needs sudo to restore the container users' file ownership.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${KAIPA_SUPABASE_RUNTIME_DIR:-$ROOT/infra/supabase/docker}"
DB_CONTAINER="${KAIPA_SUPABASE_DB_CONTAINER:-kaipa-supabase-db}"
MANIFEST=kaipa-data-manifest.txt

archive=''
replace=0
for arg in "$@"; do
  case "$arg" in
    --replace) replace=1 ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "Unknown option: $arg" >&2; exit 2 ;;
    *) archive="$arg" ;;
  esac
done
[[ -n "$archive" && -f "$archive" ]] || { echo 'Usage: infra/server/import-runtime-data.sh <kaipa-data-*.tgz> [--replace]' >&2; exit 2; }
[[ -f "$RUNTIME_DIR/docker-compose.yml" ]] || { echo "Runtime not found: $RUNTIME_DIR (unpack the config bundle first)." >&2; exit 2; }

if [[ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null || true)" == true ]]; then
  echo "$DB_CONTAINER is running; stop it before replacing its data." >&2
  exit 3
fi

echo 'Checking archive...'
gzip -t "$archive"
manifest="$(tar -xzOf "$archive" "$MANIFEST" 2>/dev/null)" || { echo "No $MANIFEST in the archive; was it made by export-runtime-data.sh?" >&2; exit 4; }
printf '%s\n' "$manifest" | sed 's/^/  /'
field() { printf '%s\n' "$manifest" | sed -n "s/^$1=//p"; }
archive_image="$(field db_image)"
runtime_image="$(sed -n 's/^ *image: \(supabase\/postgres:.*\)$/\1/p' "$RUNTIME_DIR/docker-compose.yml" | head -n 1)"
if [[ "$archive_image" != "$runtime_image" ]]; then
  echo "Postgres image mismatch: archive $archive_image, docker-compose.yml $runtime_image." >&2
  echo 'Check out the commit the data came from (see source_commit above) or upgrade on the old server first.' >&2
  exit 5
fi
if [[ "$(field mode)" == trial ]]; then
  echo 'NOTE: trial archive; the old server kept running after it was made, so later writes are missing.'
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
for dir in db/data storage; do
  target="$RUNTIME_DIR/volumes/$dir"
  if sudo test -d "$target" && [[ -n "$(sudo ls -A "$target")" ]]; then
    if (( ! replace )); then
      echo "volumes/$dir is not empty. Re-run with --replace to move it aside." >&2
      exit 6
    fi
    sudo mv "$target" "$target.replaced-$stamp"
    echo "Moved existing volumes/$dir to volumes/$dir.replaced-$stamp"
  elif sudo test -d "$target"; then
    sudo rmdir "$target"
  fi
done

echo 'Unpacking...'
sudo mkdir -p "$RUNTIME_DIR/volumes/db"
sudo tar --numeric-owner -xpzf "$archive" -C "$RUNTIME_DIR/volumes" --exclude="$MANIFEST" db/data storage

pg_version="$(sudo cat "$RUNTIME_DIR/volumes/db/data/PG_VERSION")"
[[ "$pg_version" == "$(field pg_version)" ]] || { echo 'PG_VERSION does not match the manifest.' >&2; exit 7; }
# Sum of file sizes, not du: directory entry sizes differ between filesystems.
db_bytes="$(sudo find "$RUNTIME_DIR/volumes/db/data" -type f -printf '%s\n' | awk '{n+=$1} END {print n+0}')"
storage_files="$(sudo find "$RUNTIME_DIR/volumes/storage" -type f | wc -l)"
echo "db/data:  $db_bytes bytes (archive recorded $(field db_bytes))"
echo "storage:  $storage_files files (archive recorded $(field storage_files))"
if [[ "$db_bytes" != "$(field db_bytes)" || "$storage_files" != "$(field storage_files)" ]]; then
  echo 'Size or file count differs from the manifest.' >&2
  exit 8
fi
echo 'Data in place. Next: infra/server/check-env.sh, then infra/server/deploy.sh.'
