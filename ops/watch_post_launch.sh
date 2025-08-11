#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-http://127.0.0.1:${PORT:-8080}}
ITER=${ITER:-12}
SLEEP=${SLEEP:-20}

echo "[watch] Watching ${BASE_URL} (${ITER}x, every ${SLEEP}s)"

for ((i=1;i<=ITER;i++)); do
  ts=$(date -Iseconds)
  js=$(curl -fsS "${BASE_URL}/status?verbose=1" || echo '{}')
  if command -v jq >/dev/null 2>&1; then
    p95=$(echo "$js" | jq -r '.slo.p95_ms // 0')
    err=$(echo "$js" | jq -r '.slo.error_rate_1m // 0')
    brk=$(echo "$js" | jq -r '.slo.breaker_hits_1m // 0')
    auto=$(echo "$js" | jq -r '.autoGuard.enabled // empty')
    cfg=$(echo "$js" | jq -r '.config.fingerprint_sha256 // empty')
  else
    p95=0; err=0; brk=0; auto=""; cfg=""
  fi
  if (( $(printf '%.0f' "$p95") <= ${ALERT_SLO_P95_MS:-1500} )) && (( $(printf '%.0f' "$err") <= ${ALERT_ERR_RATE_PCT:-1} )); then
    echo "[$ts] GREEN p95=${p95}ms err1m=${err} brk1m=${brk} autoGuard=${auto} cfg=${cfg}"
  else
    echo "[$ts] RED   p95=${p95}ms err1m=${err} brk1m=${brk} autoGuard=${auto} cfg=${cfg} | hint: lower RL_MAX, enable AUTO_GUARD, check providers"
  fi
  sleep "$SLEEP"
done

exit 0


