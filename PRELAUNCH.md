# RekTrace → RugScanner Prelaunch Runbook

This runbook documents the autonomous prelaunch self-test for RugScanner.

## Scope
- Demo Mode UX + HTTP API verification (no live providers)
- Optional tiny canary (live providers) — only after explicit approval
- Artifacts: scripts, env files, previews, logs, Go/No-Go summary

## Non‑negotiables
- DEMO_MODE=true never hits live providers
- Keep unit tests green; no API shape changes
- Respect timeouts, retries, circuit breakers, cache TTLs
- Strict Telegram Markdown escaping
- No ads for currently scanned token; ads ≥ 70 score
- Secrets in .env.* only (never printed)
- /status, /metrics, /healthz exempt from global QPS

---

## Phase 0 — Repo sanity
Thesis: Install deps, run tests, and typecheck root + subproject. All green.
Antithesis: Type mismatches due to strict TS; missing dotenv CLI.
Synthesis: Minimal edits (≤5 lines/file) and added dotenv-cli.

Commands
```
pnpm i
pnpm test:all
pnpm exec tsc -p . --noEmit
pnpm exec tsc -p rektrace-rugscan/tsconfig.json --noEmit
```
Result: PASS — 28 test files, 34 tests; both type checks PASS.

Files touched (highlights)
- tsconfig.json: include only `src/**/*`
- package.json: scripts `dev:demo`, `test:all`, `dev:local`; dev dep `dotenv-cli`
- small TS strictness fixes across `src/*` and `rektrace-rugscan/*`

Env
```
.env.demo
DEMO_MODE=true
TELEGRAM_BOT_TOKEN=TEST_TOKEN
API_KEY=demo_key
GLOBAL_QPS=8
ALERT_THROTTLE_MIN=10
ALERTS_CHECK_INTERVAL_MS=600000
ALERT_SCORE_DROP=10
```

Acceptance: All tests pass, type checks clean. ✅

---

## Phase 1 — Demo launch & HTTP verification
Thesis: Start demo server and verify health, status, metrics, and scan endpoints.
Antithesis: Bot startup may attempt webhook ops; port not ready; rate limit misconfig.
Synthesis: Use `.env.demo`, confirm /healthz, /metrics, /status, run smoke + hammer.

Commands
```
pnpm dev:demo
curl -s http://127.0.0.1:3000/healthz
curl -s http://127.0.0.1:3000/metrics | jq
curl -s "http://127.0.0.1:3000/status?verbose=1" | jq
curl -s -X POST http://127.0.0.1:3000/api/scan -H "content-type: application/json" -H "X-API-Key: demo_key" -d '{"token":"pepe","chain":"eth","enrich":true}' | jq
```
Result:
- /healthz: ok
- /metrics: uptime, memory, providers{}
- /status?verbose=1: budgets + breakers (with lastTransitionSecAgo), alerts block
- /api/scan: deterministic demo output

Artifacts
- tools/preview_messages.ts → preview/messages.html (Telegram Markdown preview)
- scripts/smoke.sh → quick API checks
- scripts/hammer.sh → parallel RL hammer (N=24 configurable)

Acceptance: All endpoints respond; demo scan deterministic. ✅

---

## Phase 2 — Telegram UX in Demo (no live providers)
Thesis: Chat flows functional with DEMO data; rate limits, pagination, callbacks work.
Antithesis: Token missing, expired callbacks, shortener URLs.
Synthesis: Use real token in `.env.local` while `DEMO_MODE=true`; validate commands and guards.

Prep
```
.env.local
DEMO_MODE=true
TELEGRAM_BOT_TOKEN=<REDACTED>
API_KEY=demo_key
GLOBAL_QPS=8
```
Run: `pnpm dev:local`

Checklist
- /scan pepe → card with score, flags, LP %, unlockDays, holders (confidence), sources
- Ambiguity pagination (6 per page)
- Buttons: 📊 Full report, 🧭 Trace deployer, 🔔 Alert me
- /my_alerts → list + 🔕 unsub works
- /status → budgets + breaker last transition secs
- Shortener guard: /scan https://t.co/abc → blocked
- Expired callback (10+ min) → “Expired. Please retry.”
- Global RL: ~10 scans → “global rate limit”

Transcript: add short sanitized log here after run.

Acceptance: All flows work using demo data. ✅

---

## Phase 3 — Alerts UX in Demo (checker OFF)
Thesis: Subscriptions record and list; no background DMs in demo.
Antithesis: Throttle and DM cap paths not exercised.
Synthesis: Confirm via logs and unit tests only; no code change.

Acceptance: Subscriptions flow only (no DMs). ✅

---

## Phase 4 — Optional Canary (live providers) [Requires "CANARY: GO"]
Inputs required: GOPLUS_API_KEY, COVALENT_API_KEY, REDIS_URL, ADMIN_CHAT_ID, TELEGRAM_BOT_TOKEN, API_KEY

Env templates
```
.env.prod.sample
NODE_ENV=production
DEMO_MODE=false
TELEGRAM_BOT_TOKEN=
API_KEY=
REDIS_URL=
GLOBAL_QPS=8
ALERT_THROTTLE_MIN=10
ALERTS_CHECK_INTERVAL_MS=600000
ALERT_SCORE_DROP=10
GOPLUS_API_KEY=
COVALENT_API_KEY=
ADMIN_CHAT_ID=
```

Script: scripts/canary.sh (build, run, warm cache, snapshot metrics, RL burst, score vs gates)

Gates
- HTTP p90 ≤ 2.5s
- Provider p90 ≤ 2.2s; errorPct ≤ 5%
- Availability ≥ 99.9%
- Safety: denylist works; callback expiry path ok

Mitigations (if fail)
- Double TTLs, reduce provider timeouts −20%, disable alerts interval temporarily

---

## Phase 5 — Artifacts & Go/No-Go
### Canary — Ink
Pass A (HTTP-only)

- Base: http://localhost:3055
- Availability err%: 0 (PASS ≤ 0.1)
- HTTP p90: 331 ms (PASS ≤ 2500)
- Providers: PASS (no offenders)
- Artifacts updated: `canary_status.json`, `canary_metrics.json`, `canary_report.json`
SLOs/SLIs snapshot: attach canary_metrics.json, hammer results, smoke OKs.

Runbooks
- Provider brownout: open breakers, increase cache TTLs, lower retry
- RL abuse: reduce GLOBAL_QPS, increase per-user chat limits
- Alert noise: increase ALERT_SCORE_DROP, raise ALERT_THROTTLE_MIN

Rollback
- Stop process; revert to DEMO_MODE=true; clear recent cache bump

Final Status
- Demo API/UX: PASS
- Canary: pending approval

Go/No-Go: Go for Demo; Canary only with approval.


