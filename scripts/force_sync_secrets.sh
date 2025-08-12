#!/usr/bin/env bash

# REKTRACE — FORCE SYNC SECRETS FROM YOUR FILE → ENV → RELOAD (safe, jq-free)
set -euo pipefail
trap 'echo; echo "💥 Aborted. See: pm2 logs rektrace --lines 200 | tail -n +120"; exit 1' ERR

need(){ command -v "$1" >/dev/null 2>&1 || { echo "❌ need $1"; exit 1; }; }
need node; need pnpm; need pm2

echo "== 1) locate & copy your secrets file =="
# Default Windows-style source; script will try multiple candidate paths
SRC_RAW='C:\buildz\rektrace\ops\secrets.local.json2.txt'
node -e '
  const fs=require("fs");
  const raw=process.env.SRC_RAW||"C\\\\buildz\\\\rektrace\\\\ops\\\\secrets.local.json2.txt";
  const candidates=[ raw, (raw||"").replace(/\\\\/g,"/"), "/c/buildz/rektrace/ops/secrets.local.json2.txt", "ops/secrets.local.json2.txt" ].filter(Boolean);
  let found=null, data=null;
  for(const c of candidates){ try{ data=fs.readFileSync(c,"utf8"); found=c; break; }catch{} }
  if(!found){ console.error("❌ could not find secrets file. Tried:\n - "+candidates.join("\n - ")); process.exit(1); }
  let j; try{ j=JSON.parse(data); }catch(e){ console.error("❌ secrets JSON invalid:", e.message); process.exit(1); }
  const env = (j && typeof j.env==="object") ? j.env : j;
  fs.mkdirSync("ops",{recursive:true});
  fs.writeFileSync("ops/secrets.local.json", JSON.stringify({env}, null, 2));
  console.log("✅ secrets source synchronized from:", found);
'

echo "== 2) generate .env.prod from live preset (no printing of values) =="
if [ -x ops/gen_env_live.sh ]; then
  bash ops/gen_env_live.sh
else
  PRESET=live pnpm -s run env:gen
fi
[ -f .env.prod ] || { echo "❌ .env.prod not created"; exit 1; }

# timestamped backup
TS=$({ date +%Y%m%d_%H%M%S 2>/dev/null || powershell -NoP -C "(Get-Date).ToString('yyyyMMdd_HHmmss')" ; })
cp .env.prod ".env.prod.bak.$TS"

# tiny helper to upsert KEY=VALUE safely (regex-free)
upsert(){ node -e 'const fs=require("fs");let t=fs.readFileSync(".env.prod","utf8");const k=process.argv[1],v=process.argv[2];const a=t.split(/\r?\n/);let f=0;for(let i=0;i<a.length;i++){if(a[i].startsWith(k+"=")){a[i]=k+"="+v;f=1;break;}}if(f===0)a.push(k+"="+v);fs.writeFileSync(".env.prod",a.join("\n"));' "$1" "$2"; }

echo "== 3) merge keys from secrets into .env.prod (no echoing secrets) =="
node -e '
  const fs=require("fs");
  const src=(JSON.parse(fs.readFileSync("ops/secrets.local.json","utf8")).env)||{};
  let t=fs.readFileSync(".env.prod","utf8");
  const keys=["TELEGRAM_BOT_TOKEN","GOLDRUSH_API_KEY","QUICKNODE_RPC_URL","QUICKNODE_WSS_URL","INK_RPC","API_KEY","ADMIN_IDS","ADMIN_CHAT_ID","REDIS_URL","SIGNALS_CHANNEL_ID"];
  const upsert=(k,v)=>{ const a=t.split(/\r?\n/); let f=false; for(let i=0;i<a.length;i++){ if(a[i].startsWith(k+"=")){ a[i]=k+"="+v; f=true; break; } } if(!f) a.push(k+"="+v); t=a.join("\n"); };
  for(const k of keys){ if(src[k]) upsert(k, String(src[k])); }
  fs.writeFileSync(".env.prod",t);
  console.log("✅ secrets merged into .env.prod");
'

echo "== 4) minimal live posture (ports + telegram enabled) =="
upsert PORT 8080
upsert HEALTH_PORT 8081
upsert HTTP_ONLY false   # allow Telegram path (will fail if token missing)
# keep existing guards; set strict defaults if missing
grep -q '^STRICT_CONTENT_TYPE=' .env.prod || upsert STRICT_CONTENT_TYPE true
grep -q '^RL_ENABLED='           .env.prod || upsert RL_ENABLED true
grep -q '^INVARIANTS_STRICT='    .env.prod || upsert INVARIANTS_STRICT true
grep -q '^IDEMP_ENABLED='        .env.prod || upsert IDEMP_ENABLED true
# signals posture — compute ON, broadcast ON with budget/quiet
grep -q '^SIGNALS_ENABLED='            .env.prod || upsert SIGNALS_ENABLED true
grep -q '^SIGNALS_BROADCAST_ENABLED='  .env.prod || upsert SIGNALS_BROADCAST_ENABLED true
grep -q '^SIGNALS_SOURCE='             .env.prod || upsert SIGNALS_SOURCE poll
grep -q '^SIGNALS_POLL_MS='            .env.prod || upsert SIGNALS_POLL_MS 5000
grep -q '^SIGNALS_CHAINS='             .env.prod || upsert SIGNALS_CHAINS "ink,ethereum"
grep -q '^SIGNALS_WS_ENABLED='         .env.prod || upsert SIGNALS_WS_ENABLED false
grep -q '^SIGNALS_POST_BUDGET_ENABLED='.env.prod || upsert SIGNALS_POST_BUDGET_ENABLED true
grep -q '^SIGNALS_QUIET_ENABLED='      .env.prod || upsert SIGNALS_QUIET_ENABLED true
grep -q '^SIGNALS_EMERGENCY_MUTE='     .env.prod || upsert SIGNALS_EMERGENCY_MUTE false

echo "== 5) build & (re)start =="
pnpm -s run rugscan:build || pnpm -s run build
chmod +x ops/pm2_start.sh ops/pm2_reload.sh scripts/health_probe.sh 2>/dev/null || true
if pm2 jlist | grep -q '"name":"rektrace"'; then
  bash ops/pm2_reload.sh
else
  if [ -f ops/pm2_start.sh ]; then bash ops/pm2_start.sh; else
    if [ -f ecosystem.config.cjs ]; then pm2 start ecosystem.config.cjs --update-env --name rektrace
    else pm2 start dist/rektrace-rugscan/rektrace-rugscan/src/index.js --update-env --name rektrace
    fi
    pm2 save || true
  fi
fi

echo "== 6) health probe =="
HP=$(grep -E '^HEALTH_PORT=' .env.prod | cut -d= -f2- || echo 8081)
HEALTH_PORT="$HP" PROBE_MAX_ATTEMPTS=30 PROBE_SLEEP_SECS=1 bash scripts/health_probe.sh
BASE="http://127.0.0.1:${HP}"

echo "== 7) quick signals/post counters (30s) =="
for i in 1 2 3; do
  M="$(curl -fsS "$BASE/metrics" || true)"
  ticks=$(echo "$M" | grep -o '"signals_ticks_total":[0-9]\+' | cut -d: -f2 | head -1);     [ -z "$ticks" ] && ticks=0
  emitted=$(echo "$M" | grep -o '"signals_emitted_total":[0-9]\+' | cut -d: -f2 | head -1); [ -z "$emitted" ] && emitted=0
  allowed=$(echo "$M" | grep -o '"signals_post_allowed_total":[0-9]\+' | cut -d: -f2 | head -1); [ -z "$allowed" ] && allowed=0
  echo "[$i/3] ticks=$ticks emitted=$emitted posts_allowed=$allowed"
  sleep 10
done

echo "✅ Secrets synced from your file, env applied, PM2 reloaded, health OK on :$HP"
echo "Backup created: .env.prod.bak.$TS"


