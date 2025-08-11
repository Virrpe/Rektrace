#!/usr/bin/env bash
set -euo pipefail
trap 'echo; echo "💥 Aborted. Fix the step above, then re-run from here."; exit 1' ERR

APP="rektrace"
LIVE_PORT_DEFAULT=8081
DEMO_PORT_DEFAULT=3000

echo "=== 0) Toolchain sanity (read-only) ==="
(node -v; pnpm -v; pm2 -v) || { echo "❌ node/pnpm/pm2 missing"; exit 1; }
command -v jq >/dev/null 2>&1 || echo "note: jq not found (optional pretty output)"
echo "note: live prefers Node 20 LTS for reproducibility (nvm use 20). Proceeding with $(node -v)."

echo "=== 1) Secrets presence (no printing) ==="
[ -f ops/secrets.local.json ] || { echo "❌ ops/secrets.local.json missing. Create from ops/secrets.local.example.json and fill (DO NOT COMMIT)."; exit 1; }

echo "=== 2) Generate LIVE env (.env.prod) from preset (backup handled by generator) ==="
if [ -x ops/gen_env_live.sh ]; then bash ops/gen_env_live.sh; else PRESET=live pnpm run env:gen; fi
[ -f .env.prod ] || { echo "❌ .env.prod not created"; exit 1; }

echo "=== 3) Safe posture (idempotent) + signoff gate ==="
bash ops/safe_mode.sh
pnpm run signoff

echo "=== 4) Install & build ==="
pnpm i --frozen-lockfile || pnpm i
pnpm run build

echo "=== 5) Start/reload under PM2 with env-sourced wrappers (CJS) ==="
[ -x ops/pm2_start.sh ]  || { echo "❌ missing ops/pm2_start.sh"; exit 1; }
[ -x ops/pm2_reload.sh ] || { echo "❌ missing ops/pm2_reload.sh"; exit 1; }
bash ops/pm2_start.sh || true
bash ops/pm2_reload.sh || true
pm2 save || true
pm2 list | sed 's/^/  /'

echo "=== 6) Health probe (LIVE) ==="
HP=$(grep -E '^HEALTH_PORT=' .env.prod | cut -d= -f2- || true); HP=${HP:-$LIVE_PORT_DEFAULT}
if [ -x scripts/health_probe.sh ]; then
  HEALTH_PORT="$HP" bash scripts/health_probe.sh
else
  BASE="http://127.0.0.1:${HP}"
  curl -fsS "$BASE/live"  >/dev/null && echo "/live ✅"  || { echo "/live ❌ (not listening on $BASE)"; exit 1; }
  curl -fsS "$BASE/ready" >/dev/null && echo "/ready ✅" || { echo "/ready ❌ (maintenance/breaker/freeze?)"; exit 1; }
  (command -v jq >/dev/null && curl -fsS "$BASE/status/public" | jq '{slo,signals_len:(.signals|length),fingerprint:.config.fingerprint_sha256}') \
    || curl -fsS "$BASE/status/public" || true
fi

echo "=== 7) Provider allow-list reminder (you add IPs to dashboards) ==="
pnpm run ip:public || true
echo "→ Add IP(s) to GoldRush + QuickNode allow-lists (HTTP + WSS if you later enable WS)."

echo "=== 8) Enable Signals compute (broadcast OFF) + SLO-gated canary ==="
if [ -x ops/flip_signals.sh ]; then
  bash ops/flip_signals.sh compute_on
  bash ops/pm2_reload.sh
  pnpm run canary:live
  if [ -x scripts/health_probe.sh ]; then HEALTH_PORT="$HP" bash scripts/health_probe.sh; fi
  echo "(Compute ON; broadcast remains OFF.)"
else
  echo "skip: ops/flip_signals.sh not found (compute stays OFF)"
fi

echo "=== 9) WS adapter (optional; OFF by default) ==="
if [ -n "${QUICKNODE_WSS_URL:-}" ]; then
  echo "WS available but currently disabled. To enable later:"
  echo "  bash ops/flip_signals.sh ws_on && bash ops/pm2_reload.sh"
else
  echo "WS skipped (QUICKNODE_WSS_URL not set)."
fi

echo "=== 10) Broadcast (guarded) — default OFF (recommended) ==="
echo "To enable later with posting budget + quiet hours enforced, run:"
echo "  bash -lc 'set -euo pipefail; TS=$(date +%Y%m%d_%H%M%S); cp .env.prod .env.prod.bak.$TS; kvs=( \"SIGNALS_ENABLED=true\" \"SIGNALS_BROADCAST_ENABLED=true\" \"SIGNALS_POST_BUDGET_ENABLED=true\" \"SIGNALS_POST_MAX_PER_HOUR=${SIGNALS_POST_MAX_PER_HOUR:-4}\" \"SIGNALS_POST_MAX_PER_DAY=${SIGNALS_POST_MAX_PER_DAY:-50}\" \"SIGNALS_POST_COOLDOWN_MS=${SIGNALS_POST_COOLDOWN_MS:-20000}\" \"SIGNALS_QUIET_ENABLED=true\" \"SIGNALS_QUIET_WINDOW_UTC=${SIGNALS_QUIET_WINDOW_UTC:-00:00-06:00}\" \"SIGNALS_EMERGENCY_MUTE=false\" ); for kv in \"${kvs[@]}\"; do k=${kv%%=*}; v=${kv#*=}; if grep -q \"^$k=\" .env.prod; then sed -i -E \"s|^$k=.*|$k=$v|\" .env.prod; else echo \"$kv\" >> .env.prod; fi; done; bash ops/pm2_reload.sh; echo \"📣 Broadcast ON (budget+quiet). In Telegram: /signals_now → sanity; later /signals_auto\"'"

echo "=== 11) Make PM2 persistent on boot (optional) ==="
pm2 startup || true
pm2 save || true

echo "=== 12) Acceptance snapshot ==="
BASE="http://127.0.0.1:${HP}"
LIVE_OK=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/live"  || echo 000)
READY_OK=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/ready" || echo 000)
SIGLEN=$( (curl -fsS "$BASE/status/public" | jq -r '.signals|length' 2>/dev/null) || echo "n/a" )
echo "• pm2 shows '${APP}' online"
echo "• /live:  $LIVE_OK  • /ready: $READY_OK  on HEALTH_PORT=$HP"
echo "• signals_len: $SIGLEN (compute ON expected > 0 over time)"
echo "• ensure provider IPs allow-listed in GoldRush + QuickNode"
echo "✅ Done (compute ON, broadcast OFF)."

echo "=== 13) Rollback levers (print only) ==="
echo "• Emergency mute NOW → set SIGNALS_EMERGENCY_MUTE=true; bash ops/pm2_reload.sh"
echo "• Broadcast OFF (keep compute) → set SIGNALS_BROADCAST_ENABLED=false; bash ops/pm2_reload.sh"
echo "• Maintenance freeze → set MAINTENANCE_MODE=true; bash ops/pm2_reload.sh"
echo "# If anything fails, share the failing step + last 50 lines: pm2 logs rektrace --lines 50"


