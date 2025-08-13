#!/usr/bin/env bash
set -euo pipefail

# Always run from repo root
cd "$(dirname "$0")/.."

mkdir -p logs

run_step() {
  local msg="$1"
  local log="$2"
  shift 2
  echo ">> $msg (log: $log)"
  : >"$log"
  ("$@" >"$log" 2>&1) &
  local pid=$!
  local frames='|/-\\'
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    local idx=$(( i % 4 ))
    local ch=${frames:idx:1}
    printf "\r[%s] %s" "$ch" "$msg"
    i=$((i+1))
    sleep 0.1
  done
  wait "$pid" || true
  local rc=$?
  printf "\r"
  if [ "$rc" -eq 0 ]; then
    echo "[✔] $msg"
    tail -n 20 "$log" || true
  else
    echo "[✖] $msg (rc=$rc)"
    tail -n 80 "$log" || true
    return "$rc"
  fi
}

# Steps
run_step "pnpm install" logs/pnpm_install.log pnpm -s install --reporter=append-only
run_step "TypeScript build" logs/ts_build.log pnpm -s run build
run_step "CMake configure" logs/cmake_configure.log cmake --preset default
run_step "CMake build" logs/cmake_build.log cmake --build --preset default -j

echo "Build pipeline complete."

