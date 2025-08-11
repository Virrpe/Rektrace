#!/usr/bin/env bash
set -euo pipefail

VERSION=${VERSION:-$(node -p "require('./package.json').version")}
OUT=${OUT:-release_artifacts/audit_pack-${VERSION}.zip}

STAGE=$(mktemp -d)
mkdir -p "$(dirname "$OUT")"

# Collect core files
cp -f sbom.deps.json "$STAGE/" 2>/dev/null || true

# Release artifacts
FOUND_DIR=$(ls -1d release_artifacts/rektrace-* 2>/dev/null | tail -n1 || true)
if [[ -n "$FOUND_DIR" ]]; then
  cp -f "$FOUND_DIR"/BUILDINFO.txt "$STAGE/" 2>/dev/null || true
  cp -f "$FOUND_DIR"/FINGERPRINT.txt "$STAGE/" 2>/dev/null || true
  cp -f release_artifacts/SHA256SUMS.txt "$STAGE/" 2>/dev/null || true
fi

# Latest perf baseline
BASELINE=$(ls -1t ops/baselines/perf_*.json 2>/dev/null | head -n1 || true)
if [[ -n "$BASELINE" ]]; then
  mkdir -p "$STAGE/baselines"
  cp -f "$BASELINE" "$STAGE/baselines/" || true
fi

# Fallback fingerprint from live status
if [[ ! -f "$STAGE/FINGERPRINT.txt" ]]; then
  if command -v curl >/dev/null 2>&1; then
    FP=$(curl -fsS http://127.0.0.1:8080/status?verbose=1 | jq -r '.config.fingerprint_sha256 // empty' 2>/dev/null || true)
    if [[ -n "$FP" ]]; then
      echo "fingerprint_sha256=${FP}" > "$STAGE/FINGERPRINT.txt"
    fi
  fi
fi

# Docs & configs
cp -f README_PRELAUNCH.md "$STAGE/" 2>/dev/null || true
cp -f RUNBOOK.md "$STAGE/" 2>/dev/null || true
cp -f OPERATIONS.md "$STAGE/" 2>/dev/null || true
cp -f SECURITY.md "$STAGE/" 2>/dev/null || true
cp -rf docs "$STAGE/docs" 2>/dev/null || true
mkdir -p "$STAGE/ops"
cp -f ops/nginx.example.conf "$STAGE/ops/" 2>/dev/null || true
cp -rf ops/monitors "$STAGE/ops/monitors" 2>/dev/null || true
cp -f Dockerfile "$STAGE/" 2>/dev/null || true
cp -f docker-compose.example.yml "$STAGE/" 2>/dev/null || true

# Create archive
if command -v zip >/dev/null 2>&1; then
  (cd "$STAGE" && zip -r "$(pwd)/../pack.zip" . >/dev/null)
  mv "$(dirname "$STAGE")/pack.zip" "$OUT"
  echo "$OUT"
else
  ALT=${OUT%.zip}.tar.gz
  tar -czf "$ALT" -C "$STAGE" .
  echo "$ALT"
fi


