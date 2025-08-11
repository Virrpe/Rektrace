## Launch TODO – RugScanner

### Must-have before prod
- [ ] Ops exemptions verified for `/healthz`, `/metrics`, `/status` (S)
- [ ] Admin convenience: `/alerts_check_now` (optional) or documented manual trigger (S)
- [ ] Provider keys loaded via `.env` and masked in logs (S)

### Week-1 polish
- [ ] `/my_alerts` UX copy improvements and empty-state hints (S)
- [ ] Per-user alert preferences (throttle window override within bounds) (M)
- [ ] Retry/backoff tuning doc examples (S)

### Nice-to-have
- [ ] GitHub Actions: docs presence/link CI (`pnpm docs:check`) (S)
- [ ] Admin /status shows recent alert count when `?verbose=1` (S)

Acceptance criteria
- All items checked have a diff or doc link in PR; tests remain green; `pnpm docs:check` passes.


