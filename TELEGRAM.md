## Telegram UX – RekTrace RugScanner

### Commands
- /help → Ink-first help (default chain is `ink:` when prefix is omitted)
- /scan <query> → multi-chain resolution (defaults to Ink); ambiguity handled with inline keyboard
- /top_ink → list top Ink pairs (6/page) with quick buttons: 🔍 Scan, 🔔 Watch
 - /watch <chain:token|token> [drop unlockDays] → add to watchlist (defaults drop=10 unlockDays=7)
 - /unwatch <chain:token|token> → remove from watchlist
 - /my_watchlist → show up to 5 watched tokens with thresholds
 - 🛡️ Swap (guarded) → appears under scan; estimates minOut (2% guard), shows risks, links to Explorer/Pair (DEX-agnostic). No custody.
 - 📰 Share → compact card for posting in groups.
 - /revoke_last <wallet> (Ink) → recent approvals list with safe Explorer links and “why revoke” note.
- /scan_plus <query> → enriched output (price, contract meta when available)
- /trace <wallet> → shows related wallets and LP events (best-effort)
- /recent_rugs → last 20 low scores observed
- /status → budgets + breaker states (Markdown)
- /my_alerts → list subscriptions with `🔕` unsubscribe buttons

Examples
- `/scan pepe` → resolves as `ink:pepe`
- `/scan ink:pepe` → explicit Ink chain

### Inline flows
- Ambiguity pagination: 6 suggestions per page with Prev/Next buttons
- Buttons on result: 📊 Full report, 🧭 Trace deployer, 🔔 Alert me
- Callback mapping: `callback_data` ≤64 bytes, mapped via short IDs with TTL=600s; expired → “Expired. Please retry.”

### Markdown escaping
- The bot uses Markdown escaping for dynamic values to avoid formatting glitches.
Examples
```
Input: token_with_(parens)
Output: token_with_\(parens\)
```


