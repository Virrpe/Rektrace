### GoldRush (Covalent) Controls

```
GOLDRUSH_MAX_CONCURRENCY=4     # Max concurrent Covalent calls
GOLDRUSH_CREDIT_W_HOLDERS=3    # Est. credits per holders call
GOLDRUSH_CREDIT_W_DEPLOYER=2
GOLDRUSH_CREDIT_W_APPROVALS=3
GOLDRUSH_CREDIT_W_TRACE=10
```
## Configuration – RekTrace RugScanner

### Environments
- Demo: `.env.demo` for deterministic runs (no live calls)
- Local: `.env.local` for Telegram bot testing with DEMO wall
- Prod: `.env` or `.env.prod` for live canary/production

### Variables

Required (Prod)
- TELEGRAM_BOT_TOKEN — Telegram bot token
- API_KEY — HTTP API key to protect endpoints
- GLOBAL_QPS — e.g., `8`
- ALERT_THROTTLE_MIN — minutes between alert batches per token (e.g., `10`)
- ALERTS_CHECK_INTERVAL_MS — checker interval (e.g., `600000`)
- ALERT_SCORE_DROP — integer drop threshold (e.g., `10`)
- COVALENT_API_KEY — for EVM holders and contract meta

Optional
- DEMO_MODE — `true` disables live provider calls
- REDIS_URL — enables Redis-backed caches and subscriptions
- PROVIDER_TIMEOUT_MS — default `2500` (tests use tighter defaults)
- PROVIDER_RETRY — default `1` (tests may force `0`)
- SCAN_TTL_SECONDS — default `120`
- LP_TTL_SECONDS — default `600`
- ADMIN_CHAT_ID — enables admin features (alerts toggle, cache bust)
- HEALTH_PORT — default `3000`
- ENABLE_LIQ_TEST — permit liquidity calls in tests when set to `true`
- INK_RPC — comma-separated RPC endpoints for Ink (optional locally; required in prod for Ink)

### Samples

`.env.demo`
```
DEMO_MODE=true
TELEGRAM_BOT_TOKEN=TEST_TOKEN
API_KEY=demo_key
GLOBAL_QPS=8
ALERT_THROTTLE_MIN=10
ALERTS_CHECK_INTERVAL_MS=600000
ALERT_SCORE_DROP=10
```

`.env.local`
```
DEMO_MODE=true
TELEGRAM_BOT_TOKEN=<REDACTED>
API_KEY=demo_key
GLOBAL_QPS=8
```

See `.env.prod.sample` for production keys.


