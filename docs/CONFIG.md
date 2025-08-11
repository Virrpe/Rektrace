# Config Overview (Resilience additions)

Env toggles (defaults):
- INVARIANTS_STRICT=false
- IDEMP_ENABLED=false, IDEMP_TTL_MS=60000
- CHAOS_ENABLED=false, CHAOS_PROB=0.05, CHAOS_MAX_LATENCY_MS=500
- CONNECT_TIMEOUT_MS=3000, TOTAL_TIMEOUT_MS=7000, BACKOFF_BASE_MS=200, BACKOFF_MAX_MS=2000, JITTER_PCT=15
 - MAINTENANCE_MODE=false — freeze switch; 503 for all routes except `/healthz`, `/metrics`, `/status`, `/live`, `/ready`
 - BREAKER_FORCE_OPEN=false — serve deterministic scan stubs; skip providers
 - READONLY_MODE=false — deny state-changing HTTP routes
 - LOG_REDACT_LIST= — comma-separated substrings to redact from JSON logs

Notes:
- Idempotency requires client to send `Idempotency-Key` header. Duplicate POST bodies within TTL return 409 when enabled.
- Chaos hooks affect outbound provider calls only when enabled.
- Invariants run post-processing. Strict mode returns 500 with masked note.


