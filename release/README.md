# RekTrace RugScan Release

This bundle contains the minimal artifacts to run the RugScan service with PM2.

Included:
- dist/rektrace-rugscan/**
- ecosystem.config.cjs
- ops/pm2_start.sh, ops/pm2_reload.sh
- scripts/health_probe.sh

Run:
1) Export environment (e.g., source .env.prod)
2) pm2 start ecosystem.config.cjs --update-env --name rektrace

Health:
- GET /live, /ready, /status, /metrics on $HEALTH_PORT (default 8081)

Note: Signals remain OFF for MVP; PM2 script must be `dist/rektrace-rugscan/rektrace-rugscan/src/index.js`.


