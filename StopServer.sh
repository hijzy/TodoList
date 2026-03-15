#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PID_FILE="dist/runtime/TodoServer.pid"
LEGACY_PID_FILE="runtime/TodoServer.pid"
AUTH_FILE="data/Auth.json"

if [ ! -f "$PID_FILE" ] && [ -f "$LEGACY_PID_FILE" ]; then
  PID_FILE="$LEGACY_PID_FILE"
fi

if [ ! -f "$PID_FILE" ]; then
  echo "TodoServer is not running (pid file missing)"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "TodoServer stopped: PID $PID"
else
  echo "TodoServer process not found: PID $PID"
fi

rm -f "$PID_FILE"
rm -f "$LEGACY_PID_FILE"
rm -f "$AUTH_FILE"
