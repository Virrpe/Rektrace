# Runtime Flags Summary

This is a concise index of major environment flags referenced in code. Defaults are inferred by code paths; see inline references for exact behavior.

- DEMO_MODE — disables live provider calls in multiple modules; safe demo walls (`src/providers.ts:7`, `rektrace-rugscan/src/index.ts:547`).
- HTTP_ONLY — allow HTTP server without Telegram bot (`rektrace-rugscan/src/index.ts:42–46`).
- MAINTENANCE_MODE — 503 for non-exempt routes; `/ready` 503 (`src/health.ts:38`, `rektrace-rugscan/src/index.ts:231,265`).
- READONLY_MODE — block state-changing methods except scan endpoints (`rektrace-rugscan/src/index.ts:236–249`).
- BREAKER_FORCE_OPEN — forces stub responses in scan endpoints (`rektrace-rugscan/src/index.ts:388–411,465–485`).
- SECURITY_HEADERS — apply additive security headers (`rektrace-rugscan/src/index.ts:223–226`).
- STRICT_CONTENT_TYPE / MAX_BODY_BYTES — JSON-only and body size limit (`src/security/guardrails.ts:18–48`).
- RL_ENABLED / RL_WINDOW_MS / RL_MAX — IP rate-limiter (`src/security/guardrails.ts:76–92`).
- JSON_LOGS / LOG_REDACT_LIST — structured logs and redaction (`src/observability/request_id.ts:23–35`).
- API_KEY — optional API key for HTTP endpoints (`rektrace-rugscan/src/index.ts:210–221`).
- HMAC_API_ENFORCE / HMAC_API_SECRET — HMAC guard for `/signals` (`src/security/hmac_gate.ts`).
- IDEMP_ENABLED — POST idempotency via Redis/in-memory fallback (`src/security/idempotency.ts:3–47`).
- INVARIANTS_STRICT — strict response invariant enforcement (`rektrace-rugscan/src/index.ts:395–401,516–519`).
- RULES_ENABLED / RULES_RELOAD_MS — allow/deny rules hot-reload (`src/security/rules.ts:26–45`).
- SIGNALS_ENABLED — enable compute/poller (`src/signals/compute.ts:14,26`).
- SIGNALS_BROADCAST_ENABLED — enable broadcast path (`src/signals/broadcast.ts:16`).
- SIGNALS_WS_ENABLED — prefer WS adapter if true and not demo (`src/signals/adapters/index.ts:6–17`).
- SIGNALS_CHAINS / SIGNALS_POLL_MS — poll adapter chains/interval (`src/signals/adapters/ink_discovery.ts:54,63`).
- SIGNALS_POST_* — posting budget knobs (`src/signals/posting_budget.ts:74–150`).
- SIGNALS_QUIET_* / SIGNALS_EMERGENCY_MUTE — quiet hours/emergency mute (`src/signals/quiet_hours.ts:27–51`).

Legacy (scripts-only, not read by runtime):
- SIGNALS_SOURCE — referenced in several scripts; no read sites in runtime code; treat as legacy.

