#!/usr/bin/env bash

set -euo pipefail

test -f .env.prod || { echo ".env.prod missing"; exit 1; }

# Read token and admin id without printing token
TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env.prod | sed -E 's/^TELEGRAM_BOT_TOKEN=//' || true)
if [ -z "$TOKEN" ]; then echo "❌ TELEGRAM_BOT_TOKEN not set in .env.prod"; exit 1; fi
AIDS=$(grep -E '^ADMIN_IDS=' .env.prod | sed -E 's/^ADMIN_IDS=//' | tr -d '"' || true)
AID=$(echo "$AIDS" | sed 's/,.*//' || true)
if ! echo "${AID:-}" | grep -Eq '^[0-9]+$'; then echo "❌ ADMIN_IDS missing/invalid in .env.prod"; exit 1; fi

# Clear webhook
curl -sS "https://api.telegram.org/bot${TOKEN}/deleteWebhook" >/dev/null || true

# getMe → username
ME=$(curl -sS "https://api.telegram.org/bot${TOKEN}/getMe" || true)
USER=$(printf "%s" "$ME" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')
echo "bot username: ${USER:-<unknown>}"
if [ -n "${USER:-}" ]; then echo "open: https://t.me/$USER (press Start)"; fi

# Send test DM
curl -sS -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": ${AID}, \"text\": \"rektrace live: send /signals_now\"}" >/dev/null || true
echo "sent DM to ${AID}"


