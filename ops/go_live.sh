#!/usr/bin/env bash
set -euo pipefail

echo "[go-live] 1) Detecting public IP"
pnpm run ip:public || true
echo "[go-live] Add the IP in public_ip.txt to GoldRush + QuickNode allow-lists before proceeding."

echo "[go-live] 2) Generating live env (.env.prod)"
PRESET=live pnpm run env:gen

echo "[go-live] 3) Safe posture"
bash ops/safe_mode.sh || true

echo "[go-live] 4) Safety lint"
pnpm run env:lint

echo "[go-live] 5) Quick verify (build + tests + preflight)"
pnpm run build
pnpm run test
pnpm run preflight

echo "[go-live] 6) Canary with SLO gate"
pnpm run canary:live

echo "[go-live] 7) Start via PM2 wrappers + health probe"
bash ops/pm2_start.sh || true
bash ops/pm2_reload.sh || true
HEALTH_PORT=${HEALTH_PORT:-8081} bash scripts/health_probe.sh || true

echo "✅ Go-live complete. Post-launch watch: bash ops/watch_post_launch.sh"


