#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SNAP_PASSPHRASE:-}" ]]; then
  echo "SNAP_PASSPHRASE is required (export and run again)." >&2
  exit 1
fi

ts=$(date +%Y%m%d_%H%M%S)
tmp_tgz="/tmp/ops_snapshot.${ts}.tar.gz"
out_dir="ops/backups"
out_enc="${out_dir}/ops_snapshot.${ts}.tar.gz.enc"

mkdir -p "$out_dir"

tar -czf "$tmp_tgz" ops/ ops/presets/ .env.prod 2>/dev/null || true

openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:SNAP_PASSPHRASE -in "$tmp_tgz" -out "$out_enc"
rm -f "$tmp_tgz"

echo "Encrypted snapshot written to: ${out_enc}"


