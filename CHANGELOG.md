## v0.5.0 - 2025-08-11

### Added
- PM2 ecosystem (clustered, source maps, backoff, merged logs)
- Deployment ergonomics: env generator, deploy_live, smoke_live
- README_PRELAUNCH Go Live flow, rollback, logrotate
- Optional CI workflow for build/test/typecheck

### Changed
- None (no runtime semantics changed)

### Notes
- API key handling in smoke; allow-list prerequisite for GoldRush & QuickNode

## 2025-08-11
- M1: Default-to-Ink parsing in `/scan`; added `/help` copy and `/top_ink` (demo, 6/page, 🔍 Scan / 🔔 Watch)
- Tests: `default_to_ink.spec.ts`, `top_ink.spec.ts` (DEMO mocks)
- Docs: updated `API.md`, `TELEGRAM.md`
 - M2: Watchlist v1 + thresholds — `/watch`, `/unwatch`, `/my_watchlist`; alert checker enforces per-token prefs
 - Tests: `watchlist.spec.ts`, `alert_thresholds.spec.ts`
 - M3: Swap guard stub + `/revoke_last` — guarded swap advice with 2% minOut, risk bullets, neutral links; revoke helper for Ink
 - Tests: `swap_guard.spec.ts`, `revoke_helper.spec.ts`
 - M4 (partial): Inline share compact card — added Share button and formatter; tests added
## Changelog

### 0.1.0

Added
- Telegram commands: /scan, /scan_plus, /trace, /recent_rugs, /status, /my_alerts
- HTTP API: POST /api/scan, GET /api/scan/:chain/:token?enrich=true with optional API key
- Safety rails: demo wall, breakers, provider timeouts/retries, global QPS, callback mapper, denylist, DM cap
- Observability: /metrics JSON (p50/p90/errorPct), /status (budgets + breakers; alerts via ?verbose=1)
- Subscriptions: “Alert me” + background checker with score drop and LP unlock routing, throttle & DM cap

Changed
- Unified holders consensus using relative-to-max ±10% window

Fixed
- Markdown escaping for Telegram outputs; shortener handling in chat and HTTP


