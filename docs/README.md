### New Ops Scripts
- `pnpm run synthetic:probe` — runs `/status?verbose=1`, prints SLO summary, optionally probes demo scan; writes `synthetic_last.json`.
- `pnpm run config:snapshot` — records config fingerprint snapshot under `ops/snapshots/` and prints DRIFT when changed from last.
- `pnpm run logs:scrub` — compresses old logs and dedupes consecutive duplicate lines; safe with pm2-logrotate.


