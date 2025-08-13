# RugScan Production Packaging

This document explains how to produce a minimal RugScan release bundle and verify PM2 entrypoints.

## Package for production

Commands:

```
pnpm run build:rugscan && pnpm run package:rugscan
```

Outputs: `release/rektrace-rugscan-<shortsha>.tar.gz`

Included in tarball:
- `dist/rektrace-rugscan/**`
- `ecosystem.config.cjs`
- `ops/pm2_start.sh`, `ops/pm2_reload.sh`, `scripts/health_probe.sh`
- `release/README.md`

Excluded: root `dist/**` to avoid duplicate artifacts.

## PM2 entrypoint guard

Verify PM2 target matches the expected build output:

```
pnpm run verify:pm2
```

Expected script path:
`dist/rektrace-rugscan/rektrace-rugscan/src/index.js`

## Smoke test

Use the minimal MVP smoke:

```
bash scripts/smoke_mvp.sh
```

It checks `GET /live`, `/ready`, `/status`, `/metrics` on `$HEALTH_PORT`.

## Notes

- PM2 must point to `dist/rektrace-rugscan/rektrace-rugscan/src/index.js`.
- Signals remain OFF for MVP.
- No changes to Signals compute/poller/broadcast in this packaging.


