#!/usr/bin/env bash
set -euo pipefail

if [ -f .env.prod ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.prod || true
  set +a
fi

HP=${HEALTH_PORT:-8081}
BASE=${BASE_URL:-http://127.0.0.1:${HP}}

echo "[probe] BASE=${BASE}"
curl -fsS "${BASE}/live" >/dev/null && echo "/live ✅" || { echo "/live ❌"; exit 1; }
curl -fsS "${BASE}/ready" >/dev/null && echo "/ready ✅" || { echo "/ready ❌"; exit 1; }

if command -v jq >/dev/null 2>&1; then
  curl -fsS "${BASE}/status/public" | jq '{slo, fingerprint:(.config.fingerprint_sha256), signals_len:(.signals|length)}'
else
  curl -fsS "${BASE}/status/public"
fi


