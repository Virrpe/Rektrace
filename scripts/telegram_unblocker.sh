#!/usr/bin/env bash

# TELEGRAM UNBLOCKER — make bot respond in DM, safely (Git-Bash safe, jq-free)
# Usage:
#   ADMIN_ID=123456789 bash scripts/telegram_unblocker.sh

set -euo pipefail

echo "== 0) sanity =="
(node -v; pnpm -v; pm2 -v) >/dev/null || { echo "❌ need node/pnpm/pm2"; exit 1; }
[ -f .env.prod ] || { echo "❌ .env.prod missing"; exit 1; }

echo "== 1) backup env =="
TS=$({ date +%Y%m%d_%H%M%S 2>/dev/null || powershell -NoP -C "(Get-Date).ToString('yyyyMMdd_HHmmss')" ; })
cp .env.prod ".env.prod.bak.$TS"
echo "backup: .env.prod.bak.$TS"

echo "== 2) configure env (HTTP_ONLY=false, quiet/mute off for test, ADMIN_IDS) =="
upsert_kv(){ node -e 'const fs=require("fs");const p=".env.prod";let t=fs.readFileSync(p,"utf8");const k=process.argv[1],v=process.argv[2];const a=t.split(/\r?\n/);let f=0;for(let i=0;i<a.length;i++){if(a[i].startsWith(k+"=")){a[i]=k+"="+v;f=1;break;}}if(f===0)a.push(k+"="+v);fs.writeFileSync(p,a.join("\n"));' "$1" "$2"; }

upsert_kv HTTP_ONLY false
upsert_kv SIGNALS_QUIET_ENABLED false
upsert_kv SIGNALS_EMERGENCY_MUTE false

ADMIN_ID="${ADMIN_ID:-}"
case "$ADMIN_ID" in ''|*[!0-9]*) echo "❌ Set ADMIN_ID env var to your numeric Telegram id (use @userinfobot)"; exit 1;; esac
upsert_kv ADMIN_IDS "$ADMIN_ID"

echo "== 3) reload PM2 =="
chmod +x ops/pm2_reload.sh 2>/dev/null || true
bash ops/pm2_reload.sh

echo "== 4) prepare Telegram long-polling (clear webhook) =="
TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env.prod | sed -E 's/^TELEGRAM_BOT_TOKEN=//') || true
if [ -z "$TOKEN" ]; then echo "❌ TELEGRAM_BOT_TOKEN not set in .env.prod"; exit 1; fi
curl -sS "https://api.telegram.org/bot${TOKEN}/deleteWebhook" >/dev/null || true

echo "== 5) bot username (for DM) =="
ME=$(curl -sS "https://api.telegram.org/bot${TOKEN}/getMe" || true)
USER=$(printf "%s" "$ME" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')
if [ -n "$USER" ]; then echo "👉 DM this bot in Telegram: @${USER}"; else echo "⚠️ Could not read bot username; DM the bot you created with BotFather"; fi

echo "== 6) send test DM to admin =="
curl -sS -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": ${ADMIN_ID}, \"text\": \"✅ rektrace live: try /signals_now here\"}" >/dev/null || true
echo "📨 Sent a test DM to chat_id=${ADMIN_ID}"

echo "== 7) health (buffered) =="
HP=$(grep -E '^HEALTH_PORT=' .env.prod | cut -d= -f2- || echo 8081)
case "$HP" in ''|*[!0-9]*) HP=8081 ;; esac
PROBE_MAX_ATTEMPTS=30 PROBE_SLEEP_SECS=1 HEALTH_PORT="$HP" bash scripts/health_probe.sh

echo "Done. Backup: .env.prod.bak.$TS"


