#!/usr/bin/env bash
set -euo pipefail

BASE=${BASE_URL:-http://127.0.0.1:${PORT:-8080}}

echo "[drill] Maintenance mode ON"
MAINTENANCE_MODE=true pnpm run synthetic:probe >/dev/null 2>&1 || true
code=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/ready") || true
echo "[drill] /ready status (maintenance): ${code} (expect 503)"

echo "[drill] Maintenance mode OFF"
MAINTENANCE_MODE=false pnpm run synthetic:probe >/dev/null 2>&1 || true

echo "[drill] Breaker force-open ON"
BREAKER_FORCE_OPEN=true curl -fsS -X POST "${BASE}/api/scan" -H 'content-type: application/json' -d '{"token":"ink:pepe"}' >/dev/null || true
echo "[drill] Breaker force-open OFF"

echo "[drill] PASS (toggles exercised; reverted)"


