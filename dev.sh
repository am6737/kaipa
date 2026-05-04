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

echo "Starting Flutter web-server on http://0.0.0.0:$PORT (hot reload enabled)..."
cd "$DIR"
exec "$FLUTTER" run -d web-server \
  --web-port "$PORT" \
  --web-hostname 0.0.0.0 \
  --dart-define="SUPABASE_URL=${SUPABASE_URL}" \
  --dart-define="SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}"
