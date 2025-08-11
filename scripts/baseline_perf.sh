#!/usr/bin/env bash
set -euo pipefail

OUT_DIR=ops/baselines
mkdir -p "$OUT_DIR"

HEALTH_PORT=0 DEMO_MODE=true HTTP_ONLY=true node dist/rektrace-rugscan/rektrace-rugscan/src/index.js &
PID=$!
sleep 0.3 || true

BASE_URL=${BASE_URL:-http://127.0.0.1:3000}

status=$(curl -fsS "$BASE_URL/status?verbose=1" || echo '{}')
p95=$(echo "$status" | jq -r '.slo.p95_ms // 0' 2>/dev/null || echo 0)
err=$(echo "$status" | jq -r '.slo.error_rate_1m // 0' 2>/dev/null || echo 0)

curl -fsS -X POST "$BASE_URL/api/scan" -H 'content-type: application/json' -d '{"token":"ink:pepe"}' >/dev/null || true

ts=$(date +%Y%m%d_%H%M)
file="$OUT_DIR/perf_${ts}.json"
printf '{"ts":"%s","p95_ms":%s,"err1m":%s}\n' "$(date -Iseconds)" "$p95" "$err" > "$file"
echo "[perf] baseline written: $file"

kill $PID >/dev/null 2>&1 || true


