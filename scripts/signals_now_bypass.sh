#!/usr/bin/env bash

set -euo pipefail

need(){ command -v "$1" >/dev/null 2>&1 || { echo "❌ need $1"; exit 1; }; }
need node; need pm2; need curl

[ -f .env.prod ] || { echo "❌ .env.prod missing"; exit 1; }

# Backup
TS=$({ date +%Y%m%d_%H%M%S 2>/dev/null || powershell -NoP -C "(Get-Date).ToString('yyyyMMdd_HHmmss')" ; })
cp .env.prod ".env.prod.bak.$TS" || true

# Safe upsert (regex-free)
up(){ node -e 'const fs=require("fs");let t=fs.readFileSync(".env.prod","utf8");const k=process.argv[1],v=process.argv[2];const a=t.split(/\r?\n/);let f=0;for(let i=0;i<a.length;i++){if(a[i].startsWith(k+"=")){a[i]=k+"="+v;f=1;break;}}if(f===0)a.push(k+"="+v);fs.writeFileSync(".env.prod",a.join("\n"));' "$1" "$2"; }

echo "== enable core + bypass guards for /signals_now =="
up HTTP_ONLY false
up SIGNALS_ENABLED true
up SIGNALS_BROADCAST_ENABLED true
up SIGNALS_SOURCE poll
up SIGNALS_POLL_MS 5000
up SIGNALS_CHAINS "ink,ethereum"
up SIGNALS_WS_ENABLED false

# Bypass blockers
up SIGNALS_EMERGENCY_MUTE false
up SIGNALS_QUIET_ENABLED false
up SIGNALS_QUIET_ADMIN_OVERRIDE true
up SIGNALS_POST_BUDGET_ENABLED false
up SIGNALS_PARTNER_ALLOW_ENABLED false

echo "== reload =="
chmod +x ops/pm2_reload.sh 2>/dev/null || true
bash ops/pm2_reload.sh || pm2 reload all --update-env || true

HP=$(grep -E '^HEALTH_PORT=' .env.prod | cut -d= -f2- || echo 8081)
curl -fsS "http://127.0.0.1:$HP/ready" >/dev/null && echo "💚 ready" || echo "⚠️ not ready"

# DM nudge to admin
TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env.prod | sed -E 's/^TELEGRAM_BOT_TOKEN=//' || true)
AIDS=$(grep -E '^ADMIN_IDS=' .env.prod | sed -E 's/^ADMIN_IDS=//' | tr -d '"' || true)
AID=$(echo "$AIDS" | sed 's/,.*//' || true)
if [ -n "${TOKEN:-}" ] && echo "${AID:-}" | grep -Eq '^[0-9]+$'; then
  curl -sS "https://api.telegram.org/bot${TOKEN}/deleteWebhook" >/dev/null || true
  curl -sS -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\": ${AID}, \"text\": \"✅ Guards bypassed for /signals_now — try it now.\"}" >/dev/null || true
fi

echo "backup: .env.prod.bak.$TS"


