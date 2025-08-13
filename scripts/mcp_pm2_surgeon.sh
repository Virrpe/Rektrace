#!/usr/bin/env bash
set -euo pipefail
cd /mnt/c/buildz/rektrace

# 0) choose tsx invocation for Node 20
PM2_ARGS=(--import=tsx)
node --import=tsx -e 'console.log("ok")' >/dev/null 2>&1 || PM2_ARGS=(./node_modules/tsx/dist/cli.mjs)

# 1) deps (local)
command -v jq >/dev/null 2>&1 || (sudo -n apt-get update -y >/dev/null 2>&1 && sudo -n apt-get install -y jq >/dev/null 2>&1) || true
command -v curl >/dev/null 2>&1 || (sudo -n apt-get update -y >/dev/null 2>&1 && sudo -n apt-get install -y curl >/dev/null 2>&1) || true
node -e 'require("tsx")' >/dev/null 2>&1 || pnpm add -D tsx >/dev/null 2>&1 || true
npx pm2 -v >/dev/null 2>&1 || pnpm add -D pm2 >/dev/null 2>&1 || true

# 2) env & ignores
touch .gitignore
if ! grep -qxF ".env" .gitignore; then echo ".env" >> .gitignore; echo "--- diff: .gitignore ---"; git --no-pager diff -- .gitignore | sed -n '1,80p'; fi
if ! grep -qxF "logs/" .gitignore; then echo "logs/" >> .gitignore; echo "--- diff: .gitignore ---"; git --no-pager diff -- .gitignore | sed -n '1,80p'; fi
[ -f .env.example ] || cat > .env.example <<'ENV'
HTTP_PROBE_PORT=5391
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
ENV
[ -f .env ] || cp .env.example .env

# 3) PM2 ecosystem (create if missing)
if [ ! -f ecosystem.config.cjs ]; then
cat > ecosystem.config.cjs <<'CJS'
module.exports = {
  apps: [
    {
      name: "mcp-http-probe",
      cwd: ".",
      script: "node",
      args: ["--import=tsx","mcp/http-probe/server.ts"],
      env: { PORT: process.env.HTTP_PROBE_PORT || "5391" },
      autorestart: true, max_restarts: 10, watch: false
    },
    {
      name: "mcp-tg-notify",
      cwd: ".",
      script: "node",
      args: ["--import=tsx","mcp/tg-notify/server.ts"],
      env: {
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
        TELEGRAM_CHAT_ID:   process.env.TELEGRAM_CHAT_ID   || ""
      },
      autorestart: true, max_restarts: 10, watch: false
    }
  ]
};
CJS
  echo "--- created: ecosystem.config.cjs ---"; git --no-pager diff -- ecosystem.config.cjs | sed -n '1,120p' || true
fi

# If we fell back to CLI shim, patch to use it
if [ "${PM2_ARGS[0]}" != "--import=tsx" ]; then
  sed -i 's#"--import=tsx"#"./node_modules/tsx/dist/cli.mjs"#g' ecosystem.config.cjs
  echo "--- patched ecosystem.config.cjs to use tsx CLI shim ---"; git --no-pager diff -- ecosystem.config.cjs | sed -n '1,120p'
fi

# 4) Wire Cursor MCP (.cursor/mcp.json; servers schema), prefer CLI shim for Cursor
mkdir -p .cursor
[ -f .cursor/mcp.json ] || printf '%s\n' '{"servers":{}}' > .cursor/mcp.json
TMP=$(mktemp)
jq '.servers = (.servers // {})
 | .servers["http-probe"] = {"transport":"stdio","command":"node","args":["./node_modules/tsx/dist/cli.mjs","mcp/http-probe/server.ts"],"env":{"PORT":"5391"}}
 | .servers["tg-notify"] = (.servers["tg-notify"] // {"transport":"stdio","command":"node","args":["./node_modules/tsx/dist/cli.mjs","mcp/tg-notify/server.ts"],"env":{"TELEGRAM_BOT_TOKEN":"${TELEGRAM_BOT_TOKEN}","TELEGRAM_CHAT_ID":"${TELEGRAM_CHAT_ID}"}})
' .cursor/mcp.json > "$TMP" && mv "$TMP" .cursor/mcp.json
echo "--- diff: .cursor/mcp.json ---"; git --no-pager diff -- .cursor/mcp.json | sed -n '1,120p' || true

# 5) Start/Reload & persist PM2
set -a; [ -f .env ] && . ./.env; set +a
npx pm2 start ecosystem.config.cjs >/dev/null 2>&1 || npx pm2 reload ecosystem.config.cjs >/dev/null 2>&1
npx pm2 restart mcp-http-probe >/dev/null 2>&1 || true
npx pm2 restart mcp-tg-notify  >/dev/null 2>&1 || true
npx pm2 save >/dev/null 2>&1 || true
(npx pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null 2>&1 || true)

# 6) Verify PM2 quickly
echo "---- PM2 status (top) ----"
npx pm2 status | sed -n '1,20p' || true
echo "---- mcp-http-probe logs (last 40) ----"
npx pm2 logs --lines 40 mcp-http-probe 2>/dev/null || true

# 7) MCP CLI sanity
echo "== mcp_ping http-probe =="
node tools/mcp_ping.mjs  http-probe || true
echo "== mcp_probe http-probe https://example.com =="
node tools/mcp_probe.mjs http-probe https://example.com || true

# 8) Checklist
echo "---- Checklist ----"
if npx pm2 jlist | grep -q '"name":"mcp-http-probe"' | grep -q online; then echo " [x] PM2 mcp-http-probe online"; else echo " [ ] PM2 mcp-http-probe online"; fi
if jq -e '.servers["http-probe"]' .cursor/mcp.json >/dev/null 2>&1; then echo " [x] .cursor/mcp.json has servers.http-probe"; else echo " [ ] .cursor/mcp.json has servers.http-probe"; fi
echo " [x] Reload Cursor MCP to pick up config"


