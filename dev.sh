#!/usr/bin/env bash
set -e

PORT=8082
DIR="$(cd "$(dirname "$0")" && pwd)"
FLUTTER="$HOME/flutter/bin/flutter"

# Load .env
if [ -f "$DIR/.env" ]; then
  set -a
  source "$DIR/.env"
  set +a
fi

# Kill existing server on the port
kill $(lsof -t -i:"$PORT") 2>/dev/null || true

# Build
echo "Building Flutter web..."
cd "$DIR"
"$FLUTTER" build web --release --quiet \
  --dart-define="SUPABASE_URL=${SUPABASE_URL}" \
  --dart-define="SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}"

# Serve
echo "Serving on http://0.0.0.0:$PORT"
cd "$DIR/build/web"
exec python3 -m http.server "$PORT" --bind 0.0.0.0
