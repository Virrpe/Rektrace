#!/usr/bin/env bash
set -euo pipefail
( "$@" ) &
pid=$!
i=0; syms='|/-\'
while kill -0 $pid 2>/dev/null; do i=$(( (i+1) % 4 )); printf "\r[%s] working..." "${syms:$i:1}"; sleep 0.2; done
wait $pid
echo -e "\r[✓] done       "
