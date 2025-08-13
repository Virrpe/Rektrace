Archive directory for de-bloated scripts/configs. These files are not executed by default.

Why archived:
- Duplicate PM2 config caused ambiguity between `ecosystem.config.cjs` (canonical) and `.js`. The `.js` variant is retained here for reference.
- Multiple env-mutation/orchestration scripts overlapped and could drift. Minimal active set remains: `ops/pm2_start.sh`, `ops/pm2_reload.sh`, `scripts/deploy_live.sh`, `scripts/health_probe.sh`.

How to restore:
- Move a file back to its original location (e.g., `git mv archive/config/ecosystem.config.js ./ecosystem.config.js`).
- Review and adapt to current flows before re-introducing.

Notes:
- Prefer a single canonical script for `.env.prod` edits to avoid drift.
- PM2 canonical config is `ecosystem.config.cjs`.

