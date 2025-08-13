# RekTrace — Ink-First PRD / Roadmap / Execution Checklist
**Org:** Pomodoro Labs (parent studio)  
**Product:** RekTrace (Telegram bot + HTTP API)  
**Focus chain:** Ink (OP Stack L2, chainId 57073)  
**Date:** 2025-08-11

---

## 0) Autopilot protocol (for Cursor GPT)
- You are the **Release Captain**. Do all terminal/file actions yourself (edit files, run tests, launch demo/canary).
- Keep diffs tiny (≤5 lines/file) unless creating new files.
- **Never break**: Demo wall, timeouts/retries, circuit breakers (with lastTransitionAt), cache TTLs, Markdown escaping, global QPS, shortener denylist, callback_data TTL (<64B map), ops routes (/status, /metrics, /health) unthrottled.
- Ask for **secrets only** when needed. Store in `.env.*` (git-ignored). Never echo secrets.
- All tests must stay green. Demo mode must remain offline-safe.

---

## 1) Narrative & positioning
**Why this exists:** SquidSwap rugged users via **LP unlock at ~90d**. RekTrace prevents repeats by giving **instant, explainable risk** and **alerts for unlock windows & score drops**—inside Telegram.

**Ecosystem path:** RekTrace (now) → **RektPad** (safety-gated launchpad) → **$REKT** (utility).  
**Community:** rektink.com NFTs + TG network → immediate distribution.  
**Differentiation:** clarity, speed, reliability—**no special treatment** for any DEX. Quietly outperform.

---

## 2) Goals, KPIs, SLOs
**Primary (first 14 days on Ink)**
- **Activation ≥ 35%** (new users with ≥2 scans first session)
- **Alert opt-in ≥ 10%** on Ink scans
- **Inline usage ≥ 20%** of scans via `@Bot inline`
- **2–3 partner tools** using the HTTP API

**Latency/SLO**
- Telegram p90 ≤ **3s**, HTTP p90 ≤ **2.5s**
- Provider p90 ≤ **2.2s**, errorPct ≤ **5%**
- Availability ≥ **99.9%** (≈43.8 min/month)

---

## 3) Non-negotiable guardrails
- `DEMO_MODE=true` must **never** hit live providers.
- All external calls use **timeouts/retries/breakers** + cache TTLs.
- **Markdown** escape all user content; **shortener denylist** (HTTP + chat).
- **Global QPS** active; **/status, /metrics, /health** exempt.
- **Callback** payloads via TTL map (<64B); expired → “Expired. Please retry.”
- Ads: no ads for the **currently scanned** token; **score ≥ 70** gate.

---

## 4) Tech baseline (already in repo)
- **Entrypoint:** `rektrace-rugscan/src/index.ts` (Telegram + HTTP, health, webhook)
- **Commands:** `/scan`, inline scans w/ pagination, `/scan_plus`, `/trace`, `/recent_rugs`, `/status`, `/my_alerts`
- **Scan pipeline:** EVM (GoPlus + Covalent holders), Solana (RugCheck), DexScreener (liquidity/LP), LP lock/burn/unlockDays + locker hints
- **Enrichment:** price snapshot; deployer/creation; 10-min cache
- **Alerts:** subscribers + background checker (score drop ≥X, LP unlock ≤Y); DM throttle + per-user cap
- **Reliability:** provider router w/ timeouts, retries, breakers; Redis cache fallback; **global QPS** token bucket (HMR-safe)
- **Observability:** `/metrics` (counts, p50/p90/errorPct), `/status` (budgets, breakers + lastTransition), `?verbose=1` surfaces alerts stats
- **Safety:** shortener denylist; callback map; Markdown everywhere
- **Ink wired:** chainId 57073, DexScreener `ink` shard, Covalent mapping; GoPlus graceful fallback (flag `goplus_unavailable`)
- **Tests:** 30+ Vitest; Node canary harness available (`tools/canary_node.js`)

---

## 5) Scope for Ink v1 (ship now)
**In**
- Default-to-Ink when no prefix
- `/top_ink` (DexScreener ink shard; 6/page; “🔍 Scan” / “🔔 Watch”)
- Watchlist v1 (5 tokens): `/watch`, `/unwatch`, `/my_watchlist`
- Per-token alert thresholds (drop ≥ X, unlock ≤ Y days)
- **Swap (guarded)** stub: estimate minOut, approval/slippage warnings, deep-link (no custody)
- `/revoke_last` helper (list last approvals on Ink)
- Inline share prompt in groups (“Share compact card?”)
- Creator ad **split payouts** (0xSplits/PaymentSplitter), 50/50

**Out (later)**
- Full router/aggregator; portfolio; PnL; advanced charts

---

## 6) Milestones & acceptance
### M1 — Default-to-Ink + /help + /top_ink (Day 1–2)
- Parser: if no `chain:` prefix → assume `ink:`
  - **Snippet:**  
    ```ts
    // commands.ts – normalize query
    const hasPrefix = /^(eth|ink|bsc|arb|op|base|avax|ftm|sol):/i.test(q);
    const normalized = hasPrefix ? q : `ink:${q}`;
    ```
- `/help`: Ink-first examples; mention default behavior
- `/top_ink`: fetch top pairs (DexScreener ink shard); show symbol, 24h %, 24h vol, quick buttons
- **Tests:** `default_to_ink.spec.ts`, `top_ink.spec.ts` (DEMO mocks, pagination)

**DoD:** tests + typecheck green; DEMO safe; buttons work; no API shape changes

---

### M2 — Watchlist v1 + thresholds (Day 3–4)
- Commands: `/watch`, `/unwatch`, `/my_watchlist` (cap 5)
- Per-token prefs: `{ drop: number, unlockDays: number }` (defaults 10 & 7)
- Alerts checker reads per-token prefs; still respects DM cap + throttler
- **Tests:** `watchlist.spec.ts`, `alert_thresholds.spec.ts`

**DoD:** CRUD ok; thresholds enforced; deterministic tests

---

### M3 — Swap guard stub + `/revoke_last` (Day 5–7)
- Button under scan: **“Swap (guarded)”** → shows estimated output/minOut (1–2% guard), approval/slippage warnings, external link
- `/revoke_last`: list recent approvals on Ink (best-effort), explorer links, “why revoke” copy
- **Tests:** `swap_guard.spec.ts`, `revoke_helper.spec.ts`

**DoD:** messages render; no external tx; safe copy; tests green

---

### M4 — Inline share + creator split ads (Day 8–9)
- Group scans: show “Share compact card?”; posts inline card on tap
- Ads: add `payout_policy` and surface **split address** (no custody); verify receipt via RPC/webhook, then mark Paid
- **Tests:** `inline_share.spec.ts`, `ads_split.spec.ts`

**DoD:** share works; ads show split; demo keeps fake paid; tests green

---

### M5 — Launch day (Day 10)
- Node canary harness:
  - **Pass A:** at/below QPS (no 429) → availability ≤0.1%, HTTP p90 ≤2.5s, providers PASS
  - **Pass B:** stress (≥GLOBAL_QPS) → 429 observed (not gated)
- 30–60 min prod watch: provider p90 ≤2.2s, errorPct ≤5%; ops routes unthrottled
- Seed 3 Ink groups (pinned demo), 2–3 tool partners with API keys

**DoD:** gates met; PRELAUNCH updated with canary/GO

---

## 7) Monetization & trust
- Ads allowed only if **score ≥ 70**; never for **current scan**
- On-chain **split payouts 50/50** to you + creator via 0xSplits/PaymentSplitter (Ink EVM)
- Stripe Connect (optional) for fiat with split to creator account
- Transparent: show “Ad • Not financial advice • Risk signals only”

---

## 8) Ops playbooks
**Provider brownout**
- Breaker opens → serve cached; badge “Degraded (cached)”
- If persistent: lower `PROVIDER_TIMEOUT_MS` −20%, increase `*_TTL_SECONDS` ×2

**Rate-limit abuse**
- Keep GLOBAL_QPS; ops routes exempt
- Flip to **auth-first** on `/api/scan` if abused (2-line swap)

**Alert noise**
- Raise `ALERT_THROTTLE_MIN`; DM cap still on; add “once/day” mode if needed

**Rollback**
- Keep last tag built; `pm2 delete` current; start previous build with `.env.prod`

---

## 9) ENV (prod template)
```dotenv
NODE_ENV=production
DEMO_MODE=false
HTTP_ONLY=false

TELEGRAM_BOT_TOKEN=...
ADMIN_CHAT_ID=...
API_KEY=...
REDIS_URL=...

GOPLUS_API_KEY=...
COVALENT_API_KEY=...
ETH_RPC=https://...,https://...
INK_RPC=https://rpc-gel.inkonchain.com

GLOBAL_QPS=8
PROVIDER_TIMEOUT_MS=2500
PROVIDER_RETRY=1
SCAN_TTL_SECONDS=120
LP_TTL_SECONDS=600
BREAKER_CLOSE_AFTER=3
ALERT_THROTTLE_MIN=10
ALERTS_CHECK_INTERVAL_MS=600000
ALERT_SCORE_DROP=10
