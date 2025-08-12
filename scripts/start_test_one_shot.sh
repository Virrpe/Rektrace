#!/usr/bin/env bash

# REKTRACE-RUGSCAN — START & TEST (one-shot, safe)
# - build if needed
# - make sure HTTP_ONLY=true (so Telegram token not required)
# - compute ON, broadcast OFF (so it won't post yet)
# - start/reload with PM2 (CJS wrappers if present)
# - probe /live, /ready, /status/public, and show quick signals/metrics

set -euo pipefail
trap 'echo; echo "💥 Stopped. Check: pm2 logs rektrace --lines 200 | tail -n +80"; exit 1' ERR

echo "== 0) toolchain =="
(node -v; pnpm -v; pm2 -v) >/dev/null || { echo "❌ need node, pnpm, pm2"; exit 1; }

echo "== 1) env file =="
[ -f .env.prod ] || { echo "❌ .env.prod missing (run PRESET=demo|live pnpm run env:gen)"; exit 1; }

echo "== 2) helpers (backup + upsert) =="
backup_env() { TS=$({ date +%Y%m%d_%H%M%S 2>/dev/null || powershell -NoP -C "(Get-Date).ToString('yyyyMMdd_HHmmss')" ; } ); cp .env.prod ".env.prod.bak.$TS"; echo "$TS"; }
upsert() { # $1 key, $2 value — robust (no regex), Git-Bash safe
  node -e 'const fs=require("fs");const p=".env.prod";let t=fs.readFileSync(p,"utf8");const key=process.argv[1];const val=process.argv[2];const lines=t.split(/\r?\n/);let found=false;for(let i=0;i<lines.length;i++){if(lines[i].startsWith(key+"=")){lines[i]=key+"="+val;found=true;break;}}if(!found){lines.push(key+"="+val);}fs.writeFileSync(p,lines.join("\n"));' "$1" "$2"
}

echo "== 3) safe test posture (backup → set flags) =="
TS=$(backup_env); echo "backup: .env.prod.bak.$TS"
upsert HTTP_ONLY true
upsert SIGNALS_ENABLED true
upsert SIGNALS_BROADCAST_ENABLED false
upsert DEMO_MODE false

echo "== 4) build (idempotent) =="
pnpm -s run rugscan:build || pnpm -s run build

echo "== 5) start/reload under PM2 =="
chmod +x ops/pm2_start.sh ops/pm2_reload.sh scripts/health_probe.sh 2>/dev/null || true
if pm2 jlist | grep -q '"name":"rektrace"'; then
  bash ops/pm2_reload.sh
else
  if [ -f ops/pm2_start.sh ]; then bash ops/pm2_start.sh; else
    if [ -f ecosystem.config.cjs ]; then pm2 start ecosystem.config.cjs --update-env --name rektrace
    else pm2 start dist/rektrace-rugscan/rektrace-rugscan/src/index.js --update-env --name rektrace
    fi
    pm2 save || true
  fi
fi

echo "== 6) health probe =="
HP=$(grep -E '^HEALTH_PORT=' .env.prod | cut -d= -f2- || true); case "$HP" in ''|*[!0-9]*) HP=8081 ;; esac
HEALTH_PORT="$HP" PROBE_MAX_ATTEMPTS=30 PROBE_SLEEP_SECS=1 bash scripts/health_probe.sh

echo "== 7) quick smoke (jq-free) =="
BASE="http://127.0.0.1:${HP}"
curl -s -o /dev/null -w "status:%{http_code}\n"  "$BASE/status"
curl -s -o /dev/null -w "metrics:%{http_code}\n" "$BASE/metrics"
curl -s -o /dev/null -w "live:%{http_code} ready:%{http_code}\n" "$BASE/live" "$BASE/ready"

echo "== 8) signals snapshot with progress (≤90s) =="
max=90
sec=0
fullBar='####################'
filler='....................'
moved=0
while [ $sec -lt $max ]; do
  sec=$((sec+1))
  M="$(curl -fsS --max-time 1 "$BASE/metrics" || true)"
  ticks="$(echo "$M" | grep -o '"signals_ticks_total":[0-9]\+' | head -1 | cut -d: -f2)";    [ -z "$ticks" ] && ticks=0
  emitted="$(echo "$M" | grep -o '"signals_emitted_total":[0-9]\+' | head -1 | cut -d: -f2)"; [ -z "$emitted" ] && emitted=0
  SP="$(curl -fsS --max-time 1 "$BASE/status/public" 2>/dev/null || true)"
  sigs="$(echo "$SP" | tr -d '\n' | grep -o '"symbol":"' | wc -l | tr -d ' ')";              [ -z "$sigs" ] && sigs=0
  doneCols=$((sec * 20 / max)); [ $doneCols -gt 20 ] && doneCols=20
  barDone=${fullBar:0:$doneCols}
  barRest=$((20 - doneCols))
  barFill=${filler:0:$barRest}
  printf "\r  [verify %02ds/%ds] [%s%s] ticks=%s emitted=%s sigs≈%s" "$sec" "$max" "$barDone" "$barFill" "$ticks" "$emitted" "$sigs"
  if [ "$ticks" -gt 0 ] || [ "$emitted" -gt 0 ] || [ "$sigs" -gt 0 ]; then moved=1; break; fi
  sleep 1
done
echo

echo "== 9) summary =="
echo "BASE=$BASE"
if [ $moved -eq 1 ]; then
  echo "✅ compute ON, broadcast OFF — signals moving. Test HTTP right now at:"
  echo "  $BASE/status/public"
  echo "  $BASE/metrics"
else
  echo "⚠️ signals flat (can happen). Check after a few minutes or run: pm2 logs rektrace --lines 200 | tail -n +80"
fi

echo "== 10) next steps (manual) =="
echo "• To start posting later (guarded): enable broadcast and reload."
echo "• To watch logs: pm2 logs rektrace --lines 200 | tail -n +80"


