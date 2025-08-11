#!/usr/bin/env bash
set -euo pipefail

HP=${HEALTH_PORT:-3000}
BASE="http://127.0.0.1:${HP}"
LOG="logs/rehearse_ws.$(date +%s).log"
mkdir -p logs

export HTTP_ONLY=true
export DEMO_MODE=${DEMO_MODE:-true}
export SIGNALS_ENABLED=true

if [[ "${SIGNALS_WS_ENABLED:-false}" == "true" && -n "${QUICKNODE_WSS_URL:-}" && "${DEMO_MODE}" != "true" ]]; then
  echo "[rehearse:ws] WS enabled with QUICKNODE_WSS_URL (live rehearsal)" | tee -a "$LOG"
else
  echo "[rehearse:ws] WS disabled; using poll/stub (demo or missing URL)" | tee -a "$LOG"
  export SIGNALS_WS_ENABLED=false
fi

echo "[rehearse:ws] starting server on ${BASE}" | tee -a "$LOG"
pnpm -s run rugscan:dev >"$LOG" 2>&1 &
PID=$!

for i in {1..30}; do
  if curl -fsS "${BASE}/status?verbose=1" >/dev/null 2>&1; then break; fi
  sleep 1
done

BASE_URL="$BASE" pnpm -s run signals:backtest || true
BASE_URL="$BASE" pnpm -s run synthetic:probe || true
BASE_URL="$BASE" pnpm -s run smoke:abuse || true

SIG=$(curl -fsS "${BASE}/status/public" | node -e "let j='';process.stdin.on('data',d=>j+=d).on('end',()=>{const x=JSON.parse(j);const id=x.signals?.[0]?.attestationId||'';console.log(id)})" || true)
if [[ -n "$SIG" ]]; then
  curl -fsS "${BASE}/signals/${SIG}/attestation" | jq . | tee -a "$LOG" || true
fi

kill $PID >/dev/null 2>&1 || true
wait $PID 2>/dev/null || true
echo "[rehearse:ws] PASS (log: $LOG)"


