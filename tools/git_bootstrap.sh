#!/usr/bin/env bash
set -euo pipefail

if ! command -v git >/dev/null 2>&1; then
  echo "git not found in PATH. Install git and re-run."
  exit 0
fi

if [ ! -d .git ]; then
  git init
  git add .
  git commit -m "chore: baseline + security hardening presets/ci/logmask/admin gate"
  git branch -M main
  git remote add origin git@github.com:Virrpe/Rektrace.git 2>/dev/null || true
fi

git push -u origin main || true

if ! git tag | grep -q '^v0.5.0$'; then
  git tag -a v0.5.0 -m "rektrace-rugscan v0.5.0 – live ergonomics + deploy tooling"
  git push origin v0.5.0 || true
fi

echo "Git bootstrap complete."


