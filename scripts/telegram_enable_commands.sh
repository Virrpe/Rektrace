#!/usr/bin/env bash

# REKTRACE — Make Telegram commands respond now (DM safe, Git-Bash safe)
set -euo pipefail

need(){ command -v "$1" >/dev/null 2>&1 || { echo "❌ need $1"; exit 1; }; }
need node; need pm2; need curl

[ -f .env.prod ] || { echo "❌ .env.prod missing"; exit 1; }

# If your Telegram numeric ID is different, set ADMIN_ID=123456789 before running
ADMIN_ID="${ADMIN_ID:-1477488882}"

# Helper: KEY=VALUE upsert into .env.prod (regex-free)
up(){ node -e 'const fs=require("fs");let t=fs.readFileSync(".env.prod","utf8");const k=process.argv[1],v=process.argv[2];const a=t.split(/\r?\n/);let f=0;for(let i=0;i<a.length;i++){if(a[i].startsWith(k+"=")){a[i]=k+"="+v;f=1;break;}}if(f===0)a.push(k+"="+v);fs.writeFileSync(".env.prod",a.join("\n"));' "$1" "$2"; }

# Backup
TS=$({ date +%Y%m%d_%H%M%S 2>/dev/null || powershell -NoP -C "(Get-Date).ToString('yyyyMMdd_HHmmss')" ; })
cp .env.prod ".env.prod.bak.$TS" || true

echo "== enabling Telegram path and admin auth =="
up HTTP_ONLY false
up ADMIN_IDS "$ADMIN_ID"

echo "== enable compute + allow /signals_now (broadcast guarded by budgets/quiet; leave ON for test) =="
up SIGNALS_ENABLED true
up SIGNALS_BROADCAST_ENABLED true
up SIGNALS_SOURCE poll
up SIGNALS_POLL_MS 5000
up SIGNALS_CHAINS "ink,ethereum"
up SIGNALS_WS_ENABLED false

echo "== remove blockers for testing (you can re-enable later) =="
up SIGNALS_QUIET_ENABLED false
up SIGNALS_EMERGENCY_MUTE false

echo "== reload service with new env =="
chmod +x ops/pm2_reload.sh 2>/dev/null || true
bash ops/pm2_reload.sh

# Health sanity
HP=$(grep -E '^HEALTH_PORT=' .env.prod | cut -d= -f2- || echo 8081)
curl -fsS "http://127.0.0.1:$HP/live" >/dev/null && echo "💚 /live ok" || echo "⚠️ /live check failed"
curl -fsS "http://127.0.0.1:$HP/ready" >/dev/null && echo "💚 /ready ok" || echo "⚠️ /ready check failed"

# Telegram token (we never print it)
TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env.prod | sed -E 's/^TELEGRAM_BOT_TOKEN=//' || true)
[ -n "$TOKEN" ] || { echo "❌ TELEGRAM_BOT_TOKEN missing in .env.prod"; exit 1; }

echo "== clear webhook (long polling) & set visible commands =="
curl -sS "https://api.telegram.org/bot${TOKEN}/deleteWebhook" >/dev/null || true

curl -sS -X POST "https://api.telegram.org/bot${TOKEN}/setMyCommands" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON' >/dev/null || true
{"commands":[
  {"command":"start","description":"Wake the bot"},
  {"command":"signals_now","description":"Show top signals now (admin)"},
  {"command":"signals_auto","description":"Toggle auto-post (admin)"},
  {"command":"scan","description":"Scan a token, e.g. /scan ink:pepe"},
  {"command":"top_ink","description":"Top ink tokens"}
]}
JSON

echo "== fetch @username and DM you a test =="
ME=$(curl -sS "https://api.telegram.org/bot${TOKEN}/getMe" || true)
USER=$(printf "%s" "$ME" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')
[ -n "${USER:-}" ] && echo "👉 Open: https://t.me/$USER" || echo "⚠️ Couldn’t read username; ensure you’re DM’ing the right bot."

RESP=$(curl -sS -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": ${ADMIN_ID}, \"text\": \"✅ Ready. Now send: /signals_now (exact slash command).\"}" || true)
echo "DM ok=$(printf "%s" "$RESP" | sed -n 's/.*"ok":\([^,}]*\).*/\1/p')"

echo "Backup saved: .env.prod.bak.$TS"

