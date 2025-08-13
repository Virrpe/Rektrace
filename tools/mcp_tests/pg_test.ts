import { spawn } from "node:child_process";
import { createMessageConnection, StreamMessageReader, StreamMessageWriter, RequestType } from "vscode-jsonrpc/node";

async function main() {
  const env = { ...process.env, PGREADONLY: "true", DATABASE_URL: process.env.DATABASE_URL || "postgres://rektrace:rektrace@localhost:5432/rektrace" };
  const child = spawn("node", ["node_modules/tsx/dist/cli.mjs", "mcp/postgres-ro/server.ts"], { env });
  const connection = createMessageConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin));
  connection.listen();

  const SqlQuery = new RequestType<{ text: string; params?: any[]; maxRows?: number }, { ok: boolean; rows?: any[]; rowCount?: number; error?: string }, void>("sql/query");
  try {
    const res = await connection.sendRequest(SqlQuery, { text: "SELECT now(), current_database();", maxRows: 5 });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(res, null, 2));
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("ERR:", e?.message || e);
  } finally {
    try { child.kill(); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });


