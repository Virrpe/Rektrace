## API – RekTrace RugScanner

### HTTP Endpoints

POST /api/scan
- Auth: optional `X-API-Key: <key>` (required if `API_KEY` is set)
- Body (JSON): `{ token: string, chain?: string }`
- Response: `{ status: 'ok'|'ambiguous'|'not_found'|'error', query, items?, suggestions?, hint?, message? }`
  - items[].fields: `chain`, `address`, `holders` (number|null), `confidence` ('high'|'medium'), `flags` (string[]), `score` (0..100), `sources` (e.g., ['goplus','rugcheck','holders:covalent'])
- Errors: `401 unauthorized` (bad key), `429 rate limit`, `200 {status:'error', message}` for upstream issues

GET /api/scan/:chain/:token?enrich=true
- Auth: optional `X-API-Key`
- Query: `enrich=true` to include best-effort enrichment
- Response: same as POST; with `enrichment` when applicable:
  - enrichment.price: `{ change24h?, baseSymbol?, quoteSymbol?, pair? }`
  - enrichment.contract: `{ createdAt?, deployer?, deployerTxCount? }`

Notes
- “Risk signals” language: scores/flags are risk indicators, not financial advice
- Provider best-effort: LP lock/burn/unlock heuristics derived from DexScreener metadata
- DEMO mode: deterministic data; no live provider calls

Examples
```bash
curl -s -X POST http://127.0.0.1:3000/api/scan \
  -H 'content-type: application/json' \
  -H 'X-API-Key: demo_key' \
  -d '{"token":"pepe"}' | jq

curl -s 'http://127.0.0.1:3000/api/scan/ethereum/0xdeadbeef...?enrich=true' \
  -H 'X-API-Key: demo_key' | jq
```

### Observability Endpoints
- GET `/status` → budgets + breaker states; include alerts block only with `?verbose=1`
- GET `/metrics` → JSON: uptime, memory, `providers` with `p50`,`p90`,`errorPct`
- GET `/healthz` → `ok`

SLO snapshot (additive on `/status`): when requested, body includes `slo: { p95_ms, error_rate_1m, breaker_hits_1m }`.

### Telegram Commands & UX
- /help: Ink-first help; default-to-ink when no prefix
- /scan <query>: resolves across chains; default-to-ink when no prefix; ambiguity handled with inline pagination (6/page). Supported prefixes include `eth:`, `bsc:`, `arb:`, `op:`, `base:`, `matic:`, `sol:`, `ink:`.
- /top_ink: top Ink pairs (DexScreener shard); 6/page; quick buttons: Scan, Watch
 - Scan results include: 🛡️ Swap (guarded) — shows estimated output/minOut with 2% guard, risk bullets, and neutral links (Explorer/Pair). No custody; set slippage manually.
 - /revoke_last <wallet> (Ink): lists recent approvals with Explorer links and safety note; best-effort in demo.
 - /watch <chain:token|token> [drop unlockDays]: add to watchlist (cap 5); defaults drop=10 unlockDays=7
 - /unwatch <chain:token|token>: remove from watchlist
 - /my_watchlist: list up to 5 watched tokens with thresholds
- /scan_plus <query>: enriched variant; shows price snapshot and contract meta when keys available
- /trace <wallet>: best-effort related wallets and LP events count
- /recent_rugs: last 20 low-score observations (in-memory)
- /status: budgets + breaker transitions summary (Markdown)
- /my_alerts: list subscriptions with inline `🔕 unsub`

Inline Buttons
- 📊 Full report → re-scan exact; 📍 respects RL
- 🧭 Trace deployer → best-effort tracer
- 🔔 Alert me → subscribe the current token
- Callback size: Telegram `callback_data` must be ≤64 bytes; this bot uses a Redis/in-memory mapper with TTL=600s. Expired → “Expired. Please retry.”

Rate-limit behavior
- Global token bucket (HMR-safe). Exceeding → `429` on HTTP; friendly message in chat for scans.
- URL shortener denylist is enforced in both HTTP and chat; users are asked to paste final URL.


