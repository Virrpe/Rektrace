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

# Buffer until /live responds, with clear status indication (≤ ~20s)
max_attempts=${PROBE_MAX_ATTEMPTS:-20}
sleep_secs=${PROBE_SLEEP_SECS:-1}
attempt=0
while :; do
  attempt=$((attempt+1))
  if curl -fsS "${BASE}/live" >/dev/null 2>&1; then
    echo "/live ✅"
    break
  fi
  echo "/live … buffering (${attempt}/${max_attempts})"
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "/live ❌ (timeout)"; exit 1
  fi
  sleep "$sleep_secs"
done

curl -fsS "${BASE}/ready" >/dev/null && echo "/ready ✅" || { echo "/ready ❌"; exit 1; }

if command -v jq >/dev/null 2>&1; then
  curl -fsS "${BASE}/status/public" | jq '{slo, fingerprint:(.config.fingerprint_sha256), signals_len:(.signals|length)}'
else
  curl -fsS "${BASE}/status/public"
fi


