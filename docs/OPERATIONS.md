### Freeze & Recover (Runbook)

When to freeze:
- External providers failing, noisy alerts, rollout gone wrong, config drift suspected.

Steps:
1) Set maintenance to abort traffic quickly while keeping status endpoints:
   - `MAINTENANCE_MODE=true pm2 reload ecosystem.config.js --update-env`
2) If spend needs to halt immediately but scans must remain contract-compatible:
   - `BREAKER_FORCE_OPEN=true pm2 reload ecosystem.config.js --update-env`
3) If write paths exist in HTTP, keep them off:
   - `READONLY_MODE=true pm2 reload ecosystem.config.js --update-env`
4) Verify with probes:
   - `pnpm run synthetic:probe` (non-zero exit on SLO breach)
   - `pnpm run config:snapshot` (check for DRIFT)
5) Recover: flip toggles back in reverse order and reload with `--update-env`.

Artifacts:
- Synthetic output: `synthetic_last.json`
- Snapshots: `ops/snapshots/config_YYYYMMDD_HHMM.json`


