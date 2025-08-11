#!/usr/bin/env bash
set -euo pipefail

export DEMO_MODE=true
API_KEY=${API_KEY:-demo_key}

N=${N:-24}
echo "Hammering POST /api/scan ($N reqs)"
for i in $(seq 1 $N); do (
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:3000/api/scan \
    -H 'content-type: application/json' -H "X-API-Key: ${API_KEY}" \
    -d '{"token":"pepe","chain":"eth"}') || code=000
  echo "#$i -> $code"
) & done
wait

echo "Check exempt endpoints still accessible"
curl -s http://127.0.0.1:3000/status >/dev/null && echo "/status OK"
curl -s http://127.0.0.1:3000/metrics >/dev/null && echo "/metrics OK"


