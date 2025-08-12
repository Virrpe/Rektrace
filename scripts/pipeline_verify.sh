#!/usr/bin/env bash
set -euo pipefail
trap 'echo; echo "💥 Stopped. Check: pm2 logs rektrace --lines 200"; exit 1' ERR

APP="rektrace"
HP=$(grep -E '^HEALTH_PORT=' .env.prod | cut -d= -f2- || true)
case "$HP" in ''|*[!0-9]*) HP=8081 ;; esac
BASE="http://127.0.0.1:${HP}"

backup_env() { TS=$({ date +%Y%m%d_%H%M%S 2>/dev/null || powershell -NoP -C "(Get-Date).ToString('yyyyMMdd_HHmmss')" ; } ); cp .env.prod ".env.prod.bak.$TS"; echo "$TS"; }
verify_loop() {
  i=0; moved=0
  while [ $i -lt 9 ]; do
    i=$((i+1))
    M="$(curl -fsS "$BASE/metrics" || true)"
    ticks="$(echo "$M" | grep -o '"signals_ticks_total":[0-9]\+' | head -1 | cut -d: -f2)"
    emitted="$(echo "$M" | grep -o '"signals_emitted_total":[0-9]\+' | head -1 | cut -d: -f2)"
    SP="$(curl -fsS "$BASE/status/public" 2>/dev/null || true)"
    sigs="$(echo "$SP" | tr -d "\n" | grep -o '"symbol":"' | wc -l | tr -d ' ')"
    [ -z "$ticks" ] && ticks=0; [ -z "$emitted" ] && emitted=0; [ -z "$sigs" ] && sigs=0
    echo "  [loop $i/9] ticks=$ticks emitted=$emitted sigs≈$sigs"
    if [ "$ticks" -gt 0 ] || [ "$emitted" -gt 0 ] || [ "$sigs" -gt 0 ]; then return 0; fi
    sleep 10
  done
  return 1
}

echo "== DEMO prove =="
BK=$(backup_env)
node ops/upsert_kv.mjs DEMO_MODE true
bash ops/pm2_reload.sh
HEALTH_PORT="$HP" bash scripts/health_probe.sh
if verify_loop; then echo "✅ DEMO ticked"; else echo "❌ DEMO failed"; exit 1; fi

echo "== REAL poll (ink,ethereum) =="
BK=$(backup_env)
node ops/upsert_kv.mjs DEMO_MODE false
node ops/upsert_kv.mjs SIGNALS_ENABLED true
node ops/upsert_kv.mjs SIGNALS_BROADCAST_ENABLED false
node ops/upsert_kv.mjs SIGNALS_SOURCE poll
node ops/upsert_kv.mjs SIGNALS_POLL_MS 5000
node ops/upsert_kv.mjs SIGNALS_CHAINS ink,ethereum
node ops/upsert_kv.mjs SIGNALS_WS_ENABLED false
bash ops/pm2_reload.sh
HEALTH_PORT="$HP" bash scripts/health_probe.sh
curl -s -o /dev/null -w "dexscreener_status:%{http_code} size:%{size_download}\n" "https://api.dexscreener.com/latest/dex/search?q=eth" || true
if verify_loop; then echo "✅ Real polling ticked (ink+ethereum)"; exit 0; fi

echo "== Fallback: ethereum-only =="
BK=$(backup_env)
node ops/upsert_kv.mjs SIGNALS_CHAINS ethereum
bash ops/pm2_reload.sh
HEALTH_PORT="$HP" bash scripts/health_probe.sh
if verify_loop; then echo "✅ Ethereum-only is flowing"; exit 0; fi

echo "❌ Still no movement after fallback. See: pm2 logs rektrace --lines 200"
exit 1


