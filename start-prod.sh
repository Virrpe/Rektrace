#!/usr/bin/env bash
set -euo pipefail
export DEMO_MODE=${DEMO_MODE:-false}
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
pnpm dev


