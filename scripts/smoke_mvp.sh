#!/usr/bin/env bash
set -euo pipefail

# Simple MVP smoke against health server
# Uses HEALTH_PORT (or PORT) from env; defaults to 8081

PORT=${HEALTH_PORT:-${PORT:-8081}}
BASE="http://127.0.0.1:${PORT}"

ok=1

curl_slim() {
  curl -fsS --max-time 3 "$1" -H 'accept: */*' -H 'user-agent: smoke' | cat >/dev/null
}

echo "[smoke] /live"
if curl_slim "$BASE/live"; then echo "OK"; else echo "FAIL"; ok=0; fi

echo "[smoke] /ready"
if curl_slim "$BASE/ready"; then echo "OK"; else echo "FAIL"; ok=0; fi

echo "[smoke] /status"
if curl_slim "$BASE/status"; then echo "OK"; else echo "FAIL"; ok=0; fi

echo "[smoke] /metrics"
if curl_slim "$BASE/metrics"; then echo "OK"; else echo "FAIL"; ok=0; fi

if [ "$ok" != "1" ]; then
  echo "[smoke] FAIL" >&2
  exit 1
fi
echo "[smoke] PASS"


