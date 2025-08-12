#!/usr/bin/env bash
set -euo pipefail

# Package RugScan release artifacts into release/rektrace-rugscan-<shortsha>.tar.gz
# - Runs the RugScan build that produces dist/rektrace-rugscan/rektrace-rugscan/src/index.js
# - Packages ONLY the RugScan dist subtree + PM2 ecosystem file + ops scripts + health probe + minimal release README
# - Excludes root dist/** to avoid duplicate artifacts

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi

SHORT_SHA=$(git rev-parse --short HEAD)
OUT_DIR="release"
TARBALL="$OUT_DIR/rektrace-rugscan-$SHORT_SHA.tar.gz"

mkdir -p "$OUT_DIR"

echo "[package] Building RugScan…"
# Use existing RugScan build command
pnpm run build:rugscan >/dev/null

# Verify expected entrypoint exists
ENTRY="dist/rektrace-rugscan/rektrace-rugscan/src/index.js"
if [ ! -f "$ENTRY" ]; then
  echo "Expected entrypoint not found: $ENTRY" >&2
  exit 2
fi

# Ensure minimal release README exists (regenerate each time for clarity)
cat > "$OUT_DIR/README.md" <<'EOF'
RekTrace RugScan — Production Release

Contents:
- dist/rektrace-rugscan/** (compiled RugScan service)
- ecosystem.config.cjs (PM2 config)
- ops/pm2_start.sh, ops/pm2_reload.sh (PM2 helpers)
- scripts/health_probe.sh (basic health check)

Run (PM2):
1) Ensure environment exported (e.g., source .env.prod) and PM2 installed
2) pm2 start ecosystem.config.cjs --update-env --name rektrace

Health endpoints:
- GET /live, /ready, /status, /metrics on $HEALTH_PORT (default 8081)

Notes:
- PM2 script must point to dist/rektrace-rugscan/rektrace-rugscan/src/index.js
- Signals remain OFF by default for MVP
EOF

echo "[package] Creating tarball $TARBALL"

# Create tarball with explicit paths to avoid including root dist/**
tar -czf "$TARBALL" \
  --mtime='UTC 2020-01-01' \
  --owner=0 --group=0 \
  dist/rektrace-rugscan \
  ecosystem.config.cjs \
  ops/pm2_start.sh \
  ops/pm2_reload.sh \
  scripts/health_probe.sh \
  release/README.md

echo "[package] Wrote $TARBALL"


