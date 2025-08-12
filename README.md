# RekTrace Cursor MCP Pack (Node/TS)



6) Open a fresh Cursor chat and paste this session header:

```
Use Tight Loop Mode for RekTrace.
- Always call process/run for tasks >3s and poll process/status every ≤5s until finished.
- If status shows no progress for 10s → decide wait/cancel/retry and say why.
- After every run, paste ```terminal tail``` with exit_code + LOG path; then a one-line VERDICT.
- Prefer Justfile tasks (ingest, enrich, score, sim, backtest, report, alerts).
- Before changing code, show minimal diff; after, run git-tools: git/diff → git/commit.
- If dashboard involved: call http/probe until 200 OK before proceeding.
```

## Commands you’ll use a lot

```bash
just setup           # install deps (node + python)
just ingest:watch    # continuous scraper with heartbeat
just enrich:entities
just score:run MIN_CONF=0.62
just sim:window 2025-07-15 2025-08-12 MIN_CONF=0.60
just report:latest
just logs            # follow latest logs
```

## Notes
- Auto-cancel (no progress) timeout is controlled by env var `NO_PROGRESS_TIMEOUT_S` in `.cursor/mcp.json` (default 300s).
- All long runs write to `logs/*.log` with 5s heartbeats and a final `--- exit_code: N` line.
- MCP `git-tools` lets Cursor verify file changes and commit intentionally.
- `http-probe` lets Cursor wait for your dashboard/API to be actually up.
