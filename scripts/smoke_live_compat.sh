#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://127.0.0.1:${HEALTH_PORT:-8081}}"
fail=0

code_time=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" "$BASE/status" || echo "000 0"); echo "status  $code_time"; [ "${code_time%% *}" = "200" ] || fail=1
code_time=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" "$BASE/metrics" || echo "000 0"); echo "metrics $code_time"; [ "${code_time%% *}" = "200" ] || fail=1

resp=$(curl -sS "$BASE/status/public" || true); [ -n "$resp" ] || fail=1

cl=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/live"  || echo 000)
cr=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/ready" || echo 000)
echo "live:$cl ready:$cr"; [ "$cl" = "200" ] || fail=1; [ "$cr" = "200" ] || fail=1

exit $fail

#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://127.0.0.1:${HEALTH_PORT:-3000}}"
fail=0

echo "→ BASE=$BASE"

# /status
ct=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" "$BASE/status" || echo "000 0")
echo "status  $ct"
[ "${ct%% *}" = "200" ] || fail=1

# /metrics
ct=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" "$BASE/metrics" || echo "000 0")
echo "metrics $ct"
[ "${ct%% *}" = "200" ] || fail=1

# /status/public signals approx length (jq-free)
resp=$(curl -sS "$BASE/status/public" || true)
if [ -n "$resp" ]; then
  sigs=$(printf '%s' "$resp" | tr -d '\n' | grep -o '"symbol":"' | wc -l | tr -d ' ')
  echo "signals≈ $sigs"
else
  echo "status/public failed"
  fail=1
fi

# /live + /ready
cl=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/live"  || echo 000)
cr=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/ready" || echo 000)
echo "live:$cl ready:$cr"
[ "$cl" = "200" ] || fail=1
[ "$cr" = "200" ] || fail=1

exit $fail
