#!/usr/bin/env bash
set -euo pipefail

# Source env if present so PM2 inherits runtime ports
if [ -f .env.prod ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.prod || true
  set +a
fi

APP_NAME=${APP_NAME:-rektrace}

ECOSYS=""
# canonical: ecosystem.config.cjs (ecosystem.config.js is archived under archive/config/)
if [ -f ecosystem.config.cjs ]; then ECOSYS=ecosystem.config.cjs; fi
if [ -z "$ECOSYS" ] && [ -f ecosystem.config.js ]; then ECOSYS=ecosystem.config.js; fi

if [ -n "$ECOSYS" ]; then
  pm2 start "$ECOSYS" --update-env --name "$APP_NAME" || true
fi

if ! pm2 list | grep -q "$APP_NAME"; then
  pm2 start dist/rektrace-rugscan/rektrace-rugscan/src/index.js --name "$APP_NAME" --update-env
fi

pm2 save || true


