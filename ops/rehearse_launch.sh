#!/usr/bin/env bash
set -euo pipefail

echo "[rehearsal] 1) Verify"
pnpm run verify

echo "[rehearsal] 2) Docker rehearsal (compose up)"
docker compose -f docker-compose.example.yml up -d --build

BASE=${BASE_URL:-http://127.0.0.1:${PORT:-8080}}
echo "[rehearsal] Waiting for /ready"
for i in {1..20}; do
  if curl -fsS "${BASE}/ready" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "${BASE}/ready" >/dev/null

echo "[rehearsal] Synthetic probe"
pnpm run synthetic:probe

echo "[rehearsal] Docker down"
docker compose -f docker-compose.example.yml down -v || true

echo "[rehearsal] 3) Host canary"
pnpm run canary:live

echo "✅ Rehearsal complete. Next: pnpm run go:live && pnpm run watch:post"


