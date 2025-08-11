#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-http://127.0.0.1:${PORT:-8080}}
DIR=${SNAP_DIR:-ops/snapshots}
mkdir -p "$DIR"

now=$(date +%Y%m%d_%H%M)
out="$DIR/config_${now}.json"

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

curl -fsS "${BASE_URL}/status?verbose=1" -o "$tmp"

if command -v jq >/dev/null 2>&1; then
  fp=$(jq -r '.config.fingerprint_sha256 // ""' "$tmp")
  preset=$(jq -r '.config.preset // ""' "$tmp")
  strictCT=$(jq -r '.config.strictCT // false' "$tmp")
  headersOn=$(jq -r '.config.headersOn // false' "$tmp")
  rl=$(jq -c '.config.rl // {}' "$tmp")
else
  fp=""; preset=""; strictCT=false; headersOn=false; rl="{}"
fi

printf '{"ts":"%s","fingerprint":"%s","preset":"%s","strictCT":%s,"headersOn":%s,"rl":%s}\n' \
  "$(date -Iseconds)" "$fp" "$preset" "$strictCT" "$headersOn" "$rl" > "$out"

last=$(ls -1t "$DIR"/config_*.json 2>/dev/null | sed -n '2p' || true)
if [[ -n "$last" ]]; then
  if command -v jq >/dev/null 2>&1; then
    old=$(jq -r '.fingerprint+":"+.preset+":"+(.strictCT|tostring)+":"+(.headersOn|tostring)' "$last")
    cur=$(jq -r '.fingerprint+":"+.preset+":"+(.strictCT|tostring)+":"+(.headersOn|tostring)' "$out")
    if [[ "$old" != "$cur" ]]; then
      echo "DRIFT: ${last##*/} -> ${out##*/}"
    else
      echo "OK: no drift"
    fi
  else
    echo "Snapshot saved: ${out}"
  fi
else
  echo "Baseline snapshot created: ${out}"
fi


