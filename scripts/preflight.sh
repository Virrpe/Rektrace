#!/usr/bin/env bash
set -euo pipefail

PASS=true
warn() { echo "[preflight][WARN] $*"; }
fail() { echo "[preflight][FAIL] $*"; PASS=false; }
ok() { echo "[preflight][OK] $*"; }

# Tool versions
NODE_OK=$(node -v 2>/dev/null || echo "")
PNPM_OK=$(pnpm -v 2>/dev/null || echo "")
if [ -z "$NODE_OK" ]; then fail "Node not found"; else ok "Node $NODE_OK"; fi
if [ -z "$PNPM_OK" ]; then fail "pnpm not found"; else ok "pnpm $PNPM_OK"; fi

# Env file presence (no secrets printed)
if [ -f .env.prod ]; then ok ".env.prod present"; else warn ".env.prod missing (dev/demo only?)"; fi

# Flags compatibility
DEMO=${DEMO_MODE:-false}
HTTP_ONLY=${HTTP_ONLY:-false}
if [ "$DEMO" != "true" ] && [ "$HTTP_ONLY" = "true" ]; then warn "HTTP_ONLY=true with DEMO_MODE=false (no Telegram)"; fi

# API key presence for live POST
if [ "$DEMO" != "true" ]; then
  if [ -z "${RUGSCAN_API_KEY:-${API_KEY:-}}" ]; then warn "No API key set for live /api/scan POST; smoke will skip"; else ok "API key present"; fi
fi

# Required secrets existence (presence only)
if [ "$HTTP_ONLY" != "true" ] && [ "$DEMO" != "true" ]; then
  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then fail "TELEGRAM_BOT_TOKEN missing for live Telegram"; else ok "TELEGRAM_BOT_TOKEN present"; fi
fi

# .gitignore coverage
grep -qE '^\.env(\..*)?$' .gitignore && ok ".env covered in .gitignore" || warn ".env not covered in .gitignore"
grep -qE '^ops/secrets\.local\.json$' .gitignore && ok "ops secrets covered" || warn "ops secrets not ignored"
grep -qE '^dist/$' .gitignore && ok "dist ignored" || warn "dist not ignored"

# Port sanity
if [ -n "${PORT:-}" ] && [ -n "${HEALTH_PORT:-}" ] && [ "${PORT}" = "${HEALTH_PORT}" ]; then fail "PORT equals HEALTH_PORT"; else ok "Ports sane"; fi

# Optional Redis reachability (non-fatal)
if [ -n "${REDIS_URL:-}" ]; then
  node -e "import('ioredis').then(m=>{const r=new m.default(process.env.REDIS_URL);r.ping().then(()=>{console.log('redis ok');r.quit();}).catch(()=>{console.log('redis fail');});});" || true
fi

# Audit (non-fatal)
pnpm audit --prod || true

echo ""
if $PASS; then
  echo "[preflight] PASS"
  exit 0
else
  echo "[preflight] FAIL"
  exit 1
fi


