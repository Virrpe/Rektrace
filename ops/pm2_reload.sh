#!/usr/bin/env bash
set -euo pipefail

# Source env if present so PM2 reload picks up changes
if [ -f .env.prod ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.prod || true
  set +a
fi

ECOSYS=""
if [ -f ecosystem.config.cjs ]; then ECOSYS=ecosystem.config.cjs; fi
if [ -z "$ECOSYS" ] && [ -f ecosystem.config.js ]; then ECOSYS=ecosystem.config.js; fi

if [ -n "$ECOSYS" ]; then
  pm2 reload "$ECOSYS" --update-env || pm2 restart rektrace --update-env || true
else
  pm2 restart rektrace --update-env || true
fi


