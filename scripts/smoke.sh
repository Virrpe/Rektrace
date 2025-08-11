#!/usr/bin/env bash
set -euo pipefail

export DEMO_MODE=true
export API_KEY=${API_KEY:-demo_key}

echo "GET /status" && curl -s http://127.0.0.1:3000/status | jq . >/dev/null && echo OK
echo "GET /status?verbose=1" && curl -s "http://127.0.0.1:3000/status?verbose=1" | jq . >/dev/null && echo OK
echo "GET /metrics" && curl -s http://127.0.0.1:3000/metrics | jq . >/dev/null && echo OK
echo "POST /api/scan" && curl -s -X POST http://127.0.0.1:3000/api/scan -H 'content-type: application/json' -H "X-API-Key: ${API_KEY}" -d '{"token":"pepe","chain":"eth","enrich":true}' | jq . >/dev/null && echo OK
echo "Smoke complete"


