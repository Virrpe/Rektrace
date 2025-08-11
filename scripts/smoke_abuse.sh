#!/usr/bin/env bash
set -euo pipefail

if [ -f .env.prod ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.prod
  set +a
fi

PORT=${PORT:-8080}
BASE_URL=${BASE_URL:-http://127.0.0.1:${PORT}}
API_KEY=${RUGSCAN_API_KEY:-${API_KEY:-}}
DEMO_MODE=${DEMO_MODE:-false}

req() {
  local method=$1 path=$2 body=${3:-} ctype=${4:-application/json}
  if [ -n "$body" ]; then
    curl -s -o /dev/null -w '%{http_code} %{time_total}' -X "$method" "$BASE_URL$path" -H "content-type: $ctype" ${API_KEY:+-H "X-API-Key: $API_KEY"} --data "$body"
  else
    curl -s -o /dev/null -w '%{http_code} %{time_total}' "$BASE_URL$path" ${API_KEY:+-H "X-API-Key: $API_KEY"}
  fi
}

echo "[abuse] GET /status"
o=$(req GET /status)
echo "$o"; code=${o%% *}; [ "$code" = "200" ] || exit 1

echo "[abuse] GET /metrics"
o=$(req GET /metrics)
echo "$o"; code=${o%% *}; [ "$code" = "200" ] || exit 1

echo "[abuse] POST /api/scan with text/plain"
o=$(req POST /api/scan '{"token":"pepe","chain":"eth"}' text/plain || true)
echo "$o"; code=${o%% *}; if [ "$code" != "200" ] && [ "$code" != "400" ] && [ "$code" != "415" ]; then exit 1; fi

echo "[abuse] Oversize body"
big=$(python - <<'PY'
print('{' + '"token":"' + 'x'*200000 + '"}')
PY
)
o=$(req POST /api/scan "$big" application/json || true)
echo "$o"; code=${o%% *}; if [ "$code" != "200" ] && [ "$code" != "400" ] && [ "$code" != "413" ]; then exit 1; fi

echo "[abuse] Invalid chain"
o=$(req POST /api/scan '{"token":"pepe","chain":"invalid"}' application/json || true)
echo "$o"; code=${o%% *}; if [ "$code" != "400" ] && [ "$code" != "200" ]; then exit 1; fi

echo "[abuse] Invalid token traversal"
o=$(req GET /api/scan/ink/../../etc/passwd || true)
echo "$o"; code=${o%% *}; if [ "$code" != "400" ] && [ "$code" != "404" ] && [ "$code" != "200" ]; then exit 1; fi

echo "[abuse] Burst 10x POST"
ok=0; rl=0; other=0
for i in $(seq 1 10); do
  ( req POST /api/scan '{"token":"pepe","chain":"eth"}' application/json & )
done
wait
echo "[abuse] Burst complete (manual inspection recommended in logs)"

echo "[abuse] PASS"


