#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${VERSION:-}" ]]; then
  VERSION=$(node -p "require('./package.json').version")
fi

ROOT=$(pwd)
OUT_DIR=release_artifacts/rektrace-${VERSION}

pnpm i --frozen-lockfile
pnpm run build
bash scripts/sbom.sh

# Boot demo briefly to capture fingerprint
PORT=${PORT:-0}
HEALTH_PORT=${HEALTH_PORT:-3000} DEMO_MODE=true HTTP_ONLY=true node dist/rektrace-rugscan/rektrace-rugscan/src/index.js &
PID=$!
sleep 0.3 || true
FP=$(curl -fsS "http://127.0.0.1:${HEALTH_PORT}/status?verbose=1" | jq -r '.config.fingerprint_sha256 // empty' || true)
kill $PID >/dev/null 2>&1 || true

mkdir -p "$OUT_DIR"

# Copy artifacts
cp -r dist "$OUT_DIR/"
cp -r docs "$OUT_DIR/" || true
cp -r ops/nginx.example.conf "$OUT_DIR/" || true
cp -r Dockerfile docker-compose.example.yml "$OUT_DIR/" || true
cp -r README_PRELAUNCH.md "$OUT_DIR/" || true
cp -r OPERATIONS.md "$OUT_DIR/RUNBOOK.md" || true
cp -r sbom.deps.json "$OUT_DIR/" || true

# Fingerprint & commit hash
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "nogit")
{
  echo "fingerprint_sha256=${FP:-unknown}"
  echo "git=${GIT_SHA}"
  echo "built_at=$(date -Iseconds)"
} > "$OUT_DIR/FINGERPRINT.txt"

TAR=release_artifacts/rektrace-${VERSION}.tar.gz
tar -czf "$TAR" -C release_artifacts "rektrace-${VERSION}"
echo "$TAR"

# Write SHA256SUMS.txt
SUMFILE=$(dirname "$TAR")/SHA256SUMS.txt
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$TAR" > "$SUMFILE"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$TAR" > "$SUMFILE"
else
  echo "Checksum tools not found; skipping SHA256SUMS.txt" >&2
fi

# Build info
BNFO="$OUT_DIR/BUILDINFO.txt"
{
  echo "version=${VERSION}"
  echo "git=${GIT_SHA}"
  echo "built_at=$(date -Iseconds)"
  echo "node=$(node -v)"
  echo "pnpm=$(pnpm -v)"
} > "$BNFO"



