#!/usr/bin/env bash

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
sleep 1

cd "$DIR"

echo "Building Flutter web app..."
"$FLUTTER" build web \
  --dart-define="SUPABASE_URL=${SUPABASE_URL}" \
  --dart-define="SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}"

if [ $? -ne 0 ]; then
  echo "Error: Flutter build failed"
  exit 1
fi

echo "Serving build/web on http://0.0.0.0:$PORT ..."

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $SERVER_PID 2>/dev/null || true
  exit 0
}
trap cleanup EXIT INT TERM

python3 -m http.server "$PORT" --bind 0.0.0.0 --directory build/web &
SERVER_PID=$!

wait $SERVER_PID 2>/dev/null || true
