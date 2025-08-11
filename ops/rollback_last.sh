#!/usr/bin/env bash
set -euo pipefail

last=$(ls -1t release_artifacts/rektrace-*.tar.gz 2>/dev/null | head -n1 || true)
if [[ -z "$last" ]]; then
  echo "[rollback] No release tarball found in release_artifacts/" >&2
  exit 2
fi

read -r -p "Rollback to $(basename "$last")? [y/N] " ans
if [[ "${ans:-}" != "y" && "${ans:-}" != "Y" ]]; then
  echo "Aborted."
  exit 1
fi

echo "[rollback] Stopping current processes"
pm2 delete rektrace-canary || true
pm2 delete rektrace || true

tmpdir=$(mktemp -d)
tar -xzf "$last" -C "$tmpdir"
bundle_dir=$(find "$tmpdir" -maxdepth 2 -type d -name "rektrace-*" | head -n1)
if [[ -z "$bundle_dir" ]]; then
  echo "[rollback] Invalid bundle" >&2
  exit 3
fi

echo "[rollback] Starting from bundle using existing .env.prod"
HEALTH_PORT=${HEALTH_PORT:-3000} pm2 start ecosystem.config.js --name rektrace --update-env || true
pm2 save

echo "[rollback] Rolled back to $(basename "$last") at $(date -Iseconds)"


