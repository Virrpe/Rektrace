#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/deploy_live.sh [env_json=ops/secrets.local.json]
# - Generates .env.prod from ops JSON
# - Builds project
# - Starts pm2 with live settings

ENV_JSON=${1:-ops/secrets.local.json}

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Install pnpm first." >&2
  exit 1
fi

echo "[deploy] Generating .env.prod from ${ENV_JSON}"
pnpm run env:gen

echo "[deploy] Building..."
pnpm build
pnpm rugscan:build || true # ensure subproject build

echo "[deploy] Starting pm2 via ecosystem.config.js..."
export DOTENV_CONFIG_PATH=.env.prod
# Export .env.prod into environment so Node sees vars (project loads dotenv for .env by default)
if [ -f .env.prod ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.prod
  set +a
fi
if command -v pm2 >/dev/null 2>&1; then
  pm2 start ecosystem.config.js --update-env || pm2 restart ecosystem.config.js --update-env
  pm2 save || true
else
  echo "pm2 not installed; starting foreground process (CTRL+C to stop)" >&2
  node dist/rektrace-rugscan/rektrace-rugscan/src/index.js
fi

echo "[deploy] Done. Hit /status, /metrics on HEALTH_PORT."


