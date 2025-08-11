#!/usr/bin/env bash
set -euo pipefail

# Oracle check for demo scan determinism. No external deps beyond coreutils + jq if available.

HOST=${HOST:-"127.0.0.1"}
PORT=${PORT:-${HEALTH_PORT:-3000}}
URL="http://$HOST:$PORT/api/scan"

payload='{"token":"pepe","chain":"ink"}'

resp=$(curl -sS -X POST "$URL" -H 'content-type: application/json' -d "$payload")
if [[ -z "$resp" ]]; then echo "oracle: empty response"; exit 1; fi

# Mask volatile fields (if any). For demo, should be stable.
tmp_expected=$(mktemp)
tmp_actual=$(mktemp)
trap "rm -f $tmp_expected $tmp_actual" EXIT

cat fixtures/goldens/demo_scan_ink_pepe.json > "$tmp_expected"
echo "$resp" > "$tmp_actual"

if command -v jq >/dev/null 2>&1; then
  # Normalize field ordering for comparison
  jq -S . "$tmp_expected" > "$tmp_expected.sorted"
  jq -S . "$tmp_actual" > "$tmp_actual.sorted"
  mv "$tmp_expected.sorted" "$tmp_expected"
  mv "$tmp_actual.sorted" "$tmp_actual"
fi

if diff -u "$tmp_expected" "$tmp_actual"; then
  echo "oracle: PASS"
  exit 0
else
  echo "oracle: DRIFT"
  exit 2
fi


