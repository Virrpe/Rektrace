## GoldRush API Key Hardening

- Use Client IP Allow-list for the prod server key.
- Detect egress IP: `pnpm run ip:public` (writes `public_ip.txt`).
- Do not use Browser Origin allow-list for server keys.
- Rotate keys quarterly or on role changes.
- Monitor `/metrics.goldrushUsage` → `{ calls, estCredits }`. Set a soft alarm at ~70% monthly credits.
- Tune ENV:
  - `GOLDRUSH_MAX_CONCURRENCY=4..6`
  - `GOLDRUSH_CREDIT_W_HOLDERS`, `..._DEPLOYER`, `..._APPROVALS`, `..._TRACE`
## Operations – RekTrace RugScanner

### SLO/SLI targets
- Availability: 99.9% monthly (error budget ≈ 43.8 minutes)
- HTTP Latency: p50 ≤ 500ms, p90 ≤ 2.5s
- Provider Latency: p90 ≤ 2.2s, errorPct ≤ 5%
- Safety: 0 demo-wall violations; denylist active; callbacks expire as designed
- Rate limiting: ≤ 1% of legitimate requests should see 429 during steady state
- Alerts: delivery latency ≤ ALERTS_CHECK_INTERVAL_MS + 30s (production only)

### Error budget policy (43.8 min/month)
- If budget burn > 50% mid-cycle: reduce PROVIDER_TIMEOUT_MS by 20%, increase cache TTLs ×2
- If burn > 75%: disable background alerts temporarily, lower GLOBAL_QPS by 25%
- If burn > 90%: rollback to last known-good tag, force DEMO_MODE=true until stabilized

### Ops runbooks
- Provider brownout
  - Observe breaker state and provider errorPct via `/status` and `/metrics`
  - Actions: lower PROVIDER_RETRY to 0–1, decrease PROVIDER_TIMEOUT_MS by 20%, increase SCAN_TTL_SECONDS and LP_TTL_SECONDS ×2
  - Verify: p90 back under 2.2s; errorPct under 5%
- Rate-limit abuse (bursty clients)
  - Observe spikes and 429s; tune GLOBAL_QPS down, increase per-user chat limits conservatively
  - Communicate 429 copy is user-facing and friendly
- Alert noise
  - Increase ALERT_SCORE_DROP and/or ALERT_THROTTLE_MIN; verify DM cap via tests
- Callback expiry expectations
  - TTL is 600s; expired callbacks should show “Expired. Please retry.”
  - Do not extend TTL globally; prefer re-requesting fresh data

### Freeze & Recover
- Freeze Now:
  - `MAINTENANCE_MODE=true bash ops/pm2_reload.sh`
  - optionally `BREAKER_FORCE_OPEN=true bash ops/pm2_reload.sh`
  - optionally `READONLY_MODE=true bash ops/pm2_reload.sh`
- Verify:
  - `pnpm run synthetic:probe`
  - `pnpm run config:snapshot`
- Recover: flip toggles back and reload with `--update-env`.

### Rollback steps
- Tag-based rollback: deploy previous tag; set DEMO_MODE=true; verify /healthz, /metrics, /status
- pm2/docker: stop current, start previous image; confirm ports; re-enable alerts only after stability
- Cache: bump scan cache version via `/scan_cache_bust` admin command when applicable

### Ops endpoint exemptions
- `/healthz`, `/metrics`, `/status` must not be blocked by global QPS or user guards
- Maintain consistent payloads; alerts section is included only when `?verbose=1` on `/status`

### Tag & Release
- Steps: `pnpm run verify` → `BUMP=patch pnpm run release:tag` → push → CI creates GitHub Release with artifacts.
- Rollback: deploy previous tarball or `git checkout vX.Y.(Z-1)` and run canary.


