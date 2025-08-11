#!/usr/bin/env bash
set -euo pipefail

HOST=${HOST:-127.0.0.1}
PORT=${PORT:-${HEALTH_PORT:-3000}}
URL="http://$HOST:$PORT/status?verbose=1"

json=$(curl -sS "$URL" || echo "{}")
if command -v jq >/dev/null 2>&1; then
  p95=$(echo "$json" | jq -r '.slo.p95_ms // 0')
  err=$(echo "$json" | jq -r '.slo.error_rate_1m // 0')
  br=$(echo "$json" | jq -r '.slo.breaker_hits_1m // 0')
  ag=$(echo "$json" | jq -r '.autoGuard.step // empty')
  cfg=$(echo "$json" | jq -r '.config.fingerprint_sha256 // empty')
  echo "status: p95=${p95}ms err1m=${err} brk1m=${br} autoGuard=${ag:-0} cfg=${cfg:0:8}"
else
  echo "$json"
fi
exit 0


