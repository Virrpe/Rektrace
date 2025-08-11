#!/usr/bin/env bash
set -euo pipefail

HOST=${HOST:-"127.0.0.1"}
PORT=${PORT:-${HEALTH_PORT:-3000}}
URL="http://$HOST:$PORT/api/scan"

M=${M:-200}
T=${T:-10}
RSS_LIMIT_MB=${RSS_LIMIT_MB:-50}
FIVE_XX_LIMIT=${FIVE_XX_LIMIT:-0}

mem_before=$(node -e "console.log(process.memoryUsage().rss)")
oks=0; fxx=0; sxx=0
start=$(date +%s)
deadline=$((start+T))

while [[ $(date +%s) -lt $deadline ]]; do
  for i in $(seq 1 $M); do
    code=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$URL" -H 'content-type: application/json' -d '{"token":"pepe","chain":"ink"}' || true)
    case "$code" in
      200) oks=$((oks+1));; 
      4*) fxx=$((fxx+1));; 
      5*) sxx=$((sxx+1));; 
    esac
  done
done

mem_after=$(node -e "console.log(process.memoryUsage().rss)")
delta_mb=$(( (mem_after - mem_before) / 1024 / 1024 ))

echo "Soak: 200=$oks 4xx=$fxx 5xx=$sxx rss_delta=${delta_mb}MB"
if [[ $sxx -gt $FIVE_XX_LIMIT ]]; then echo "❌ soak: 5xx over limit"; exit 2; fi
if [[ $delta_mb -gt $RSS_LIMIT_MB ]]; then echo "❌ soak: RSS growth $delta_mb MB > $RSS_LIMIT_MB MB"; exit 3; fi
echo "✅ soak PASS"


