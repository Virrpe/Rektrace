#!/usr/bin/env bash
set -euo pipefail

HOST=${HOST:-"127.0.0.1"}
PORT=${PORT:-${HEALTH_PORT:-3000}}
URL="http://$HOST:$PORT/api/scan"

# Ensure CHAOS is enabled for the server process; this script assumes server already running with env
export CHAOS_ENABLED=${CHAOS_ENABLED:-true}
export CHAOS_PROB=${CHAOS_PROB:-0.1}
export CHAOS_MAX_LATENCY_MS=${CHAOS_MAX_LATENCY_MS:-200}

# Minimal probe loop to ensure no crashes and 5xx stays at 0 while breakers may trip upstream
oks=0; fxx=0; sxx=0
for i in $(seq 1 15); do
  code=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$URL" -H 'content-type: application/json' -d '{"token":"pepe","chain":"ink"}' || true)
  case "$code" in
    200) oks=$((oks+1));; 
    4*) fxx=$((fxx+1));; 
    5*) sxx=$((sxx+1));; 
  esac
  sleep 0.1
done

echo "Chaos smoke: 200=$oks 4xx=$fxx 5xx=$sxx"
if [[ $sxx -gt 0 ]]; then echo "❌ unexpected 5xx under chaos"; exit 2; fi
echo "✅ chaos smoke PASS"


