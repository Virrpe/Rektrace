#!/usr/bin/env bash
set -euo pipefail

# Verify that ecosystem.config.cjs points PM2 script to the canonical build output
# Expected: script: 'dist/rektrace-rugscan/rektrace-rugscan/src/index.js'

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

EXPECTED="dist/rektrace-rugscan/rektrace-rugscan/src/index.js"

CONF="ecosystem.config.cjs"
if [ ! -f "$CONF" ]; then
  echo "Missing $CONF" >&2
  exit 2
fi

# Grep the script value (allow spaces, quotes). Use node to robustly parse CJS via require if available.
ACTUAL=$(node -e "const c=require('./$CONF');console.log((c.apps&&c.apps[0]&&c.apps[0].script)||'')" 2>/dev/null || true)

if [ -z "$ACTUAL" ]; then
  # Fallback: try grep
  ACTUAL=$(grep -E "script:\s*'[^']+'" "$CONF" | head -n1 | sed -E "s/.*script:\s*'([^']+)'.*/\1/")
fi

if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "PM2 script drift detected:" >&2
  echo "  expected: $EXPECTED" >&2
  echo "  found:    ${ACTUAL:-<none>}" >&2
  exit 1
fi

echo "PM2 script OK: $EXPECTED"


