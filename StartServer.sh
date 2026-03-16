#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
PORT="${TODO_SERVER_PORT:-8081}"
RUNTIME_DIR="dist/runtime"
PID_FILE="${RUNTIME_DIR}/TodoServer.pid"
LOG_FILE="${RUNTIME_DIR}/TodoServer.log"
LEGACY_PID_FILE="runtime/TodoServer.pid"
AUTH_FILE="data/Auth.json"

if ! command -v npm >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install node
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y nodejs npm
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y nodejs npm
  else
    echo "npm is required. Install Node.js and npm first."
    exit 1
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not available after installation attempt."
  exit 1
fi

if [ ! -d node_modules ]; then
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
else
  if ! node -e "const esbuild = require('esbuild'); esbuild.buildSync({stdin:{contents:'export default 1',resolveDir:process.cwd(),sourcefile:'esbuild-check.js'},write:false,format:'esm'});" >/dev/null 2>&1; then
    rm -rf node_modules
    if [ -f package-lock.json ]; then
      npm ci
    else
      npm install
    fi
  fi
fi

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  kill "$(cat "$PID_FILE")"
  sleep 1
fi

if [ -f "$LEGACY_PID_FILE" ] && kill -0 "$(cat "$LEGACY_PID_FILE")" 2>/dev/null; then
  kill "$(cat "$LEGACY_PID_FILE")"
  sleep 1
fi

rm -f "$AUTH_FILE"

npm run build

mkdir -p "$RUNTIME_DIR"

nohup env TODO_SERVER_PORT="$PORT" npm run server > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
sleep 1
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "TodoServer failed to start. Check log: $LOG_FILE"
  exit 1
fi
if command -v lsof >/dev/null 2>&1; then
  LISTEN_PID="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null | head -n 1)"
  if [ -n "$LISTEN_PID" ]; then
    SERVER_PID="$LISTEN_PID"
  fi
fi
echo "$SERVER_PID" > "$PID_FILE"
echo "TodoServer started: PID $SERVER_PID"
echo "API URL: http://localhost:${PORT}/api/todos"
echo "Frontend URL: http://localhost:${PORT}/"
