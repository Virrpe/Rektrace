# Data Invariants (RugScan)

This document defines hard and soft invariants for RugScan responses and processing. These invariants are enforced by lightweight validators in `src/contracts/invariants.ts`. Violations can be logged or fail fast depending on `INVARIANTS_STRICT`.

Hard invariants (must hold):
- scan.status ∈ {'ok','ambiguous','not_found','error'}
- For status 'ok':
  - items is a non-empty array
  - Each item has: chain∈{'ethereum','binance-smart-chain','polygon-pos','arbitrum-one','optimistic-ethereum','avalanche','fantom','base','solana','ink'}, address is a non-empty string, score is 0..100, flags is array, sources is array with non-empty strings
- For status 'ambiguous': suggestions is a non-empty array with non-empty `label`, `chain`, `address`
- For status 'not_found': no `items`, `suggestions`
- For status 'error': `message` is a non-empty string

Soft invariants (recommended; logged if violated):
- Ethereum-style addresses are lowercase and match `^0x[a-f0-9]{40}$`
- Solana mints match base58 32..44 length
- Chain is explicitly whitelisted and normalized (aliases resolved before output)
- When `enrich=true` and enrichment is present:
  - enrichment.price/baseSymbol/quoteSymbol are strings if present
  - enrichment.contract fields, if present, are consistent types

Cache safety and TTL (observational checks):
- Scan cache TTL is finite and ≥ 1 second
- Cache versions are monotonic when bumped

Operational notes:
- By default, invariants are non-fatal: `INVARIANTS_STRICT=false`
- To fail fast in CI or pre-prod: set `INVARIANTS_STRICT=true`


