#!/usr/bin/env bash

# REKTRACE — Telegram “make it actually talk” (DM + optional channel)
# Safe: backs up .env.prod, never prints the token, Git-Bash friendly.

set -euo pipefail

need() { command -v "$1" >/dev/null 2>&1 || { echo "❌ need $1"; exit 1; }; }
need node; need pnpm; need pm2; : >/dev/null

[ -f .env.prod ] || { echo "❌ .env.prod missing"; exit 1; }

# Config via env vars (override as needed)
CHANNEL_ID="${CHANNEL_ID:-}"
MY_ID="${ADMIN_ID:-1477488882}"

# Backup env (timestamp works on Windows/macOS/Linux)
TS=$({ date +%Y%m%d_%H%M%S 2>/dev/null || powershell -NoP -C "(Get-Date).ToString('yyyyMMdd_HHmmss')" ; })
cp .env.prod ".env.prod.bak.$TS"

# tiny env upsert (regex-free)
upsert() {
  node -e 'const fs=require("fs");const p=".env.prod";let t=fs.readFileSync(p,"utf8");const k=process.argv[1],v=process.argv[2];const a=t.split(/\r?\n/);let f=0;for(let i=0;i<a.length;i++){if(a[i].startsWith(k+"=")){a[i]=k+"="+v;f=1;break;}}if(f===0)a.push(k+"="+v);fs.writeFileSync(p,a.join("\n"));' "$1" "$2"
}

echo "== 1) turn Telegram path ON and relax guards for testing =="
upsert HTTP_ONLY false
case "$MY_ID" in ''|*[!0-9]*) echo "❌ Replace MY_ID with your numeric Telegram ID (use @userinfobot)"; exit 1;; esac
upsert ADMIN_IDS "$MY_ID"
upsert SIGNALS_QUIET_ENABLED false
upsert SIGNALS_EMERGENCY_MUTE false
# leave broadcast posture as-is; to test DM only, uncomment:
# upsert SIGNALS_BROADCAST_ENABLED false

echo "== 2) reload server =="
chmod +x ops/pm2_reload.sh 2>/dev/null || true
bash ops/pm2_reload.sh

echo "== 3) read token (no printing) + clear webhook =="
TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env.prod | sed -E 's/^TELEGRAM_BOT_TOKEN=//') || true
[ -n "$TOKEN" ] || { echo "❌ TELEGRAM_BOT_TOKEN not set in .env.prod"; exit 1; }
curl -sS "https://api.telegram.org/bot${TOKEN}/deleteWebhook" >/dev/null || true

echo "== 4) bot username (for DM) =="
ME=$(curl -sS "https://api.telegram.org/bot${TOKEN}/getMe" || true)
USER=$(printf "%s" "$ME" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')
[ -n "$USER" ] && echo "👉 DM this bot: @$USER" || echo "⚠️ Couldn’t read bot username; still DM the bot you created."

echo "== 5) direct test DM =="
curl -sS -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": ${MY_ID}, \"text\": \"✅ rektrace is live. Reply /signals_now here to test.\"}" >/dev/null || true
echo "📨 Sent DM to ${MY_ID} (open Telegram and check)."

echo "== 6) optional channel post =="
if [ -n "$CHANNEL_ID" ]; then
  upsert SIGNALS_CHANNEL_ID "$CHANNEL_ID"
  bash ops/pm2_reload.sh
  curl -sS -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\": ${CHANNEL_ID}, \"text\": \"✅ rektrace channel test: hello from the bot\"}" >/dev/null || true
  echo "📣 Tried posting to channel ${CHANNEL_ID}. Ensure the bot is an ADMIN with post permission."
fi

echo "== 7) health =="
HP=$(grep -E '^HEALTH_PORT=' .env.prod | cut -d= -f2- || echo 8081)
HEALTH_PORT="$HP" PROBE_MAX_ATTEMPTS=30 PROBE_SLEEP_SECS=1 bash scripts/health_probe.sh

echo "Backup: .env.prod.bak.$TS"
echo "Next in Telegram: open @$USER and send /signals_now  (then /signals_auto to toggle auto-posting)"


