#!/usr/bin/env bash
set -euo pipefail

SECRETS=ops/secrets.local.json
ENV_FILE=.env.prod

if [[ ! -f "$SECRETS" ]]; then
  echo "❌ Missing $SECRETS. Copy ops/secrets.local.example.json and fill real values."
  exit 1
fi

TS=$(date +%Y%m%d_%H%M%S)
if [[ -f "$ENV_FILE" ]]; then
  cp "$ENV_FILE" "${ENV_FILE}.bak.${TS}"
  echo "Backup: ${ENV_FILE}.bak.${TS}"
fi

echo "Generating $ENV_FILE from $SECRETS (preset=live)"
PRESET=live pnpm -s run env:gen | cat

echo "Done. Validate with: head -n 20 $ENV_FILE"
echo "→ Next: bash ops/pm2_reload.sh"


