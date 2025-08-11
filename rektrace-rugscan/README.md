# RekTrace Rug Scanner (MVP)

A pivot module that turns RekTrace into a callable Rug Scanner bot while preserving the INK branding and ad monetization pipeline.

## Features
- `/scan <token|contract>`: scan by name or address
- `/scan_plus <token|contract>`: scan + enrichment (price 24h, trades, contract meta)
- `/trace <wallet>`: wallet tracing (related wallets via tx overlap; LP event count)
- `/recent_rugs`: last 20 low-score tokens observed
- Inline mode: `@botname <token>` in group chats
- Providers: GoPlus (EVM), RugCheck (Solana), holders via existing RekTrace providers
- Demo Mode: safe, deterministic mocks for scans and ads
- Reuses RekTrace ads vetting consensus and INK dark theme outputs
- Reliability: RPC failover, cache-first, circuit breakers

## Quickstart

Prereqs: Node.js 18+, pnpm

1. Install deps:
```bash
pnpm i
```

2. Demo mode run (safe; uses mocks):
```bash
export DEMO_MODE=true
export TELEGRAM_BOT_TOKEN=123:abc
pnpm --filter rektrace dev
```

3. Production run (real APIs):
- Set `.env` with:
  - `DEMO_MODE=false`
  - `TELEGRAM_BOT_TOKEN=...`
  - `REDIS_URL=...` (recommended)
  - `ETH_RPC=https://rpc1,...` and `SOL_RPC=https://rpc1,...` (2+ each)
  - Optional: `GOPLUS_API_KEY=...`, `COVALENT_API_KEY=...`
- Start:
Use repo root scripts `start-demo.sh` and `start-prod.sh` which set `DEMO_MODE` accordingly.

## Commands
- `/scan <token|contract>` — runs scan and returns a compact safety summary per chain.
- `/scan_plus <token|contract>` — adds enrichment context (cached 10m; graceful fallback).
- `/trace <wallet>` — shows related wallets and LP activity (best-effort; EVM via Covalent).
- `/recent_rugs` — shows last 20 tokens with score < 40 captured by the scanner.
- Inline: type `@YourBot query` and pick the scan card.
- `/advertise` — unchanged. Auto‑vetting uses RekTrace consensus; Demo Mode auto‑approves.

## API
- Webhook: `POST /api/scan` { token, chain? } → JSON (requires `API_KEY` if set)
- Quick GET: `GET /api/scan/:chain/:token` with optional `?enrich=true` and API key as header `X-API-Key` or query `api_key`

## Extending
- Add chains: extend `ChainId` in `src/scan.ts` and plug provider logic.
- Add providers: create new provider module reusing `breakers` / `rpc` / `cache` patterns from RekTrace.
- Deep scans: add premium routes and paid gating via Stars or on-chain receipts.

## Tests
- Existing `pnpm test` continues to run. The scanner uses mocks in `DEMO_MODE=true` so tests pass without external calls.
- To include real liquidity checks in CI, set `ENABLE_LIQ_TEST=true`.

## Structure
```
rektrace-rugscan/
  src/
    scan.ts        # core scan pipeline with Demo Mode
    commands.ts    # /scan, inline query, scan_plus wiring
    enrich.ts      # enrichment (price/trades/meta) with 10m cache
    wallet_trace.ts# wallet tracing
  README.md
```


