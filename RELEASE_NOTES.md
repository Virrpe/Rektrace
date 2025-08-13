# Rektrace v0.5.0 — Live Ergonomics + Deploy Tooling

## One-Screen Go Live

```sh
pnpm i --frozen-lockfile
pnpm run ip:public
# Add printed IP to:
#  - GoldRush → Prod Key → Client IP Allow-list
#  - QuickNode → IP Allow-list

pnpm run env:gen
pnpm run build
pnpm run deploy:live

# Smoke (HTTP). For live POST, set RUGSCAN_API_KEY or API_KEY first.
pnpm run smoke:live

# Telegram (manual):
# /scan ink:pepe
# /top_ink (paginate)
# /watch ink:0xdeadbeef...
# /my_watchlist /unwatch
# Admin: /alerts /scan_cache_bust
```

## Caveats
- If live POST requires an API key, export `RUGSCAN_API_KEY` (or `API_KEY`) so smoke includes `X-API-Key`.
- Ensure IP allow-lists for GoldRush and QuickNode include your server IP from `pnpm run ip:public`.

## HTTP/Telegram Smoke Checklist
- HTTP: `/status`, `/metrics`, conditional `POST /api/scan` (demo payload in DEMO_MODE)
- Telegram: `/scan ink:pepe`, `/top_ink`, `/watch`, `/unwatch`, `/my_watchlist`, admin `/alerts`, `/scan_cache_bust`


