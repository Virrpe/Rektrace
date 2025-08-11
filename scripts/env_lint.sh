#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${ENV_FILE:-.env.prod}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[env:lint] Missing $ENV_FILE" >&2
  exit 2
fi

# shellcheck disable=SC2046
export $(grep -E '^[A-Z0-9_]+=' "$ENV_FILE" | xargs -0 -I{} bash -c 'echo {}' 2>/dev/null || true)

hard_fail=0
warn=0

function fail() { echo "[FAIL] $1"; hard_fail=1; }
function warnf() { echo "[WARN] $1"; warn=1; }
function pass() { echo "[OK]   $1"; }

# Dangerous combos for live
if [[ "${PRESET:-}" == "live" ]]; then
  [[ "${DEMO_MODE:-false}" == "true" ]] && fail "DEMO_MODE must be false in live" || pass "DEMO_MODE=false" 
  [[ "${SECURITY_HEADERS:-true}" == "false" ]] && fail "SECURITY_HEADERS must be true in live" || pass "SECURITY_HEADERS=true"
  [[ "${STRICT_CONTENT_TYPE:-false}" == "false" ]] && fail "STRICT_CONTENT_TYPE should be true in live" || pass "STRICT_CONTENT_TYPE=true"
  [[ "${RL_ENABLED:-false}" == "false" ]] && fail "RL_ENABLED should be true in live" || pass "RL_ENABLED=true"
  [[ "${HTTP_ONLY:-false}" == "true" ]] && warnf "HTTP_ONLY=true: ensure TLS termination upstream" || pass "HTTP_ONLY=false (or TLS upstream)"
  if [[ -n "${PORT:-}" && -n "${HEALTH_PORT:-}" && "${PORT}" == "${HEALTH_PORT}" ]]; then
    fail "PORT must differ from HEALTH_PORT"
  else
    pass "PORT != HEALTH_PORT"
  fi
  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" && "${HTTP_ONLY:-false}" != "true" ]]; then
    warnf "TELEGRAM_BOT_TOKEN not set; Telegram may fail"
  else
    pass "Telegram token present or HTTP_ONLY=true"
  fi
else
  pass "Preset not live; skipping strict checks"
fi

live_safe=$( ((hard_fail)) && echo NO || echo YES )
echo "[env:lint] Summary: $( ((hard_fail)) && echo FAIL || echo PASS ), warnings: $warn"
echo "LIVE_SAFE=${live_safe}"
exit $hard_fail


