### Maintenance, Freeze, and Read-only Modes

These controls provide fast, safe ways to pause or limit behavior without changing code. All toggles are env-gated and default-safe.

## Env toggles
- MAINTENANCE_MODE=false — when true, all endpoints return 503 with Retry-After: 30 except: `/health`, `/healthz`, `/status`, `/metrics`, `/live`, `/ready`.
- BREAKER_FORCE_OPEN=false — when true, scan endpoints return a cached/deterministic stub and skip external providers.
- READONLY_MODE=false — when true, blocks state-changing HTTP routes (POST/PUT/PATCH/DELETE) except scan API. Telegram contracts unchanged.
- LOG_REDACT_LIST= — comma-separated substrings to redact from JSON logs at write time.

## Usage
- Freeze all non-essential traffic:
  ```sh
  MAINTENANCE_MODE=true pm2 reload ecosystem.config.js --update-env
  ```
- Force breaker open to stop external spend while keeping contracts:
  ```sh
  BREAKER_FORCE_OPEN=true pm2 reload ecosystem.config.js --update-env
  ```
- Enable read-only guard (HTTP only):
  ```sh
  READONLY_MODE=true pm2 reload ecosystem.config.js --update-env
  ```
- Add extra runtime redaction:
  ```sh
  LOG_REDACT_LIST=secret123,apikey_abc pm2 reload ecosystem.config.js --update-env
  ```

## Endpoints
- GET /live → 200 once process started
- GET /ready → 200 when not in maintenance, not breaker-forced-open, and no breakers are open; 503 otherwise
- GET /status → unchanged; `?verbose=1` includes `slo`, `routes`, `config`

## Notes & Gotchas
- Read-only does not affect Telegram commands at this stage (to preserve contracts). Watch/unwatch HTTP routes would be denied if added later.
- `BREAKERS_FORCE_OPEN` uses deterministic stubs that satisfy invariants for safety. Real provider calls are skipped.
- Maintenance takes precedence after header application; status/metrics remain accessible for orchestration.

## Synthetic & Drift Tools
- Synthetic probe: `pnpm run synthetic:probe` (writes `synthetic_last.json`, non-zero exit on SLO breach/5xx)
- Config snapshot: `pnpm run config:snapshot` (writes under `ops/snapshots/` and prints DRIFT when changed)


