#!/usr/bin/env bash
# Archived copy of ops/force_sync_redeploy.sh (see archive/README.md)
set -euo pipefail
trap 'echo; echo "💥 Stopped. See: pm2 logs rektrace --lines 200"; exit 1' ERR

APP="rektrace"
DEFAULT_LIVE_PORT=8081

echo "== 0) Toolchain & required files =="
(node -v; pnpm -v; pm2 -v) >/dev/null || { echo "❌ need node/pnpm/pm2"; exit 1; }
[ -f ops/secrets.local.json ] || { echo "❌ ops/secrets.local.json missing (you said it exists; please add it)"; exit 1; }
[ -f ecosystem.config.cjs ] || echo "ℹ️ ecosystem.config.cjs not found (wrappers will fallback to dist entry)"
chmod +x ops/pm2_start.sh ops/pm2_reload.sh scripts/health_probe.sh 2>/dev/null || true

echo "== 1) Generate LIVE env from secrets (idempotent) =="
if [ -x ops/gen_env_live.sh ]; then
  bash ops/gen_env_live.sh
else
  PRESET=live pnpm run env:gen
fi
[ -f .env.prod ] || { echo "❌ .env.prod not created"; exit 1; }

echo "== 2) Apply safe prod posture + compute-only signals via Node (no sed, no secrets) =="
TS=$({ date +%Y%m%d_%H%M%S 2>/dev/null || powershell -NoP -C "(Get-Date).ToString('yyyyMMdd_HHmmss')" ; } )
cp .env.prod .env.prod.bak.$TS

cat > ops/upsert_env_live_sync.mjs <<'JS'
import fs from 'fs';
const p = '.env.prod';
let t = fs.readFileSync(p,'utf8');
const upsert = (k,v) => { const re = new RegExp('^'+k.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')+'=.*$','m'); t = re.test(t) ? t.replace(re, `${k}=${v}`) : (t + `\n${k}=${v}`); };
upsert('HTTP_ONLY','true');
upsert('DEMO_MODE','false');
upsert('STRICT_CONTENT_TYPE','true');
upsert('RL_ENABLED','true');
upsert('IDEMP_ENABLED','true');
upsert('INVARIANTS_STRICT','true');
upsert('JSON_LOGS','true');
upsert('HEALTH_PORT','8081');
upsert('SIGNALS_ENABLED','true');
upsert('SIGNALS_BROADCAST_ENABLED','false');
upsert('SIGNALS_SOURCE','poll');
upsert('SIGNALS_POLL_MS','5000');
upsert('SIGNALS_CHAINS','ink');
upsert('SIGNALS_WS_ENABLED','false');
const lines = t.split(/\r?\n/);
const env = Object.fromEntries(lines.map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2]]));
if ((!env.QUICKNODE_RPC_URL || env.QUICKNODE_RPC_URL.trim()==='') && env.INK_RPC) { upsert('QUICKNODE_RPC_URL', env.INK_RPC); }
upsert('QUICKNODE_WSS_URL','');
fs.writeFileSync(p, t);
JS

node ops/upsert_env_live_sync.mjs

echo "== 3) Install, build latest code, and (re)deploy under PM2 wrappers =="
pnpm i
pnpm run build
pnpm run rugscan:build || true
if [ -x ops/pm2_start.sh ]; then
  bash ops/pm2_start.sh || true
fi
bash ops/pm2_reload.sh
pm2 save || true

echo "== 4) Determine health port from env and probe =="
HP=$(grep -E '^HEALTH_PORT=' .env.prod | cut -d= -f2- || true)
case "$HP" in ''|*[!0-9]*) HP="$DEFAULT_LIVE_PORT";; esac
echo "HEALTH_PORT=$HP"
HEALTH_PORT="$HP" bash scripts/health_probe.sh

BASE="http://127.0.0.1:$HP"
echo "== 5) JQ-free smoke (status/metrics/live/ready) =="
mkdir -p scripts
if [ ! -f scripts/smoke_live_compat.sh ]; then
cat > scripts/smoke_live_compat.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://127.0.0.1:${HEALTH_PORT:-8081}}"
fail=0
code_time=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" "$BASE/status" || echo "000 0"); echo "status  $code_time"; [ "${code_time%% *}" = "200" ] || fail=1
code_time=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" "$BASE/metrics" || echo "000 0"); echo "metrics $code_time"; [ "${code_time%% *}" = "200" ] || fail=1
resp=$(curl -sS "$BASE/status/public" || true); [ -n "$resp" ] || fail=1
cl=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/live"  || echo 000)
cr=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/ready" || echo 000)
echo "live:$cl ready:$cr"; [ "$cl" = "200" ] || fail=1; [ "$cr" = "200" ] || fail=1
exit $fail
SH
chmod +x scripts/smoke_live_compat.sh
fi

HEALTH_PORT="$HP" BASE_URL="$BASE" bash scripts/smoke_live_compat.sh || exit 1

