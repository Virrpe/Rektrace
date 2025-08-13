## Security Contact

If you discover a vulnerability, please email: security@staticmind.xyz

Do not file public issues for security reports. We aim to triage within 72 hours.

# Security Overview

Scope: Rektrace RugScanner (Telegram + HTTP API) with optional Redis and external providers.

Contact: Open an issue or contact maintainers. Do not include secrets in reports.

## Threat Model (STRIDE-lite)

- Spoofing: Telegram admin spoofing. Mitigation: `ADMIN_CHAT_ID` check; unauthorized responses for admin endpoints.
- Tampering: Malformed JSON/path. Mitigation: strict `Content-Type` (opt-in), input validation for `/api/scan`, safe defaults.
- Repudiation: Minimal logs; include route and timing; avoid PII beyond masked addresses.
- Information disclosure: Security headers (`nosniff`, `DENY`, no referrer, restrictive CSP). No stack traces in API responses.
- DoS: Global bucket limiter, optional per-IP rate limiter, configurable body size limit, provider breaker states.
- Elevation of privilege: Admin commands gated by `ADMIN_CHAT_ID`; HTTP API key optional.

## Guardrails (env toggles)

- `SECURITY_HEADERS=true` (default): add defensive headers to responses.
- `STRICT_CONTENT_TYPE=true` (optional): require `application/json` for POST bodies.
- `MAX_BODY_BYTES=65536`: reject large bodies.
- `RL_ENABLED=false` (opt-in): per-IP sliding window. Configure `RL_WINDOW_MS` and `RL_MAX`.

## Abuse Cases

- Oversized POST to `/api/scan` → 413/400.
- Wrong content-type → 415/400.
- Invalid chain/token → 400.
- Burst requests → observe 429s without process crash.
- Admin endpoint hits without admin → 401/403/Unauthorized response.

## Reporting

Please report vulnerabilities privately. Do not disclose publicly until a fix is available.

## Security – RekTrace RugScanner

### Demo wall
- With `DEMO_MODE=true`, the system uses deterministic demo data and will not hit live providers. Background alerts are disabled.

### Privacy & language
- Uses only public on-chain and public web data. Responses communicate “risk signals” and do not constitute financial advice.

### Denylist rationale
- URL shorteners are blocked in both HTTP and Telegram to reduce phishing risk and improve traceability. Users are prompted to paste the final URL.

### Secrets handling
- All secrets reside in `.env.*` files. Never commit real keys. Mask secrets in logs and documentation.

### Incident response
- Revoke API keys, rotate provider keys, rollback to DEMO mode, increase cache TTLs, reduce provider timeouts/retries, and monitor `/metrics` and `/status` until stabilized.


