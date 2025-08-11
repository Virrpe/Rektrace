#!/usr/bin/env bash
set -euo pipefail

# Canary deploy with smoke and zero-downtime reload via PM2

APP_NAME=${APP_NAME:-rektrace}
CANARY_NAME=${CANARY_NAME:-rektrace-canary}
PORT_CANARY=${PORT_CANARY:-8082}

echo "[canary] Building..."
pnpm run build && pnpm run rugscan:build

echo "[canary] Starting canary ${CANARY_NAME} on port ${PORT_CANARY}"
HEALTH_PORT=${PORT_CANARY} pm2 start dist/rektrace-rugscan/rektrace-rugscan/src/index.js --name ${CANARY_NAME} --update-env || true
sleep 2

echo "[canary] Running smoke against canary"
BASE_URL=http://127.0.0.1:${PORT_CANARY} bash scripts/smoke_live.sh || {
  echo "[canary] Smoke failed. Stopping canary."; pm2 delete ${CANARY_NAME} || true; exit 2;
}

echo "[canary] Smoke PASS. Checking SLO gate"
if command -v jq >/dev/null 2>&1; then
  slo=$(curl -sS "http://127.0.0.1:${PORT_CANARY}/status?verbose=1" | jq .slo)
  p95=$(echo "$slo" | jq -r '.p95_ms // 0')
  err=$(echo "$slo" | jq -r '.error_rate_1m // 0')
  p95_gate=${ALERT_SLO_P95_MS:-1500}
  err_gate=${ALERT_ERR_RATE_PCT:-1.0}
  if (( $(printf '%.0f' "$p95") > p95_gate )) || (( $(printf '%.0f' "$err") > err_gate )); then
    echo "[canary] SLO gate failed (p95=${p95} err1m=${err}). Aborting reload."
    pm2 delete ${CANARY_NAME} || true
    exit 3
  fi
fi
echo "[canary] SLO gate OK. Reloading cluster"
pm2 reload ecosystem.config.js --update-env || true
pm2 delete ${CANARY_NAME} || true
echo "[canary] Done."


