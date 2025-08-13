### Freeze & Recover (Runbook)

When to freeze:
- External providers failing, noisy alerts, rollout gone wrong, config drift suspected.

Steps:
1) Set maintenance to abort traffic quickly while keeping status endpoints:
   - `MAINTENANCE_MODE=true bash ops/pm2_reload.sh`
2) If spend needs to halt immediately but scans must remain contract-compatible:
   - `BREAKER_FORCE_OPEN=true bash ops/pm2_reload.sh`
3) If write paths exist in HTTP, keep them off:
   - `READONLY_MODE=true bash ops/pm2_reload.sh`
4) Verify with probes:
   - `pnpm run synthetic:probe` (non-zero exit on SLO breach)
   - `pnpm run config:snapshot` (check for DRIFT)
5) Recover: flip toggles back in reverse order and reload with `--update-env`.

Artifacts:
- Synthetic output: `synthetic_last.json`
- Snapshots: `ops/snapshots/config_YYYYMMDD_HHMM.json`


