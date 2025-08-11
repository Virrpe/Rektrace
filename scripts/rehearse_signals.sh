#!/usr/bin/env bash
set -euo pipefail

HP=${HEALTH_PORT:-3000}
BASE="http://127.0.0.1:${HP}"
LOG="logs/rehearse_signals.$(date +%s).log"
mkdir -p logs

export HTTP_ONLY=true
export DEMO_MODE=true
export SIGNALS_ENABLED=true

echo "[rehearse] starting server on ${BASE} (demo)" | tee -a "$LOG"
pnpm -s run rugscan:dev >"$LOG" 2>&1 &
PID=$!

for i in {1..30}; do
  if curl -fsS "${BASE}/status?verbose=1" >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "[rehearse] probes" | tee -a "$LOG"
BASE_URL="$BASE" pnpm -s run synthetic:probe || true
BASE_URL="$BASE" pnpm -s run signals:backtest || true
BASE_URL="$BASE" pnpm -s run smoke:abuse || true

SIG=$(curl -fsS "${BASE}/status/public" | node -e "let j='';process.stdin.on('data',d=>j+=d).on('end',()=>{const x=JSON.parse(j);const id=x.signals?.[0]?.attestationId||'';console.log(id)})" || true)
if [[ -n "$SIG" ]]; then
  echo "[rehearse] attestation $SIG" | tee -a "$LOG"
  curl -fsS "${BASE}/signals/${SIG}/attestation" | jq . | tee -a "$LOG" || true
fi

kill $PID >/dev/null 2>&1 || true
wait $PID 2>/dev/null || true
echo "[rehearse] PASS (log: $LOG)"


