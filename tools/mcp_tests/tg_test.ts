import { spawn } from "node:child_process";
import { createMessageConnection, StreamMessageReader, StreamMessageWriter, RequestType } from "vscode-jsonrpc/node";

async function main() {
  const env = { ...process.env, TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "" };
  const child = spawn("node", ["node_modules/tsx/dist/cli.mjs", "mcp/tg-notify/server.ts"], { env });
  const connection = createMessageConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin));
  connection.listen();

  const TgSend = new RequestType<any, any, void>("tg/send");
  try {
    const dry = await connection.sendRequest(TgSend, { chatId: 0, text: "Hello from RekTrace MCP!", dryRun: true });
    console.log("dryRun:", JSON.stringify(dry));
  } catch (e: any) {
    console.error("ERR:", e?.message || e);
  } finally {
    try { child.kill(); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });


