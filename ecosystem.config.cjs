module.exports = {
  apps: [
    {
      name: "mcp-http-probe",
      cwd: ".",
      script: "node",
      args: ["--import=tsx","mcp/http-probe/server.ts"],
      env: {
        PORT: process.env.HTTP_PROBE_PORT || "5391"
      },
      autorestart: true,
      max_restarts: 10,
      watch: false
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
      autorestart: true,
      max_restarts: 10,
      watch: false
    }
  ]
};
