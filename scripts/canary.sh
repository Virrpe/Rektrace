#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${ENV_FILE:-.env.prod}
CHAIN=${CHAIN:-eth}

if [ ! -f "$ENV_FILE" ]; then
  echo "$ENV_FILE missing. Create it from .env.prod.sample or provide ENV_FILE."
  exit 1
fi

export NODE_ENV=production
set -a; source "$ENV_FILE"; set +a
export HTTP_ONLY=${HTTP_ONLY:-true}
export TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-TEST_TOKEN}
export API_KEY=${API_KEY:-demo_key}
export DEMO_MODE=${DEMO_MODE:-false}
# choose a non-default port to avoid collisions
PORT=$((3000 + (RANDOM % 500)))
export HEALTH_PORT=$PORT
echo "Using HEALTH_PORT=$HEALTH_PORT"

echo "Build..."
pnpm rugscan:build | cat

echo "Start server..."
node dist/rektrace-rugscan/rektrace-rugscan/src/index.js &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
sleep 3

echo "Warm cache (10 mixed scans on $CHAIN)"
for i in $(seq 1 10); do curl -s -X POST http://127.0.0.1:$PORT/api/scan -H 'content-type: application/json' -H "X-API-Key: ${API_KEY}" -d '{"token":"pepe","chain":"'"$CHAIN"'"}' >/dev/null; done

echo "Snapshot metrics"
curl -s http://127.0.0.1:$PORT/metrics > canary_metrics.json

echo "Light RL burst"
ok=0; r429=0
for i in $(seq 1 24); do (
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:$PORT/api/scan -H 'content-type: application/json' -H "X-API-Key: ${API_KEY}" -d '{"token":"pepe","chain":"'"$CHAIN"'"}')
  if [ "$code" = "200" ]; then ok=$((ok+1)); elif [ "$code" = "429" ]; then r429=$((r429+1)); fi
) & done; wait
echo "2xx=$ok  429=$r429"

echo "Canary complete"


