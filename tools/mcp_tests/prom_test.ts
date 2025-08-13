import { spawn } from "node:child_process";
import { createMessageConnection, StreamMessageReader, StreamMessageWriter, RequestType } from "vscode-jsonrpc/node";

async function main() {
  const env = { ...process.env, PROM_URL: process.env.PROM_URL || "http://localhost:9090" };
  const child = spawn("node", ["node_modules/tsx/dist/cli.mjs", "mcp/prom-metrics/server.ts"], { env });
  const connection = createMessageConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin));
  connection.listen();

  const PromQuery = new RequestType<{ ql: string; time?: string }, { ok: boolean; status?: string; resultType?: string; result?: any; error?: string }, void>("prom/query");
  try {
    const res = await connection.sendRequest(PromQuery, { ql: "up" });
    console.log(JSON.stringify(res, null, 2));
  } catch (e: any) {
    console.error("ERR:", e?.message || e);
  } finally {
    try { child.kill(); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });


