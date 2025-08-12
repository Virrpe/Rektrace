#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://127.0.0.1:${HEALTH_PORT:-3000}}"
attempts=9
count=0
ok=0

echo "BASE=$BASE"

while [ $count -lt $attempts ]; do
  count=$((count+1))
  M=$(curl -fsS "$BASE/metrics" || true)
  ticks=$(echo "$M" | grep -o '"signals_ticks_total":[0-9]\+' | head -1 | cut -d: -f2)
  emitted=$(echo "$M" | grep -o '"signals_emitted_total":[0-9]\+' | head -1 | cut -d: -f2)
  SP=$(curl -fsS "$BASE/status/public" 2>/dev/null || true)
  sigs=$(echo "$SP" | tr -d '\n' | grep -o '"symbol":"' | wc -l | tr -d ' ')
  [ -z "$ticks" ] && ticks=0
  [ -z "$emitted" ] && emitted=0
  [ -z "$sigs" ] && sigs=0
  echo "ticks=$ticks emitted=$emitted sigs_approx=$sigs"
  if [ "$ticks" -gt 0 ] || [ "$emitted" -gt 0 ] || [ "$sigs" -gt 0 ]; then ok=1; break; fi
  sleep 10
done

if [ "$ok" -eq 1 ]; then
  exit 0
else
  exit 1
fi
