#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGDIR="$ROOT/logs"
BUILDDIR="$ROOT/build"
mkdir -p "$LOGDIR" "$BUILDDIR"

CPU="${CPU:-$(nproc || getconf _NPROCESSORS_ONLN || echo 4)}"

step() {
  local name="$1"; shift
  local logfile="$LOGDIR/${name}.log"
  if [ "${GITHUB_ACTIONS:-false}" = "true" ]; then echo "::group::${name}"; fi
  local t0=$(date +%s)
  echo "==> ${name}..."
  {
    echo "----- $(date -u +'%Y-%m-%dT%H:%M:%SZ') :: ${name} -----"
    "$@"
  } |& tee "$logfile"
  local t1=$(date +%s)
  echo "<== ${name} OK ($((t1-t0))s)"
  if [ "${GITHUB_ACTIONS:-false}" = "true" ]; then echo "::endgroup::"; fi
}

# 1) JS/TS (optional; set NO_JS=1 to skip entirely)
if [ "${NO_JS:-0}" != "1" ] && [ -f "$ROOT/package.json" ]; then
  # pick a package manager without touching /usr/bin
  PM="npm"
  if [ -f "$ROOT/pnpm-lock.yaml" ] || grep -q '"packageManager": *"pnpm@' "$ROOT/package.json" 2>/dev/null; then
    if command -v pnpm >/dev/null 2>&1; then
      PM="pnpm"
    elif command -v corepack >/dev/null 2>&1; then
      PM="corepack pnpm"   # runs pnpm via corepack without 'enable'
    fi
  fi

  # install (lockfile-aware fallbacks)
  if [ "$PM" = "pnpm" ] || [ "$PM" = "corepack pnpm" ]; then
    if [ -f "$ROOT/pnpm-lock.yaml" ]; then
      step js_deps bash -lc "$PM i --frozen-lockfile || $PM i"
    else
      step js_deps bash -lc "$PM i"
    fi
  else
    if [ -f "$ROOT/package-lock.json" ] || [ -f "$ROOT/npm-shrinkwrap.json" ]; then
      step js_deps bash -lc "npm ci --no-audit --no-fund || npm i --no-audit --no-fund"
    else
      step js_deps bash -lc "npm i --no-audit --no-fund"
    fi
  fi

  # pnpm v10-friendly approval: avoid prompts and unknown flags
  if ([ "$PM" = "pnpm" ] || [ "$PM" = "corepack pnpm" ]); then
    PNPM_MAJ="$($PM -v | cut -d. -f1 2>/dev/null || echo 0)"
    if [ "${PNPM_APPROVE_ALL:-0}" = "1" ]; then
      if [ "$PNPM_MAJ" -ge 10 ]; then
        step js_rebuild bash -lc "$PM rebuild || true"
      else
        step js_approve bash -lc "$PM approve-builds --all --yes || true"
        step js_rebuild  bash -lc "$PM rebuild || true"
      fi
    elif [ -n "${PNPM_APPROVAL_LIST:-}" ]; then
      if [ "$PNPM_MAJ" -ge 10 ]; then
        step js_rebuild bash -lc "$PM rebuild ${PNPM_APPROVAL_LIST} || true"
      else
        step js_approve bash -lc "$PM approve-builds --yes ${PNPM_APPROVAL_LIST} || true"
        step js_rebuild  bash -lc "$PM rebuild ${PNPM_APPROVAL_LIST} || true"
      fi
    fi
  fi

  # only run build if a "build" script exists (no jq dependency)
  if node -e 'process.exit((require("./package.json").scripts||{}).build?0:1)'; then
    if [ "$PM" = "pnpm" ] || [ "$PM" = "corepack pnpm" ]; then
      step js_build bash -lc "$PM -s build"
    else
      step js_build bash -lc "npm run -s build"
    fi
  fi
fi

# 2) Configure CMake (Ninja)
step cmake_config bash -lc \
  "cmake -S '$ROOT' -B '$BUILDDIR' -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_EXPORT_COMPILE_COMMANDS=ON"

# 3) Build C++
step cmake_build bash -lc "cmake --build '$BUILDDIR' -j ${CPU}"

# 4) Tests (CTest)
if [ -f "$BUILDDIR/CTestTestfile.cmake" ] || [ -d "$BUILDDIR/Testing" ]; then
  step ctest bash -lc "CTEST_OUTPUT_ON_FAILURE=1 ctest --test-dir '$BUILDDIR' -j ${CPU}"
fi

# 5) Optional demos/bench/score
run_if_exists() {
  local exe="$1" name="$2"
  if [ -x "$exe" ]; then
    step "$name" "$exe"
  fi
}
run_if_exists "$BUILDDIR/demos" demos
run_if_exists "$BUILDDIR/bench" bench
run_if_exists "$BUILDDIR/score" score

# 6) Summarize
{
  echo "Artifacts in $LOGDIR:"
  ls -lah "$LOGDIR"
} | tee -a "$LOGDIR/summary.log"

echo "All steps completed."


