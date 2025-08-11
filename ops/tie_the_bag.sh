#!/usr/bin/env bash
set -euo pipefail
trap 'echo; echo "💥 Aborted. Fix the step above, then re-run from here."; exit 1' ERR

# Config knobs (override via env)
PRESET="${PRESET:-live}"
COMPUTE="${COMPUTE:-on}"
BROADCAST="${BROADCAST:-off}"
WS="${WS:-off}"
NODE_LTS="${NODE_LTS:-20}"

APP="rektrace"

echo "=== 0) Toolchain sanity (read-only) ==="
(node -v; pnpm -v; pm2 -v) || { echo "❌ node/pnpm/pm2 missing"; exit 1; }
command -v jq >/dev/null 2>&1 || echo "note: jq not found (optional)"
echo "note: prefer Node ${NODE_LTS} LTS in live (nvm use ${NODE_LTS})."

echo "=== 1) Secrets presence (no printing) ==="
[ -f ops/secrets.local.json ] || { echo "❌ ops/secrets.local.json missing. Create from example and fill (DO NOT COMMIT)."; exit 1; }

echo "=== 2) Generate env (.env.prod) from preset (${PRESET}) ==="
if [ -x ops/gen_env_live.sh ] && [ "$PRESET" = "live" ]; then
  bash ops/gen_env_live.sh
else
  PRESET="$PRESET" pnpm run env:gen
fi
[ -f .env.prod ] || { echo "❌ .env.prod not created"; exit 1; }

echo "=== 3) Safe posture (idempotent) + signoff gate ==="
bash ops/safe_mode.sh || true
pnpm run signoff

echo "=== 4) Install & build ==="
pnpm i --frozen-lockfile || pnpm i
pnpm run build

echo "=== 5) Start/reload under PM2 with env-sourced wrappers (CJS) ==="
[ -x ops/pm2_start.sh ] || { echo "❌ missing ops/pm2_start.sh wrapper"; exit 1; }
[ -x ops/pm2_reload.sh ] || { echo "❌ missing ops/pm2_reload.sh wrapper"; exit 1; }
bash ops/pm2_start.sh || true
bash ops/pm2_reload.sh || true
pm2 save || true
pm2 list | sed 's/^/  /'

echo "=== 6) Health probe on preset port (demo=3000, live=8081) ==="
HP=$(grep -E '^HEALTH_PORT=' .env.prod | cut -d= -f2-); HP=${HP:-$( [ "$PRESET" = "demo" ] && echo 3000 || echo 8081 )}
HEALTH_PORT="$HP" bash scripts/health_probe.sh

echo "=== 7) Provider allow-list reminder (you add IPs to dashboards) ==="
pnpm run ip:public || true
echo "→ Add IP(s) to GoldRush + QuickNode allow-lists (HTTP + WSS if using WS)."

echo "=== 8) Signals compute toggle (default: on, broadcast still off) ==="
if [ "$COMPUTE" = "on" ]; then
  if [ -x ops/flip_signals.sh ]; then
    bash ops/flip_signals.sh compute_on
    bash ops/pm2_reload.sh
    pnpm run canary:live || true
    HEALTH_PORT="$HP" bash scripts/health_probe.sh
    echo "(Compute ON; broadcast OFF.)"
  else
    echo "skip: ops/flip_signals.sh not found"
  fi
else
  echo "Compute remains OFF."
fi

echo "=== 9) WS adapter (optional; requires QUICKNODE_WSS_URL) ==="
if [ "$WS" = "on" ]; then
  if [ -z "${QUICKNODE_WSS_URL:-}" ]; then
    echo "WS requested but QUICKNODE_WSS_URL not set → skipping WS enable."
  else
    bash ops/flip_signals.sh ws_on
    bash ops/pm2_reload.sh
    curl -fsS "http://127.0.0.1:${HP}/metrics" | grep -E 'signals_ws_connected|signals_ws_connects_total' || true
  fi
else
  echo "WS remains OFF."
fi

echo "=== 10) Broadcast (guarded) — default OFF ==="
if [ "$BROADCAST" = "on" ]; then
  TS=$(date +%Y%m%d_%H%M%S)
  cp .env.prod .env.prod.bak.$TS
  for kv in \
    "SIGNALS_ENABLED=true" \
    "SIGNALS_BROADCAST_ENABLED=true" \
    "SIGNALS_POST_BUDGET_ENABLED=true" \
    "SIGNALS_POST_MAX_PER_HOUR=${SIGNALS_POST_MAX_PER_HOUR:-4}" \
    "SIGNALS_POST_MAX_PER_DAY=${SIGNALS_POST_MAX_PER_DAY:-50}" \
    "SIGNALS_POST_COOLDOWN_MS=${SIGNALS_POST_COOLDOWN_MS:-20000}" \
    "SIGNALS_QUIET_ENABLED=true" \
    "SIGNALS_QUIET_WINDOW_UTC=${SIGNALS_QUIET_WINDOW_UTC:-00:00-06:00}" \
    "SIGNALS_EMERGENCY_MUTE=false"
  do
    k=${kv%%=*}; v=${kv#*=}
    if grep -q "^$k=" .env.prod; then sed -i -E "s|^$k=.*|$k=$v|" .env.prod; else echo "$kv" >> .env.prod; fi
  done
  bash ops/pm2_reload.sh
  echo "📣 Broadcast ON (budget+quiet enforced). In Telegram (admin): /signals_now → sanity; later /signals_auto."
  curl -fsS "http://127.0.0.1:${HP}/metrics" | grep -E 'signals_post_|signals_(ticks|emitted)' || true
else
  echo "Broadcast remains OFF (safe)."
fi

echo "=== 11) Acceptance checklist ==="
echo "• pm2 list shows '${APP}' online"
echo "• /live & /ready → 200 on HEALTH_PORT=${HP}"
echo "• /status/public returns JSON (SLO, fingerprint, signals*)"
echo "• Provider IPs allow-listed (no 401/403)"
echo "• (Compute ON) signals metrics move"
echo "• (WS ON) ws metrics healthy"
echo "• (Broadcast ON) signals_post_* increment without denial spikes"
echo "✅ Done."

echo "=== 12) Rollback levers (print only) ==="
echo "• Emergency mute NOW → set SIGNALS_EMERGENCY_MUTE=true in .env.prod; bash ops/pm2_reload.sh"
echo "• Broadcast OFF (keep compute) → set SIGNALS_BROADCAST_ENABLED=false; bash ops/pm2_reload.sh"


