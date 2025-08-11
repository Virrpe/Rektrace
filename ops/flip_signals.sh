#!/usr/bin/env bash
set -euo pipefail

# Minimal, auditable Signals toggle helper
# - Edits only .env.prod, with timestamped backup
# - Idempotent key updates
# - No secrets are printed

ENV_FILE=".env.prod"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE not found. Generate it first: PRESET=live pnpm run env:gen"
  exit 1
fi

TS=$(date +%Y%m%d_%H%M%S)
cp "$ENV_FILE" "${ENV_FILE}.bak.${TS}"

set_kv() {
  local key="$1"; shift
  local val="$1"; shift
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i'' -E "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >>"$ENV_FILE"
  fi
}

MODE="${1:-}"
case "$MODE" in
  compute_on)
    # Enable compute only (no broadcast)
    set_kv SIGNALS_ENABLED true
    set_kv SIGNALS_BROADCAST_ENABLED false
    # Prefer poll by default
    set_kv SIGNALS_WS_ENABLED false
    set_kv SIGNALS_SOURCE poll
    ;;
  ws_on)
    # Only flips WS gate; caller should ensure QUICKNODE_WSS_URL is set
    set_kv SIGNALS_WS_ENABLED true
    set_kv SIGNALS_SOURCE ws
    ;;
  broadcast_on)
    # Allow automatic broadcasts (compute must already be on)
    set_kv SIGNALS_BROADCAST_ENABLED true
    ;;
  off)
    # Hard-off all signal paths
    set_kv SIGNALS_ENABLED false
    set_kv SIGNALS_WS_ENABLED false
    set_kv SIGNALS_BROADCAST_ENABLED false
    set_kv SIGNALS_SOURCE poll
    ;;
  *)
    echo "usage: bash ops/flip_signals.sh {compute_on|ws_on|broadcast_on|off}"
    exit 2
    ;;
esac

echo "Backup: ${ENV_FILE}.bak.${TS}"
echo "Edited: $ENV_FILE"
echo "→ reload: bash ops/pm2_reload.sh"


