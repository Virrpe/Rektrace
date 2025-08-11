#!/usr/bin/env bash
set -euo pipefail

# Smoke test live endpoints using API_KEY from environment or .env.prod

if [ -f .env.prod ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.prod
  set +a
fi

BASE_URL=${BASE_URL:-http://127.0.0.1:${HEALTH_PORT:-8080}}
API_KEY=${RUGSCAN_API_KEY:-${API_KEY:-}}
DEMO_MODE=${DEMO_MODE:-false}

fail() { echo "[smoke] FAIL: $*" >&2; exit 1; }

hdr=( )
if [ -n "${API_KEY}" ]; then
  hdr=(-H "X-API-Key: ${API_KEY}")
fi

echo "[smoke] GET /status"
t1=$(curl -sw '%{time_total}' -o >(jq . >/dev/null) "${BASE_URL}/status" "${hdr[@]}") || fail "/status"
echo "OK (${t1}s)"

echo "[smoke] GET /metrics"
t2=$(curl -sw '%{time_total}' -o >(jq . >/dev/null) "${BASE_URL}/metrics") || fail "/metrics"
echo "OK (${t2}s)"

post_ok=true
post_reason=""
if [ "${DEMO_MODE}" = "true" ]; then
  echo "[smoke] POST /api/scan (demo body)"
  t3=$(curl -sw '%{time_total}' -o >(jq . >/dev/null) -X POST "${BASE_URL}/api/scan" -H 'content-type: application/json' -d '{"token":"pepe","chain":"eth","enrich":true}' "${hdr[@]}" || true)
  if [ -z "${t3}" ]; then post_ok=false; post_reason="demo scan failed"; fi
else
  if [ -z "${API_KEY}" ]; then
    echo "[smoke] Skipping POST /api/scan (no API key in live mode)"
  else
    echo "[smoke] POST /api/scan (live)"
    t3=$(curl -sw '%{time_total}' -o >(jq . >/dev/null) -X POST "${BASE_URL}/api/scan" -H 'content-type: application/json' -H "X-API-Key: ${API_KEY}" -d '{"token":"pepe","chain":"eth","enrich":true}' || true)
    if [ -z "${t3}" ]; then post_ok=false; post_reason="live scan failed"; fi
  fi
fi

echo "[smoke] Summary: status=${t1}s metrics=${t2}s scan=${t3:-skipped}"
${post_ok} || fail "POST /api/scan failed: ${post_reason}"
echo "[smoke] SUCCESS"


