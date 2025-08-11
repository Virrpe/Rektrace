#!/usr/bin/env bash
set -euo pipefail

enc_path="${1:-}"
if [[ -z "$enc_path" ]]; then
  echo "Usage: bash ops/restore_ops.sh ops/backups/ops_snapshot.<ts>.tar.gz.enc" >&2
  exit 1
fi

if [[ ! -f "$enc_path" ]]; then
  echo "File not found: $enc_path" >&2
  exit 1
fi

if [[ -z "${SNAP_PASSPHRASE:-}" ]]; then
  echo "SNAP_PASSPHRASE is required to decrypt (export and run again)." >&2
  exit 1
fi

tmp_dir="/tmp/ops_restore_$(date +%s)"
mkdir -p "$tmp_dir"

openssl enc -d -aes-256-cbc -pbkdf2 -pass env:SNAP_PASSPHRASE -in "$enc_path" -out "${tmp_dir}/snapshot.tar.gz"
tar -xzf "${tmp_dir}/snapshot.tar.gz" -C "$tmp_dir"

echo "Contents to restore from ${enc_path}:"
find "$tmp_dir" -maxdepth 2 -type f -printf "%P\n" | sed '/^snapshot.tar.gz$/d'

read -r -p "Proceed with restore to current working dir? (y/N) " ans
case "$ans" in
  [yY]*) ;;
  *) echo "Aborted."; exit 0;;
esac

shopt -s dotglob
cp -r "${tmp_dir}/ops" ./ || true
cp -r "${tmp_dir}/ops/presets" ./ops/ || true
if [[ -f "${tmp_dir}/.env.prod" ]]; then
  cp -n "${tmp_dir}/.env.prod" ./.env.prod || true
fi

echo "Restore complete. Review changes with git status/diff."


