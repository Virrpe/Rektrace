#!/usr/bin/env bash
set -euo pipefail

export DEMO_MODE=${DEMO_MODE:-true}
export HTTP_ONLY=${HTTP_ONLY:-true}
export SIGNALS_ENABLED=${SIGNALS_ENABLED:-true}
export SIGNALS_POLL_MS=${SIGNALS_POLL_MS:-1000}

echo "[signals] backtest starting (demo=$DEMO_MODE)"

pnpm -s run rugscan:dev &
PID=$!
sleep 2

curl -sS http://127.0.0.1:${HEALTH_PORT:-3000}/status/public | jq '.signals' || true

kill $PID >/dev/null 2>&1 || true
wait $PID 2>/dev/null || true
echo "[signals] backtest done"


