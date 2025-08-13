# Timeouts, Backoff, and Jitter Budgets

Client/network budget guidance for providers and RPC calls:

- CONNECT_TIMEOUT_MS: 3000 ms (default). Fail fast on connect stalls.
- TOTAL_TIMEOUT_MS: 7000 ms (default). Abort slow responses to preserve queues.
- BACKOFF_BASE_MS: 200 ms; BACKOFF_MAX_MS: 2000 ms. Exponential backoff with caps.
- JITTER_PCT: 15%. Apply ±jitter to spread retries and avoid thundering herd.

Circuit breakers already exist (`src/circuit.ts`) and should be respected by providers.

All values are configurable via environment variables and read by `src/config/budgets.ts`.


