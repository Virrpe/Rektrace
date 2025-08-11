#!/usr/bin/env bash
set -euo pipefail

LOG_DIR=${LOG_DIR:-logs}
RET_DAYS=${RET_DAYS:-7}

mkdir -p "$LOG_DIR"

echo "[logs] scrubbing in $LOG_DIR (retention ${RET_DAYS}d)"

# Compress logs older than N days (skip already compressed)
find "$LOG_DIR" -type f -name '*.log' -mtime +${RET_DAYS} -print0 | while IFS= read -r -d '' f; do
  if [[ -s "$f" ]]; then
    gzip -9f "$f" && echo "[logs] compressed: $f"
  fi
done

# Dedupe identical consecutive lines in current logs (safety net; pm2-logrotate remains primary)
find "$LOG_DIR" -type f -name '*.log' -print0 | while IFS= read -r -d '' f; do
  tmp=$(mktemp)
  awk 'NR==1{print;prev=$0;next} { if ($0!=prev) print; prev=$0 }' "$f" > "$tmp" && mv "$tmp" "$f"
done

echo "[logs] done"


