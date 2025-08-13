# Red Team Playbook (Non-Destructive)

## Goals
- Validate guardrails without harming providers or users.
- Exercise edge cases and confirm stable, bounded responses.

## Quick start
```sh
# Start demo server in another terminal
HTTP_ONLY=true DEMO_MODE=true HEALTH_PORT=0 pnpm rugscan:dev & sleep 2

# Run abuse smoke
pnpm run smoke:abuse
```

## Vectors
- Content-Type misuse: send `text/plain` to `/api/scan` → expect 415/400 (if STRICT_CONTENT_TYPE=true)
- Oversized payload: exceed `MAX_BODY_BYTES` → expect 413/400
- Invalid params: bad chain/token → expect 400
- Traversal attempt: `/api/scan/ink/../../etc/passwd` → 400/404
- Burst: 10–100 parallel POSTs (tune RL/window) → some 429s acceptable, no crash
- Unicode confusables in token: visually deceptive but distinct chars → treated as text; validation should still apply

## Tuning
- Enable or tighten RL: `RL_ENABLED=true RL_WINDOW_MS=10000 RL_MAX=10`
- Enforce media type: `STRICT_CONTENT_TYPE=true`
- Limit body: `MAX_BODY_BYTES=65536`
- Add headers: `SECURITY_HEADERS=true`

## Expected responses
- 2xx for healthy paths; 4xx for bad requests; 429 for rate limits; 5xx only on internal errors (investigate)

## Notes
- Do not include secrets in requests.
- Logs are PII-masked by default; set `PII_MASK=false` only in controlled environments.


