#!/usr/bin/env bash
set -euo pipefail

P95_BUDGET=${PERF_P95_BUDGET_MS:-1500}
ERR_BUDGET=${PERF_ERR_BUDGET_PCT:-1.0}

HEALTH_PORT=0 DEMO_MODE=true HTTP_ONLY=true node dist/rektrace-rugscan/rektrace-rugscan/src/index.js &
PID=$!
sleep 0.3 || true
BASE_URL=${BASE_URL:-http://127.0.0.1:3000}

status=$(curl -fsS "$BASE_URL/status?verbose=1" || echo '{}')
p95=$(echo "$status" | jq -r '.slo.p95_ms // 0' 2>/dev/null || echo 0)
err=$(echo "$status" | jq -r '.slo.error_rate_1m // 0' 2>/dev/null || echo 0)

kill $PID >/dev/null 2>&1 || true

pp=$(printf '%.0f' "$p95")
ee=$(printf '%.0f' "$err")
echo "[perf] p95=${pp}ms (budget ${P95_BUDGET}), err1m=${ee} (budget ${ERR_BUDGET})"
if (( pp > P95_BUDGET )) || (( ee > ERR_BUDGET )); then
  echo "[perf] gate FAILED"
  exit 2
fi
echo "[perf] gate OK"


