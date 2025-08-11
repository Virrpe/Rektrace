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

