# RekTrace — Prelaunch Checklist (Cursor-ready)

## 1) Install & Build
- `pnpm i`
- `pnpm dev` (or `pnpm build && pnpm start`)
- Rug Scanner demo: `pnpm rugscan:dev`
- Tests: `pnpm test`

## 2) Configure .env
Copy `.env.example` → `.env`. Fill:
- `TELEGRAM_BOT_TOKEN`, `REDIS_URL`
- `ETH_RPC` (comma-separated, ≥2), `SOL_RPC` (≥2)
- Pick ONE payment route (see `.env.example` comments) and fill its vars
- Optional: `GOPLUS_API_KEY`, `ADMIN_CHAT_ID`

Provider budgets (optional; sensible defaults):

```
PROVIDER_TIMEOUT_MS=2500
PROVIDER_RETRY=1
SCAN_TTL_SECONDS=120
LP_TTL_SECONDS=600
```

## 3) Run locally
- `pnpm dev`
- In Telegram: `/start`, `/holders eth`, `/advertise`, `/ad_terms`

### Demo Mode (no external services)

To preview RekTrace without RPC keys, Redis, or real payments, enable Demo Mode:

```bash
export DEMO_MODE=true
pnpm dev
```

In Demo Mode:
- `/holders`, `/map` use mocked contracts and deterministic holder counts with source `demo` and a `(demo)` badge next to confidence.
- `/advertise` → `/ad_submit` → `/paid` are simulated; payments auto-verify and vetting auto-approves.
- `/preflight` reports ≥90 with a demo disclaimer.

Scripts:
- `./start-demo.sh` (macOS/Linux)
- `./start-demo.ps1` (Windows PowerShell)
- `./start-prod.sh` (macOS/Linux)

### Data Invariants & Goldens

Run deterministic oracle check (DEMO_MODE required):

```bash
pnpm run oracle:scan
```

### Fuzz/Chaos/Soak

```bash
pnpm run fuzz:scan
pnpm run chaos:smoke
pnpm run soak:scan
```

### Idempotency

Enable with `IDEMP_ENABLED=true` in live if clients may retry POSTs. Duplicate requests with same `Idempotency-Key` and body within TTL return 409.

### Testing & Env Lint

```
pnpm run test        # node:test e2e/unit
pnpm run env:lint    # lint .env.prod (set PRESET=live for strict checks)
```

### Release bundle

```
VERSION=1.0.0 pnpm run release:bundle
```

### Verified Launch

```
# Local verification (mirrors CI)
pnpm run verify

# Lint env before promoting live
pnpm run env:lint

# Cut a release (local)
BUMP=patch pnpm run release:tag
VERSION=$(node -p "require('./package.json').version") pnpm run release:bundle
pnpm run release:checksum
```

### Go-Live Run Sheet

```
0) Allow-list your public IPs
pnpm run ip:public
# Add to GoldRush + QuickNode allow-lists

1) Generate live env from ops secrets
PRESET=live pnpm run env:gen

2) Safety lint
pnpm run env:lint

3) One-button go live (canary + reload if SLO green)
pnpm run go:live

4) Watch the first minutes
pnpm run watch:post

# Rollback (if needed)
pnpm run rollback:last
```

### Safe-mode & Budget guard

```
# Flip strict safe-mode (reversible)
bash ops/safe_mode.sh

# Enable budget guard (example)
export BUDGET_ENABLED=true
export BUDGET_CREDITS_DAILY=1000
export BUDGET_ACTION=degrade   # none|degrade|deny|stub
```

### Ops encrypted backup

```
SNAP_PASSPHRASE='yourpass' bash ops/backup_ops.sh
bash ops/restore_ops.sh ops/backups/ops_snapshot.<ts>.tar.gz.enc
```

### Sign-off

```
bash scripts/signoff.sh
```

### Version & provenance

```
GET /version   # returns { version, git_commit?, fingerprint_sha256, built_at }
```

### Perf baselines

```
pnpm run perf:baseline
pnpm run perf:gate
```

### External monitors
- See `ops/monitors/uptimerobot.example.json` and `ops/monitors/healthchecks_example.md`

### Launch rehearsal
```
bash ops/rehearse_launch.sh
```

### Freeze & denylist drills
```
bash ops/drill_freeze.sh
bash ops/flip_rules.sh
```

### Audit evidence pack
```
VERSION=$(node -p "require('./package.json').version") bash scripts/audit_pack.sh
```

## Reproducible builds
- Lockfile committed (`pnpm-lock.yaml`).
- Node engines pinned: see `package.json` and `.nvmrc`.
- npm config: `.npmrc` with `prefer-frozen-lockfile=true`.

## Reverse proxy (Nginx)
- See `ops/nginx.example.conf` for TLS, HSTS, header hardening, and rate limits.

## Correlation IDs & JSON logs
- All HTTP responses include `X-Request-Id`; when `JSON_LOGS=true`, server logs one JSON line per request.

## Canary deploy
- `pnpm run canary:live` performs canary start → smokes → cluster reload (PM2) or aborts safely.

## Git hooks
- `pnpm run git:hooks` installs a pre-commit secret scan hook.

## Docker
- Build: `docker build -t rektrace:latest .`
- Compose (demo): `docker compose -f docker-compose.example.yml up --build`

## Allow/Deny Rules
- Optional ops files: `ops/allowlist.txt` and `ops/denylist.txt` with lines like `ink:pepe` or `eth:0xabc...`.
- Enable with `RULES_ENABLED=true`.

## Config Fingerprint
- `/status?verbose=1` includes `config.fingerprint_sha256` and key toggles; printed on startup.

## 4) Preflight sanity
- In Telegram: `/preflight`
- Aim for score ≥ **90%**. Fix env per hints.

## 5) Zip for handoff
- macOS/Linux: `zip -r rektrace.zip . -x "node_modules/*"`
- Windows: `Compress-Archive -Path * -DestinationPath rektrace.zip -Force -Exclude node_modules/*`

## 6) Minimal prod deploy
- Node 18+, `pnpm i`, `pnpm build`, `node dist/index.js` (or `pm2 start`)
- Add UptimeRobot to `http://server:3000/healthz` if you enabled a health server.

### Operator quick start (signals demo)
```
# Rehearse signals in demo
HTTP_ONLY=true DEMO_MODE=true SIGNALS_ENABLED=true HEALTH_PORT=3000 pnpm rugscan:dev &
BASE_URL=http://127.0.0.1:3000 pnpm run synthetic:probe
BASE_URL=http://127.0.0.1:3000 pnpm run signals:backtest
pkill -f "rugscan" || true

# Live toggle (after secrets + signoff)
PRESET=live pnpm run env:gen
bash ops/safe_mode.sh
pnpm run signoff
# enable signals in .env.prod (manually set SIGNALS_ENABLED=true, optional broadcast/channel id)
pm2 reload ecosystem.config.js --update-env
```

### Orchestrated live deploy (rugscan)

```bash
# 1) Public IP allow-list
pnpm run ip:public
# Add IP to GoldRush + QuickNode allow-lists

# 2) Generate env, build, deploy
pnpm run env:gen
pnpm run build
pnpm run deploy:live

# 3) Smoke test (HTTP); then Telegram smoke: /scan ink:pepe, /top_ink, /watch, /unwatch, /my_watchlist
pnpm run smoke:live
```

Notes:
- Keep `ops/secrets.local.json` as the single source of truth. The generator normalizes `INK_RPC`.
- Ensure GoldRush/QuickNode IP allow-lists include your server IP (`pnpm run ip:public` then check `public_ip.txt`).

### Rollback

```bash
pm2 delete rektrace && pm2 start ecosystem.config.js --update-env && pm2 save
```

### Logrotate (PM2)

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:workerInterval 30
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
```

### Security Preflight (run before first live)

```bash
pnpm run preflight
```

### Abuse-Oriented Smoke (non-destructive)

```bash
pnpm run smoke:abuse
```

Env toggles for guardrails:
- `MAX_BODY_BYTES` (default 65536)
- `STRICT_CONTENT_TYPE` (default false)
- `SECURITY_HEADERS` (default true)
- `RL_ENABLED` (default false), `RL_WINDOW_MS`, `RL_MAX`

### Live Preset & PII Masking

```bash
PRESET=live pnpm run env:gen
```

- PII masking in logs is enabled by default. To disable (not recommended in prod): `PII_MASK=false`.
- Admin IDs: set `ADMIN_IDS=12345,67890` (fallback to `ADMIN_CHAT_ID`).


## Health server
- Starts on `HEALTH_PORT` (default 3000)
- `GET /healthz` → `ok`
- `GET /metrics` → JSON with uptime & memory
 - `GET /live` → 200 once booted
 - `GET /ready` → 200 when providers healthy and not in maintenance; 503 otherwise

## Maintenance & Freeze
- Env gates (default-safe): `MAINTENANCE_MODE=false`, `BREAKER_FORCE_OPEN=false`, `READONLY_MODE=false`, `LOG_REDACT_LIST=`
- Scripts:
  - Synthetic probe: `pnpm run synthetic:probe` (writes `synthetic_last.json`, non-zero exit on SLO breach)
  - Config snapshot: `pnpm run config:snapshot` (writes under `ops/snapshots/` and prints DRIFT)
  - Log scrubber: `pnpm run logs:scrub` (safety net to compress/dedupe older logs; compatible with pm2-logrotate)

## Resolver fallback
If CoinGecko rate-limits, RekTrace now falls back to **DexScreener** search by symbol and picks the most liquid contracts across chains.

## Signals (optional)

- All default-off. Toggle with `SIGNALS_ENABLED=true`.
- Redacted public status: `GET /status/public` → `{ slo, routesSummary, config:{fingerprint_sha256}, signals:[{symbol, score, vol_5m, price_15m, attestationId}] }`.
- Attestation lookup: `GET /signals/:id/attestation` → `{ id, sha256, generated_at }`.
- Optional HMAC-gated full list: `GET /signals` when `HMAC_API_ENFORCE=true` and `HMAC_API_SECRET` set.
- Telegram admin: `/signals_now`, `/signals_auto` when `SIGNALS_BROADCAST_ENABLED=true`.

### Signals go-live (safe canary)
```
PRESET=live pnpm run env:gen
bash ops/safe_mode.sh
pnpm run signoff

# enable signals only (broadcast stays OFF)
# edit .env.prod: set SIGNALS_ENABLED=true; keep SIGNALS_BROADCAST_ENABLED=false
pm2 reload ecosystem.config.js --update-env

# manual admin verify in Telegram:
/signals_now

# later, to enable auto-broadcast (optional):
# set SIGNALS_BROADCAST_ENABLED=true; pm2 reload ...
```
