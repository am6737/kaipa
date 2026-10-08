#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
release_dir="$ROOT/infra/supabase/.runtime/frontend-releases/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$release_dir"
npx tsc --noEmit
npx expo export --platform web --output-dir "$release_dir/web"
(cd admin && VITE_SUPABASE_URL=/sb npm run build)
mkdir -p "$release_dir/admin"
cp -a admin/dist/. "$release_dir/admin/"
backend_network="$(docker inspect kaipa-supabase-kong --format '{{range $name, $config := .NetworkSettings.Networks}}{{$name}}{{println}}{{end}}' | head -n 1)"
if [[ -z "$backend_network" ]]; then echo 'Supabase network not found.' >&2; exit 1; fi
export KAIPA_FRONTEND_RELEASE="$release_dir"
export KAIPA_BACKEND_NETWORK="$backend_network"
docker compose -p kaipa-web -f "$ROOT/infra/web/docker-compose.yml" config --quiet
docker compose -p kaipa-web -f "$ROOT/infra/web/docker-compose.yml" up -d --force-recreate
docker exec kaipa-frontends nginx -t
for port in "${KAIPA_ADMIN_PORT:-4173}" "${KAIPA_WEB_PORT:-7072}"; do
  for attempt in {1..30}; do
    if curl -fsS "http://127.0.0.1:$port/" -o /dev/null; then break; fi
    if [[ "$attempt" == 30 ]]; then echo "Frontend health check failed on $port" >&2; exit 1; fi
    sleep 1
  done
done
printf '%s\n' "$release_dir" > "$ROOT/infra/supabase/.runtime/frontend-current-release"
echo "Published admin on ${KAIPA_ADMIN_PORT:-4173} and Web on ${KAIPA_WEB_PORT:-7072}."
