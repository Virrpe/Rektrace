# Signal Flow

1) Entry
- Telegram updates handled by `rektrace-rugscan/src/index.ts` via `grammy`.
- HTTP requests handled by `startHealthServer` with routes `/status`, `/metrics`, `/api/scan`.

2) Core logic
- `/api/scan` → `scanToken` / `scanTokenExact` → providers (`providers.js`, `providers_goplus.js`, DexScreener via undici, Rugcheck for Solana).
- Consensus and flags assembled in `rektrace-rugscan/src/scan.ts`.

3) Breakers & Limits
- Provider breakers in `src/providers.js` (budget/timeouts).
- Global rate bucket in `rektrace-rugscan/src/rate_limit.ts`.
- Optional IP rate limiter and body size limits (security guardrails), env-gated.

4) Telemetry
- `/metrics` exposes uptime, memory, `getProviderMetrics()`, and `goldrushUsage`.
- `/status` shows breaker states and budgets, `?verbose=1` adds alert stats.


