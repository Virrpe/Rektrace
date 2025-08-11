#!/usr/bin/env bash
set -euo pipefail

step() {
  local name="$1"; shift
  echo "==> ${name}"
  if "$@"; then
    echo "✅ ${name}"
  else
    echo "❌ ${name}" >&2
    exit 1
  fi
}

step "env:lint" pnpm run env:lint
step "verify" pnpm run verify
step "rehearse:launch" pnpm run rehearse:launch
step "synthetic:probe" pnpm run synthetic:probe
step "perf:gate" pnpm run perf:gate

echo "==> status snapshot"
BASE="http://127.0.0.1:${HEALTH_PORT:-3000}"
set +e
body=$(curl -fsS "${BASE}/status?verbose=1" 2>/dev/null)
set -e
if [[ -n "$body" ]]; then
  echo "$body" | jq '{slo: .slo, fingerprint: .config?.fingerprint_sha256, gates: .autoGuard, breakers: .breakers}' 2>/dev/null || echo "$body"
else
  echo "status endpoint not reachable; ensure health server running." >&2
fi

read -r -p "Run encrypted ops backup now? (y/N) " ans
if [[ "$ans" =~ ^[yY]$ ]]; then
  if [[ -z "${SNAP_PASSPHRASE:-}" ]]; then
    echo "SNAP_PASSPHRASE is required. Export and rerun backup if desired." >&2
  else
    bash ops/backup_ops.sh || true
  fi
fi

echo "✅ Sign-off complete"


