#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PID_FILE="dist/runtime/TodoServer.pid"
LEGACY_PID_FILE="runtime/TodoServer.pid"
AUTH_FILE="data/Auth.json"
PORT="${TODO_SERVER_PORT:-8081}"
STOPPED_BY_PID=0

if [ ! -f "$PID_FILE" ] && [ -f "$LEGACY_PID_FILE" ]; then
  PID_FILE="$LEGACY_PID_FILE"
fi

if [ ! -f "$PID_FILE" ]; then
  PID_FILE=""
fi

if [ -n "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "TodoServer stopped: PID $PID"
    STOPPED_BY_PID=1
  else
    echo "TodoServer pid file is stale: PID $PID"
  fi
fi

if [ "$STOPPED_BY_PID" -eq 0 ] && command -v lsof >/dev/null 2>&1; then
  PORT_PID="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null | head -n 1)"
  if [ -n "$PORT_PID" ]; then
    kill "$PORT_PID"
    echo "TodoServer stopped by port ${PORT}: PID $PORT_PID"
    STOPPED_BY_PID=1
  fi
fi

if [ "$STOPPED_BY_PID" -eq 0 ]; then
  echo "TodoServer is not running"
fi

rm -f dist/runtime/TodoServer.pid
rm -f "$LEGACY_PID_FILE"
rm -f "$AUTH_FILE"
