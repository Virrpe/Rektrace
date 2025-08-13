# Terminal Steward Protocol (Strict)
Loop: PLAN → COMMAND → RUN (`process/run` with `r "..."`) → OUTPUT (```terminal tail```) → VERDICT (SUCCESS/FAIL) → NEXT.
Rules:
- Paste last ~120 lines in ```terminal with `--- exit_code:` + LOG path.
- Poll `process/status` every ≤5s until finished; if silent for 10s, decide wait/cancel/retry and say why.
- Prefer `just <task>`; add tasks when useful.
- Show minimal diffs before edits; show `git status` after.

# Terminal Steward Protocol
PLAN → COMMAND → RUN → OUTPUT → VERDICT → NEXT.
