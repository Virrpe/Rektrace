# RFC: tsconfig de-duplication for RugScan builds

Status: Proposed

## Context

Today we compile two trees:

- Root `src/**` → `dist/**`
- Nested `rektrace-rugscan/src/**` (with its own tsconfig) → `dist/rektrace-rugscan/rektrace-rugscan/src/**`

This duplicates TypeScript include/emit across the mono-repo and the nested RugScan package. There is no immediate runtime bug, but the overlap increases the risk of:

- Divergent output trees and confusion about which build artifacts are canonical
- Accidental mixed import paths (from both `dist/**` and `dist/rektrace-rugscan/**`)
- CI time and cache inefficiency

## Goals

- Keep behavior identical for runtime and tests
- Reduce confusion by ensuring a single canonical build tree is referenced by RugScan imports
- Do not refactor code in this PR; this is an RFC only

## Options

### A) Leave as-is (baseline)
- Pros: zero change, stable
- Cons: continued duplication and confusion

### B) Tighten nested tsconfig includes (Recommended)
- Make `rektrace-rugscan/tsconfig.json` only include the RugScan sources and their direct dependencies, and emit to a single sub-tree (e.g., `dist/rektrace-rugscan/**`)
- Ensure RugScan imports resolve against root `dist/**` or the RugScan `dist/**`, but not both
- Update `package.json` scripts if needed to call only one compiler where applicable

### C) Convert to workspaces/monorepo tooling
- Introduce PNPM workspaces or a monorepo tool and centralize build scripts
- Pros: clearer boundaries, future scalability
- Cons: larger change surface; not necessary for immediate fix

## Recommended Path (B)

1) Audit tsconfig files for overlapping `include`/`references`
2) Make nested tsconfig emit to `dist/rektrace-rugscan/**` only
3) Ensure root build emits only root services to `dist/**`
4) Verify that RugScan runtime entrypoints reference a single built tree consistently
5) Adjust dev scripts minimally if they depend on cross-compiled output

## Migration Plan

- Create a PoC branch: `refactor/tsconfig-dedup-poc`
- Steps:
  - Introduce narrowed `include` in `rektrace-rugscan/tsconfig.json`
  - Confirm `pnpm run build` and `pnpm run start:rugscan` still work
  - Run tests and smoke scripts to ensure no import path regressions
- Rollback plan: revert tsconfig changes; no code edits required

## Risks

- Missing include could cause compile-time errors; mitigated by PoC branch and CI
- Import path drift; mitigated by static checks and end-to-end smoke tests

## Test Plan

- `pnpm run build && pnpm run test && pnpm run smoke:live` (or demo modes)
- `GET /metrics` and `GET /status` should match before/after
- Telegram command smoke: `/scan`, `/scan_plus`, `/snipers`, `/sniper`, `/watch`, `/my_watchlist`

## Notes

- This RFC proposes no immediate code refactor. Implementation should land in a separate PR following review.


