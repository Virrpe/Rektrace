# Signals (optional, default-off)

This is a thin scoring layer over discovery ticks with attestation and redacted exposure. It is default-off and env-gated. No changes to existing HTTP/Telegram contracts.

## Formula

Score = 1.5*z(vol_5m) + 1.0*z(price_15m) + 1.2*z(maker_5m) – penalties

Penalties (env-tunable):
- contract age < SIGNAL_MIN_CONTRACT_AGE_DAYS → −1.5
- blacklist proximity > 0.5 → −1.0
- invariant warnings (count) → −min(2, 0.5 × count)

## Windows & Aggregates
- Ring-buffer of 60 minute buckets.
- computeWindowAgg(5) and computeWindowAgg(15) for short windows.

## Attestation
- attest(input) -> { id, sha256, generated_at } where input is the normalized snapshot for the signal calculation.
- Storage: in-memory; if REDIS_URL set, Redis keys signals:att:<id> with TTL 24h.
- Endpoint: GET /signals/:id/attestation returns { id, sha256, generated_at }.

## Public status
- GET /status/public (read-only):
```
{ slo, routesSummary, config:{ fingerprint_sha256 },
  signals:[{ symbol, score, vol_5m, price_15m, attestationId }] }
```
- No raw addresses or hashes in this endpoint; only attestationId.

## Telegram
- /signals_now (admin-gated) → posts top-5 to current chat. Default-off behind SIGNALS_BROADCAST_ENABLED=false.
- /signals_auto (admin-gated) → toggles periodic posts every ~3×SIGNALS_POLL_MS.
- Dedup via in-mem/Redis key signals:posted:<id> TTL 10m.

## HMAC partner API (optional)
- GET /signals returns full signals list only when HMAC_API_ENFORCE=true and HMAC_API_SECRET set.
- Headers: X-Timestamp, X-Signature where signature = sha256_hex(timestamp + body).
- Only wraps the new /signals route; does not affect existing routes.

## Env toggles
```
SIGNALS_ENABLED=false
SIGNALS_POLL_MS=5000
SIGNALS_WS_ENABLED=false
SIGNALS_BROADCAST_ENABLED=false
SIGNALS_CHANNEL_ID=
HMAC_API_ENFORCE=false
HMAC_API_SECRET=
```

### Posting Budget (env-gated; default OFF)

Operate a Telegram posting budget to limit hourly/daily posts and enforce a short cooldown between posts. Budget affects broadcast only; compute and status remain unchanged.

Env (defaults shown; do not enable by default):

```
SIGNALS_POST_BUDGET_ENABLED=false
SIGNALS_POST_MAX_PER_HOUR=6
SIGNALS_POST_MAX_PER_DAY=50
SIGNALS_POST_COOLDOWN_MS=20000
SIGNALS_POST_WHEN_CLAMP=sample   # one of: deny|sample|allow
SIGNALS_POST_SAMPLE_PCT=30       # used when CLAMP + 'sample'
SIGNALS_POST_ADMIN_OVERRIDE=false
```

Behavior:
- When enabled, each Telegram post is gated by hour/day counters and cooldown.
- Clamp-aware: if auto-guard/budget-guard clamps the system, policy can either `deny`, probabilistically `sample`, or `allow` as usual.
- Admin override: when `SIGNALS_POST_ADMIN_OVERRIDE=true`, `/signals_now` bypasses the budget.
- Redis is used if `REDIS_URL` is set; otherwise, an in-memory fallback is used.

Metrics added to `/metrics`:
```
signals_post_allowed_total
signals_post_denied_total
signals_post_denied_cooldown_total
signals_post_denied_hour_cap_total
signals_post_denied_day_cap_total
signals_post_denied_clamp_total
signals_post_sampled_drop_total
signals_post_hour_used
signals_post_day_used
```

Operator smoke (local):
```
HEALTH_PORT=3000 pnpm run rehearse:signals
bash scripts/signals_budget_smoke.sh
```

### Quiet Hours / Emergency Mute / Partner Allow-list (env-gated; default OFF)

Precedence: muted > quiet_hours > allowlist > posting budget > cooldown.

Env (append to .env.prod as needed):
```
SIGNALS_QUIET_ENABLED=false
SIGNALS_QUIET_WINDOW_UTC=00:00-06:00
SIGNALS_QUIET_ADMIN_OVERRIDE=false
SIGNALS_EMERGENCY_MUTE=false
SIGNALS_PARTNER_ALLOW_ENABLED=false
SIGNALS_PARTNER_ALLOW_FILE=ops/allowlist.txt
```

Behavior:
- Emergency Mute: if `SIGNALS_EMERGENCY_MUTE=true`, all TG posts suppressed. `/signals_now` replies "Broadcast muted." (admin override only if `SIGNALS_QUIET_ADMIN_OVERRIDE=true`).
- Quiet Hours: if `SIGNALS_QUIET_ENABLED=true` and current UTC is inside any window from `SIGNALS_QUIET_WINDOW_UTC` (e.g., `00:00-06:00,22:00-23:00`), posts are suppressed unless admin override enabled and caller is admin.
- Partner Allow-list: if `SIGNALS_PARTNER_ALLOW_ENABLED=true`, only symbols/addresses present in `SIGNALS_PARTNER_ALLOW_FILE` are allowed. Lines are lowercased symbols or 0x addresses; reloads on mtime or every ~60s.

Metrics:
```
signals_post_denied_quiet_total
signals_post_denied_muted_total
signals_post_denied_allowlist_total
```


## Backtest
```
BASE_URL=http://127.0.0.1:${HEALTH_PORT:-3000}
HTTP_ONLY=true DEMO_MODE=true SIGNALS_ENABLED=true pnpm run signals:backtest
```

## Discovery (poll) — Ink adapter
- Adapter: `src/signals/adapters/ink_discovery.ts`
- Env:
  - `SIGNALS_SOURCE=poll` (default)
  - `SIGNALS_POLL_MS=5000`
  - `SIGNALS_CHAINS=ink`
- Dedupe: in-mem Set; if `REDIS_URL` set, also uses `SADD signals:seen` with `EXPIRE 24h`.

## WebSocket (QuickNode) — optional
- Adapter: `src/signals/adapters/ws_quicknode.ts`
- Env (all default-off):
  - `SIGNALS_WS_ENABLED=false`
  - `QUICKNODE_WSS_URL` (or derive from `QUICKNODE_RPC_URL` → `wss://...`)
  - `SIGNALS_WS_TOPICS` (optional, comma-separated addresses for logs)
  - `WS_HEARTBEAT_MS=20000`, `WS_IDLE_TIMEOUT_MS=45000`
  - `WS_BACKOFF_MS=500`, `WS_MAX_BACKOFF_MS=15000`, `WS_JITTER_PCT=20`, `WS_MAX_RETRIES=0`
  - `WS_MAX_INFLIGHT=4`, `HEAD_DEBOUNCE_MS=300`
- Behavior:
  - DEMO_MODE=true → never attempt WS; falls back to poll.
  - After 5 rapid failures (60s window) → soft-disable WS and log `ws:fallback_to_poll`.
  - No secrets/addresses printed; masked logs only.

## Metrics & Alerts
- Metrics snapshot included under `/metrics` payload as `signals`.
- Counters/gauges/histograms:
  - `signals_ticks_total`, `signals_windows_built_total`, `signals_emitted_total`, `signals_attestations_total`
  - `signals_compute_ms_p50`, `signals_compute_ms_p95`
  - WS: `signals_ws_connects_total`, `signals_ws_reconnects_total`, `signals_ws_errors_total`, `signals_ws_skipped_triggers_total`, `signals_ws_connected`, `signals_ws_compute_ms_p50`, `signals_ws_compute_ms_p95`
- Alerts (optional; when `ALERTS_ENABLED==='true'` & `SIGNALS_ENABLED==='true'`):
  - If `signals_emitted_total` stays 0 for >10m → alert `signals_silence`.
  - If `signals_compute_ms_p95` > `SIGNALS_COMPUTE_P95_MS` (default 300) → alert `signals_slow`.

## Rehearsal
```
HEALTH_PORT=3000 pnpm run rehearse:signals    # poll/stub demo
HEALTH_PORT=3000 pnpm run rehearse:ws         # WS if enabled + URL present; else poll
```

## HMAC usage (optional)
```
export HMAC_API_SECRET=secret123
HEADERS=$(node tools/hmac_sign.js GET "")
echo "$HEADERS"
curl -fsS -H "X-Timestamp: <from tool>" -H "X-Signature: <from tool>" "$BASE/signals"
```

## Go-Live (canary)
```
HEALTH_PORT=3000 pnpm run rehearse:signals

PRESET=live pnpm run env:gen
bash ops/safe_mode.sh
pnpm run signoff

# enable signals only (broadcast remains off)
# edit .env.prod: set SIGNALS_ENABLED=true; keep SIGNALS_BROADCAST_ENABLED=false
bash ops/pm2_reload.sh

# manual admin test in TG: /signals_now
```
# Signals (optional, default-off)

This is a thin scoring layer over discovery ticks with attestation and redacted exposure. It is default-off and env-gated. No changes to existing HTTP/Telegram contracts.

## Formula

Score = 1.5*z(vol_5m) + 1.0*z(price_15m) + 1.2*z(maker_5m) – penalties

Penalties (env-tunable):
- contract age < SIGNAL_MIN_CONTRACT_AGE_DAYS → −1.5
- blacklist proximity > 0.5 → −1.0
- invariant warnings (count) → −min(2, 0.5 × count)

## Windows & Aggregates
- Ring-buffer of 60 minute buckets.
- computeWindowAgg(5) and computeWindowAgg(15) for short windows.

## Attestation
- attest(input) -> { id, sha256, generated_at } where input is the normalized snapshot for the signal calculation.
- Storage: in-memory; if REDIS_URL set, Redis keys signals:att:<id> with TTL 24h.
- Endpoint: GET /signals/:id/attestation returns { id, sha256, generated_at }.

## Public status
- GET /status/public (read-only):
```
{ slo, routesSummary, config:{ fingerprint_sha256 },
  signals:[{ symbol, score, vol_5m, price_15m, attestationId }] }
```
- No raw addresses or hashes in this endpoint; only attestationId.

## Telegram
- /signals_now (admin-gated) → posts top-5 to current chat. Default-off behind SIGNALS_BROADCAST_ENABLED=false.
- /signals_auto (admin-gated) → toggles periodic posts every ~3×SIGNALS_POLL_MS.
- Dedup via in-mem/Redis key signals:posted:<id> TTL 10m.

## HMAC partner API (optional)
- GET /signals returns full signals list only when HMAC_API_ENFORCE=true and HMAC_API_SECRET set.
- Headers: X-Timestamp, X-Signature where signature = sha256_hex(timestamp + body).
- Only wraps the new /signals route; does not affect existing routes.

## Env toggles
```
SIGNALS_ENABLED=false
SIGNALS_POLL_MS=5000
SIGNALS_WS_ENABLED=false
SIGNALS_BROADCAST_ENABLED=false
SIGNALS_CHANNEL_ID=
HMAC_API_ENFORCE=false
HMAC_API_SECRET=
```

## Backtest
```
BASE_URL=http://127.0.0.1:${HEALTH_PORT:-3000}
HTTP_ONLY=true DEMO_MODE=true SIGNALS_ENABLED=true pnpm run signals:backtest
```

