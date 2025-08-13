# Data Contracts

## GET /status

Response 200 (JSON):
```
{
  "budgets": {
    "providerTimeoutMs": number,
    "providerRetry": number,
    "scanTtlSec": number,
    "lpTtlSec": number
  },
  "breakers": {
    [name: string]: { state: "open"|"half"|"closed", lastTransitionSecAgo: number }
  },
  "alerts?": { subscribedTokens: number, nextCheckEtaSec: number|null }
}
```

## GET /metrics

Response 200 (JSON):
```
{
  "uptimeSec": number,
  "rss": number,
  "heapUsed": number,
  "heapTotal": number,
  "platform": string,
  "node": string,
  "providers": {
    [provider: string]: { success: number, fail: number, lastLatencyMs: number, avgLatencyMs: number, p50?: number|null, p90?: number|null, errorPct?: number }
  },
  "goldrushUsage": { calls: number, estCredits: number }
}
```

## POST /api/scan

Request (JSON):
```
{ token: string, chain?: string, enrich?: boolean }
```

Validation rules:
- `token`: required, 1..256 chars, must not contain `..`. Shortener URLs are rejected.
- `chain` (optional): among supported aliases (eth, ethereum, bsc, binance-smart-chain, polygon, polygon-pos, matic, arb, arbitrum, arbitrum-one, op, optimism, optimistic-ethereum, avax, avalanche, ftm, fantom, base, sol, solana, ink)
- `enrich` (optional): boolean

Response 200 (JSON): one of
```
{ status: 'ok', query: string, items: Array<{ chain: string, address: string, holders: number|null, flags: string[], score: number, sources: string[], confidence?: 'high'|'medium' }>, consensus?: {...} }
{ status: 'ambiguous', query: string, suggestions: Array<{ label: string, chain: string, address: string }>, hint: string }
{ status: 'not_found', query: string }
{ status: 'error', query: string, message: string }
```

## GET /api/scan/:chain/:token?enrich=true

Path params: `:chain` per alias list; `:token` URL-encoded.

Response 200 (JSON): same as ok schema above.


