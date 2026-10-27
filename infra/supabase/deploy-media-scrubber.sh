#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${KAIPA_SUPABASE_RUNTIME_DIR:-$ROOT/infra/supabase/docker}"
if [[ ! -f "$RUNTIME_DIR/docker-compose.yml" || ! -f "$RUNTIME_DIR/.env" ]]; then
  echo 'Self-hosted Supabase runtime is missing.' >&2
  exit 1
fi
# Needs public.media_scrub_pending / media_scrub_record
# (supabase/migrations/20261027160000_media_location_scrub.sql).
# MEDIA_SCRUB_DRY_RUN=1 (or --dry-run) only logs which objects carry location
# metadata: nothing is recorded and nothing is re-uploaded.
if [[ "${1:-}" == '--dry-run' ]]; then
  export MEDIA_SCRUB_DRY_RUN=1
fi
# The image is just node + exiftool plus the service file; build from a scratch
# context so the storage volumes next door never end up in the build layer.
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT
install -m 644 "$ROOT/infra/supabase/media-scrubber.Dockerfile" "$BUILD_DIR/Dockerfile"
install -m 644 "$ROOT/infra/supabase/media-scrubber.mjs" "$BUILD_DIR/media-scrubber.mjs"
docker build -t kaipa-media-scrubber:latest "$BUILD_DIR"
install -m 644 "$ROOT/infra/supabase/media-scrubber.compose.yml" "$RUNTIME_DIR/media-scrubber.compose.yml"
docker compose --project-directory "$RUNTIME_DIR" -f "$RUNTIME_DIR/docker-compose.yml" -f "$RUNTIME_DIR/media-scrubber.compose.yml" up -d --force-recreate --no-deps media-scrubber
