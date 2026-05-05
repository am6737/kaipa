#!/usr/bin/env bash

PORT=8082
DIR="$(cd "$(dirname "$0")" && pwd)"
FLUTTER="$HOME/flutter/bin/flutter"
PID_FILE="/tmp/flutter_dev_${PORT}.pid"
CHECKSUM_FILE="/tmp/flutter_checksum_${PORT}"

# Load .env
if [ -f "$DIR/.env" ]; then
  set -a
  source "$DIR/.env"
  set +a
fi

# Kill existing server on the port
kill $(lsof -t -i:"$PORT") 2>/dev/null || true
sleep 1

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $FLUTTER_PID 2>/dev/null || true
  rm -f "$PID_FILE" "$CHECKSUM_FILE"
  exit 0
}
trap cleanup EXIT INT TERM

echo "Starting Flutter web-server on http://0.0.0.0:$PORT ..."
cd "$DIR"

# Start Flutter in background with --pid-file (signal handlers are ready when file appears)
"$FLUTTER" run -d web-server \
  --web-port "$PORT" \
  --web-hostname 0.0.0.0 \
  --pid-file "$PID_FILE" \
  --dart-define="SUPABASE_URL=${SUPABASE_URL}" \
  --dart-define="SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}" &

FLUTTER_PID=$!

# Wait for pid-file (Flutter creates it when signal handlers are hooked)
echo "Waiting for Flutter to initialize (signal handlers)..."
for i in $(seq 1 60); do
  if [ -f "$PID_FILE" ]; then
    break
  fi
  sleep 2
done

if [ ! -f "$PID_FILE" ]; then
  echo "Error: Flutter failed to start (pid file not created after 120s)"
  exit 1
fi

SIGNAL_PID=$(cat "$PID_FILE")
echo "Flutter ready (signal PID: $SIGNAL_PID)"

# Compute checksum of all .dart files
dart_checksum() {
  find "$DIR/lib" -name "*.dart" -exec md5sum {} \; 2>/dev/null | sort | md5sum
}
LAST_SUM=$(dart_checksum)
echo "Watching $DIR/lib for changes..."

# File watcher: sends SIGUSR1 (hot reload) when .dart files change
(
  while true; do
    sleep 2
    NEW_SUM=$(dart_checksum)
    if [ "$LAST_SUM" != "$NEW_SUM" ]; then
      LAST_SUM="$NEW_SUM"
      if kill -SIGUSR1 "$SIGNAL_PID" 2>/dev/null; then
        echo "[$(date +%H:%M:%S)] Hot reload triggered"
      fi
    fi
  done
) &

wait $FLUTTER_PID 2>/dev/null || true
