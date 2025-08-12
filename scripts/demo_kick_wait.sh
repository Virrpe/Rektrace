#!/usr/bin/env bash

set -euo pipefail

# REKTRACE — DEMO KICK + WAIT UNTIL READY (then you run /signals_now)

need(){ command -v "$1" >/dev/null 2>&1 || { echo "❌ need $1"; exit 1; }; }
need node; need pm2; need curl

[ -f .env.prod ] || { echo "❌ .env.prod missing"; exit 1; }

# Safe upsert helper (regex-free)
up(){ node -e 'const fs=require("fs");let t=fs.readFileSync(".env.prod","utf8");const k=process.argv[1],v=process.argv[2];const a=t.split(/\r?\n/);let f=0;for(let i=0;i<a.length;i++){if(a[i].startsWith(k+"=")){a[i]=k+"="+v;f=1;break;}}if(f===0)a.push(k+"="+v);fs.writeFileSync(".env.prod",a.join("\n"));' "$1" "$2"; }

# Backup
TS=$({ date +%Y%m%d_%H%M%S 2>/dev/null || powershell -NoP -C "(Get-Date).ToString('yyyyMMdd_HHmmss')" ; })
cp .env.prod ".env.prod.bak.$TS" || true
echo "🔐 backup: .env.prod.bak.$TS"

# DEMO posture, compute ON, broadcast ON, blockers OFF
up DEMO_MODE true
up SIGNALS_ENABLED true
up SIGNALS_BROADCAST_ENABLED true
up SIGNALS_SOURCE poll
up SIGNALS_POLL_MS 5000
up SIGNALS_CHAINS "ink,ethereum"
up SIGNALS_WS_ENABLED false
up SIGNALS_QUIET_ENABLED false
up SIGNALS_POST_BUDGET_ENABLED false
up SIGNALS_EMERGENCY_MUTE false

# Reload
chmod +x ops/pm2_reload.sh 2>/dev/null || true
bash ops/pm2_reload.sh || pm2 reload all --update-env || true

# Health
HP=$(grep -E '^HEALTH_PORT=' .env.prod | cut -d= -f2- || echo 8081)
BASE="http://127.0.0.1:${HP}"
echo "💚 Health: $BASE/live $(curl -s -o /dev/null -w '%{http_code}' "$BASE/live")  |  $BASE/ready $(curl -s -o /dev/null -w '%{http_code}' "$BASE/ready")"

echo "⏳ priming demo signals (up to 90s)…"
ready=0
for i in 1 2 3 4 5 6 7 8 9; do
  M=$(curl -fsS "$BASE/metrics" || true)
  ticks=$(echo "$M" | grep -o '"signals_ticks_total":[0-9]\+' | head -1 | cut -d: -f2)
  emitted=$(echo "$M" | grep -o '"signals_emitted_total":[0-9]\+' | head -1 | cut -d: -f2)
  [ -z "$ticks" ] && ticks=0; [ -z "$emitted" ] && emitted=0
  echo "  [$i/9] ticks=$ticks emitted=$emitted"
  if [ "$ticks" -gt 0 ] || [ "$emitted" -gt 0 ]; then ready=1; break; fi
  sleep 10
done

if [ "$ready" -eq 1 ]; then
  echo "✅ demo signals ready → open Telegram DM and type: /signals_now"
else
  echo "❌ still flat after 90s. Check: pm2 logs rektrace --lines 200 | tail -n 40"
  exit 1
fi


