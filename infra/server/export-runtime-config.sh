#!/usr/bin/env bash
# Run on the CURRENT server: bundle the gitignored files a fresh checkout needs
# to boot the same Kaipa stack elsewhere.
#
# A clone alone cannot start the stack: the Kong declarative config, the
# Postgres bootstrap SQL, the pooler config, and the patched Edge main router
# all live under the gitignored volumes/, and the secrets live in .env. The JWT
# secret, anon/service keys, Postgres password, and vault key must move as-is:
# regenerating them logs every user out, breaks the App's baked-in anon key, and
# leaves the copied database unreadable.
#
# The bundle holds secrets. It is written outside the checkout with mode 600;
# copy it over SSH and delete it afterwards. Database data and Storage objects
# are NOT included (see docs/server-deployment.md).
#
#   infra/server/export-runtime-config.sh [output.tar.gz]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_REL="infra/supabase/docker"
out="${1:-$HOME/kaipa-runtime-config-$(date -u +%Y%m%dT%H%M%SZ).tar.gz}"
out_dir="$(cd "$(dirname "$out")" && pwd)"
case "$out_dir/" in
  "$ROOT"/*) echo "Refusing to write the secret bundle inside the checkout ($ROOT)." >&2; exit 2 ;;
esac

files=(
  .env
  "$RUNTIME_REL/.env"
  "$RUNTIME_REL/kaipa-client.env"
  "$RUNTIME_REL/volumes/api/kong.yml"
  "$RUNTIME_REL/volumes/api/kong-entrypoint.sh"
  "$RUNTIME_REL/volumes/pooler/pooler.exs"
  "$RUNTIME_REL/volumes/functions/main"
)
for sql in "$ROOT/$RUNTIME_REL"/volumes/db/*.sql; do files+=("${sql#"$ROOT"/}"); done
for f in "${files[@]}"; do
  if [[ ! -e "$ROOT/$f" ]]; then echo "Missing $f; is this the live runtime?" >&2; exit 3; fi
done

umask 077
tar -C "$ROOT" -czf "$out" "${files[@]}"
chmod 600 "$out"
echo "Wrote $out"
sha256sum "$out"
echo "Contents:"
tar -tzf "$out" | sed 's/^/  /'
cat <<EOF

Next, on the new server (from the checkout root):
  tar -xzf $(basename "$out")       # restores the files above in place
  chmod 600 .env $RUNTIME_REL/.env $RUNTIME_REL/kaipa-client.env
  shred -u $(basename "$out")
EOF
