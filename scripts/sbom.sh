#!/usr/bin/env bash
set -euo pipefail

pnpm list --json > sbom.deps.json || {
  echo "[sbom] Failed to generate SBOM" >&2
  exit 0
}
echo "[sbom] Wrote sbom.deps.json"


