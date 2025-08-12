#!/usr/bin/env bash

set -euo pipefail

# REKTRACE — REVERT to real feed (ethereum focus), keep guards, safe backup + reload

need(){ command -v "$1" >/dev/null 2>&1 || { echo "❌ need $1"; exit 1; }; }
need node; need pm2; need curl

[ -f .env.prod ] || { echo "❌ .env.prod missing"; exit 1; }

# Timestamp (Git-Bash safe) via Node
TS=$(node -e "const d=new Date();const p=n=>String(n).padStart(2,'0');const s=d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'_'+p(d.getHours())+p(d.getMinutes())+p(d.getSeconds());console.log(s)")
cp .env.prod ".env.prod.bak.$TS" || true

# Safe upsert (regex-free)
up(){ node -e 'const fs=require("fs");let t=fs.readFileSync(".env.prod","utf8");const k=process.argv[1],v=process.argv[2];const a=t.split(/\r?\n/);let f=0;for(let i=0;i<a.length;i++){if(a[i].startsWith(k+"=")){a[i]=k+"="+v;f=1;break;}}if(f===0)a.push(k+"="+v);fs.writeFileSync(".env.prod",a.join("\n"));' "$1" "$2"; }

echo "== posture: real feed on ethereum only, guards ON =="
up DEMO_MODE false
up SIGNALS_ENABLED true
up SIGNALS_BROADCAST_ENABLED true
up SIGNALS_SOURCE poll
up SIGNALS_POLL_MS 5000
up SIGNALS_CHAINS ethereum
up SIGNALS_WS_ENABLED false

# Guards
up SIGNALS_POST_BUDGET_ENABLED true
up SIGNALS_POST_MAX_PER_HOUR 4
up SIGNALS_POST_MAX_PER_DAY 50
up SIGNALS_POST_COOLDOWN_MS 20000
up SIGNALS_QUIET_ENABLED true
up SIGNALS_QUIET_WINDOW_UTC 00:00-06:00
up SIGNALS_EMERGENCY_MUTE false

echo "== reload =="
chmod +x ops/pm2_reload.sh 2>/dev/null || true
bash ops/pm2_reload.sh || pm2 reload rektrace --update-env || pm2 reload all --update-env || true

HP=$(grep -E '^HEALTH_PORT=' .env.prod | cut -d= -f2- || echo 8081)
case "$HP" in ''|*[!0-9]*) HP=8081 ;; esac
echo "backup: .env.prod.bak.$TS"
echo "base: http://127.0.0.1:$HP"

# Buffered probe
PROBE_MAX_ATTEMPTS=30 PROBE_SLEEP_SECS=1 HEALTH_PORT="$HP" bash scripts/health_probe.sh || true


