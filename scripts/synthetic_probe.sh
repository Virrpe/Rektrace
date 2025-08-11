#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-http://127.0.0.1:${PORT:-8080}}
OUT=${OUT:-synthetic_last.json}

status_code=0
body=$(mktemp)
trap 'rm -f "$body"' EXIT

if ! curl -fsS "${BASE_URL}/status?verbose=1" -o "$body"; then
  echo "[synthetic] /status failed"
  exit 2
fi

if command -v jq >/dev/null 2>&1; then
  p95=$(jq -r '.slo.p95_ms // 0' "$body")
  err=$(jq -r '.slo.error_rate_1m // 0' "$body")
  brk=$(jq -r '.slo.breaker_hits_1m // 0' "$body")
else
  p95=0; err=0; brk=0
fi

cp "$body" "$OUT"

p95_gate=${ALERT_SLO_P95_MS:-1500}
err_gate=${ALERT_ERR_RATE_PCT:-1.0}

echo "[synthetic] p95=${p95}ms err1m=${err} brk1m=${brk} url=${BASE_URL}"

# Optional demo probe
if [[ "${DEMO_MODE:-false}" == "true" ]]; then
  curl -fsS -X POST "${BASE_URL}/api/scan" \
    -H 'content-type: application/json' \
    -d '{"token":"ink:pepe"}' >/dev/null || { echo "[synthetic] demo scan failed"; exit 3; }
fi

# Gates
pp=$(printf '%.0f' "$p95")
ee=$(printf '%.0f' "$err")
if (( pp > p95_gate )) || (( ee > err_gate )); then
  echo "[synthetic] SLO breach (p95=${p95} err=${err})"
  exit 4
fi

exit 0


