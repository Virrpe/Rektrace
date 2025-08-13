# Quickstart (Windows) — RekTrace RugScan MVP

## Prerequisites
- Node 20 LTS installed (`node -v` should show v20.x)
- Corepack (bundled with Node 20) and pnpm

## Steps
1) Double‑click `run_mvp.bat` from the repo root
2) The script will:
   - Enable pnpm via corepack and install deps
   - Bootstrap `.env.prod` (create a timestamped backup and append safe defaults)
   - If required keys are missing, it will open `.env.prod` in Notepad — fill `TELEGRAM_BOT_TOKEN` and `ADMIN_IDS` (comma‑separated), save, and re‑run
   - Build the RugScan target and start a single bot process (no PM2)
   - Probe health at `/live` until ready, then print next steps

## Health and testing
- Visit `http://127.0.0.1:8081/status` and `/metrics`
- DM your Telegram bot: `/start`, `/help`, `/scan ink:<token>`, `/scan_plus ink:<token>`, `/snipers ink:<token>`, `/sniper 0x<addr>`

## Notes
- No secrets are printed; the script only logs presence (yes/no)
- For PM2 production, revert to existing PM2 scripts and keep instances=1 to avoid Telegram 409s
- To stop local testing, close the "rektrace-bot" window (or end the node process)


