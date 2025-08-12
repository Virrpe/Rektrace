#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "[1/8] Checking Node.js version..."
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Please install Node 20 LTS."; exit 1
fi
NODEVER=$(node -v | sed 's/^v//')
NODEMAJOR=${NODEVER%%.*}
if [ "${NODEMAJOR}" -lt 20 ]; then
  echo "Detected Node ${NODEVER}. Please use Node 20 LTS."; exit 1
fi

echo "[2/8] Activating pnpm via corepack (safe if already active)..."
corepack enable >/dev/null 2>&1 || true
corepack prepare pnpm@latest --activate >/dev/null 2>&1 || true

echo "[3/8] Installing dependencies (pnpm i)..."
pnpm i

echo "[4/8] Bootstrapping .env.prod (backup + defaults)..."
node scripts/env_bootstrap.cjs --fix || RC=$? || true
RC=${RC:-0}
if [ "$RC" -eq 2 ]; then
  echo "Missing required keys. Please edit .env.prod and provide TELEGRAM_BOT_TOKEN and ADMIN_IDS."
  ${EDITOR:-vi} .env.prod || true
  exit 2
fi
if [ "$RC" -ne 0 ]; then
  echo "Environment bootstrap failed."; exit 1
fi

echo "[5/8] Building project (includes RugScan target)..."
pnpm run -s build

echo "[6/8] Starting bot (single process)..."
DIST="dist/rektrace-rugscan/rektrace-rugscan/src/index.js"
if [ ! -f "$DIST" ]; then echo "Build artifact not found: $DIST"; exit 1; fi
node "$DIST" &
BOT_PID=$!

trap 'kill "$BOT_PID" 2>/dev/null || true' EXIT

echo "[7/8] Probing health at /live (10 retries x 2s)..."
PORT=8081
if grep -q '^HEALTH_PORT=' .env.prod 2>/dev/null; then
  PORT=$(grep '^HEALTH_PORT=' .env.prod | head -n1 | cut -d= -f2)
fi
PROBEURL="http://127.0.0.1:${PORT}/live"
ok=false
for i in {1..10}; do
  if curl -fsS "$PROBEURL" >/dev/null 2>&1; then ok=true; break; fi
  sleep 2
done
if [ "$ok" != true ]; then
  echo "Health probe failed. Check the bot process logs above."; exit 1
fi

echo "[8/8] Ready."
cat <<EOF
Next steps:
 - DM your bot in Telegram: /start, /help, /scan ink:<token>, /scan_plus ink:<token>, /snipers ink:<token>, /sniper 0x<addr>
 - Visit http://127.0.0.1:${PORT}/status and /metrics
 - To stop: Ctrl+C in this window
EOF

wait "$BOT_PID"


