import { createMessageConnection, StreamMessageReader, StreamMessageWriter, RequestType } from "vscode-jsonrpc/node";
import { Client } from "pg";

type QueryReq = { text: string; params?: any[]; maxRows?: number };

const connection = createMessageConnection(new StreamMessageReader(process.stdin), new StreamMessageWriter(process.stdout));
const log = (...a: any[]) => { try { console.error("[postgres-ro]", ...a); } catch {} };

// MCP handshake + tools
const Initialize = new RequestType<any, any, void>("initialize");
const ToolsList  = new RequestType<any, any, void>("tools/list");
const ToolsCall  = new RequestType<any, any, void>("tools/call");

function isReadOnly(sql: string): boolean {
  const s = sql.trim().toLowerCase().replace(/\s+/g, " ");
  if (s.startsWith("select ") || s.startsWith("with ")) return true;
  if (s.startsWith("explain ")) return true;
  return false;
}

function ensureLimit(sql: string, maxRows: number): string {
  const original = sql.trim();
  const noSemi = original.replace(/[;\s]+$/g, "");
  const s = noSemi.toLowerCase();
  if (/limit\s+\d+/.test(s)) return noSemi;
  return `${noSemi} LIMIT ${maxRows}`;
}

async function runQuery({ text, params = [], maxRows = 200 }: QueryReq) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  if (process.env.PGREADONLY && process.env.PGREADONLY !== "false") {
    if (!isReadOnly(text)) throw new Error("Only SELECT/WITH/EXPLAIN queries are allowed in read-only mode");
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  const sql = ensureLimit(text, maxRows);
  const res = await client.query(sql, params);
  await client.end();
  return { rows: res.rows, rowCount: res.rowCount };
}

connection.onRequest(Initialize, async () => {
  log("initialize → handshake start");
  const res = { protocolVersion: "2024-11-05", serverInfo: { name: "postgres-ro", version: "0.1.0" }, capabilities: { tools: {} } };
  log("initialize ←", res);
  return res;
});

connection.onRequest(ToolsList, async () => {
  log("tools/list → request");
  const res = {
    tools: [
      {
        name: "sql_query",
        description: "Run a read-only SQL query (SELECT/WITH/EXPLAIN)",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string" },
            params: { type: "array", items: {} },
            maxRows: { type: "number", default: 200 }
          },
          required: ["text"]
        }
      }
    ]
  };
  log("tools/list ←", res.tools.map((t: any) => t.name));
  return res;
});

connection.onRequest(ToolsCall, async (req: any) => {
  try {
    log("tools/call →", req?.name, req?.arguments?.text ? String(req.arguments.text).slice(0, 80) : "");
    if (req.name === "sql_query") {
      const out = await runQuery(req.arguments as QueryReq);
      const res = { content: [{ type: "json", json: out }] } as any;
      log("tools/call ← ok", req?.name, `rows:${out.rowCount}`);
      return res;
    }
    log("tools/call ← error unknown tool", req?.name);
    return { isError: true, content: [{ type: "text", text: "unknown tool" }] };
  } catch (e: any) {
    log("tools/call ← error", req?.name, String(e?.message || e));
    return { isError: true, content: [{ type: "text", text: String(e?.message || e) }] };
  }
});

connection.listen();


