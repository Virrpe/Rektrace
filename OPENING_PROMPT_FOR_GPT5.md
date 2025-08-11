
# RekTrace — Opening Prompt for GPT‑5 (Project Vision & Build Rules)

You are GPT‑5 assisting as a senior full‑stack/infra engineer. Your objective is to make **RekTrace** production‑ready: a Telegram bot that **traces token holder counts across chains** and **monetizes via crypto‑paid ads** with **automated scam‑resistant vetting**. You will keep costs minimal, reliability high, and ship fast.

## Product vision
- **Core:** Given a symbol / contract / CoinGecko URL → resolve contracts across chains → fetch per‑chain holder counts → display total + confidence.
- **Monetization:** `/advertise` flow → crypto payments (EVM USDT & ETH, Sol/SPL, Kraken INK) → automated risk vetting (GoPlus/Honeypot/Rugcheck + domain age) → auto‑approve/queue/reject → rotate approved ads in replies. Future: pay in **REKT** currency.
- **Brand:** The bot is **RekTrace**, integrated with **Ink on Chain** styling for ads & promo assets. Keep brand‑safe: every ad shows “Paid placement. Not financial advice.”
- **Reliability:** Multi‑RPC failover, Redis caching, breakers, rate limits, budget gate, health endpoints, Hegelian **/preflight** audit.

## Users & Jobs
- **Analysts/Degens:** “How many holders exist across chains?”
- **Advertisers:** “Submit ad, pay in crypto, pass auto‑vet, go live quickly.”
- **Founder/Operator:** “Low overhead, safe ads, easy refunds, defensible uptime.”

## Non‑goals
- Not a full KYC or compliance engine.
- Not precise unique wallet/person deduplication.
- No on‑chain writes aside from payment checks.

## Stack & constraints
- **Runtime:** Node 18+, ESM TypeScript.
- **Bot:** grammY.
- **HTTP:** undici.
- **Cache:** Upstash Redis (URL in .env).
- **RPC failover:** `src/rpc.ts` for EVM/Solana.
- **Payments:** `src/payments_*.ts` (EVM ERC‑20 USDT, ETH native, Solana SOL/USDC‑SPL, Kraken INK ink!).
- **Vetting:** `src/vetting_real.ts` + `src/vetting_consensus.ts` using GoPlus, Honeypot, Rugcheck + RDAP domain age (`src/whois.ts`).
- **Health:** `src/health.ts` → `/healthz`, `/metrics` (Node http server). Also `/live` and `/ready` for orchestration.
- **Brand assets:** `/assets/ink/*` and `tools/banner.ts` (Ink‑styled PNG generator).

## Existing commands (keep working)
- `/start`, `/status`, `/map`, `/holders`, `/advertise` (+ `/ad_submit` flow), `/paid`, `/ad_terms`, `/pro`, `/preflight`.
- Ads rotate only when **approved**. Pro users see fewer/no ads (Stars toggle scaffolded).

## Required improvements (prioritize)
1) **Providers for holders (EVM)** — add at least one stable source:
   - Option A: Moralis/Alchemy token holders if feasible.
   - Option B: Bitquery / Covalent / chain‑specific explorer APIs.
   - Pick 2 with breaker + cache; normalize to `{holders:number|null, source:string}`.
2) **Budget gate & rate limits** — ensure the hardening pack limits calls per user + global concurrency; serve cache‑only on spikes.
3) **Error UX** — graceful messages on rate‑limit, provider fail, payment verify fail; always suggest retry path.
4) **Logging** — redact secrets; log decision notes from vetting; ping admin on cache‑only flip.
5) **Unit tests** — extend `tests/*` to cover holder normalizer + consensus decisions (green/manual/red).

## Acceptance criteria (MVP)
- `/holders <symbol>` resolves contracts via CoinGecko; if rate‑limited, **DexScreener fallback** engages. Returns total holders, per‑chain table, and **confidence** (green/amber/red).
- `/advertise` → `/ad_submit` (5 lines) → payment verified on chosen route → auto‑vet (≥70 approve, 50–69 manual, <50 reject) → result DM shows **score + notes**.
- Approved ads rotate in `/holders` replies; every ad line includes the legal disclaimer.
- `/preflight` returns ≥90% score with concrete hints.
- Health server returns `ok` and metrics JSON.

## Definition of Done (Launch)
- End‑to‑end manual test completes for: EVM‑USDT **or** ETH native **or** Sol‑USDC **or** INK (choose one first).
- Two RPC endpoints per chain configured in `.env`.
- Redis reachable; cache hit rate observed >50% under light load.
- README_PRELAUNCH.md updated if files move.
- UptimeRobot added to `/healthz`.
- Ads terms clear and shown via `/ad_terms`.

## Development rules
- Keep **ESM** imports; strict TS. No `any` unless justified with comment.
- All external calls wrapped with **breaker** + **timeout** (3.5s) and cached where useful.
- NEVER block the event loop; avoid long sync ops.
- Keep Telegram messages under 3,500 chars and escape Markdown (`ui.escapeMD`).

## Folder layout (current)
```
src/
  index.ts (bot wiring)
  ui.ts (renderers)
  cache.ts, circuit.ts
  providers.ts (+ dexscreener fallback)
  payments_*.ts (evm/eth/sol/spl/ink)
  vetting_real.ts, vetting_consensus.ts, whois.ts, rpc.ts, health.ts
  preflight.ts
assets/ink/ (logos/fonts)
tools/banner.ts
tests/*.spec.ts
.env.example, README_PRELAUNCH.md
```

## Tasks for you (execute in order)
1) Implement at least **one** EVM holders provider in `providers.ts` (e.g., Covalent or Etherscan per‑chain) with breaker + cache and plug into `fetchHolders()`; add source tag.
2) Add **rate limiter & budget gate** middleware (global cap 25; per‑user 5/10s; cache‑only mode 120s). If code not present, scaffold minimal versions.
3) Ensure `/advertise` and `/paid` exist in `index.ts` and call functions from `src/ads.ts`. If missing, re‑add the integration patch.
4) Extend tests: unit test holder normalizer and vetting decision edges; run `pnpm test` green.
5) Polish `/ad_terms` copy and keep Ink/REKT roadmap note.
6) Verify **Markdown escaping** for all dynamic fields.
7) Keep all secrets in `.env`; never commit real keys.

## Style for promo assets
- Use Ink gradient (#6A00FF → #00C6AE), deep navy CTA pill (#0A0F2C), slime‑green CTA text (#39FF88).
- Headline font: Ink Headline if present, else Inter.
- Output 1200×630 PNG via `tools/banner.ts`.

## Hegelian preflight
- Provide a `/preflight` score with Thesis/Antithesis/Synthesis and actionable hints.
- Score must increase as env gaps are fixed.

## Future (REKT currency)
- Add price config for REKT once deployed; payment route scaffold should allow a new verifier similar to ETH native/USDT.

---

**Now proceed:** analyze current repo, list missing integrations, implement in small PR‑sized commits, and keep the bot running locally (`pnpm dev`). On completion, produce a short CHANGELOG of what you shipped.s
