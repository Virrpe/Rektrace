#!/usr/bin/env bash
set -euo pipefail

echo "[go-live] 1) Detecting public IP"
pnpm run ip:public || true
echo "[go-live] Add the IP in public_ip.txt to GoldRush + QuickNode allow-lists before proceeding."

echo "[go-live] 2) Generating live env (.env.prod)"
PRESET=live pnpm run env:gen

echo "[go-live] 3) Safety lint"
pnpm run env:lint

echo "[go-live] 4) Quick verify (build + tests + preflight)"
pnpm run build
pnpm run test
pnpm run preflight

echo "[go-live] 5) Canary with SLO gate"
pnpm run canary:live

echo "✅ Go-live complete. Post-launch watch: bash ops/watch_post_launch.sh"


