import { createMessageConnection, StreamMessageReader, StreamMessageWriter, RequestType } from "vscode-jsonrpc/node";

type QueryReq = { ql: string; time?: string };

const connection = createMessageConnection(new StreamMessageReader(process.stdin), new StreamMessageWriter(process.stdout));
const log = (...a: any[]) => { try { console.error("[prom-metrics]", ...a); } catch {} };

// Minimal MCP handshake + tools
const Initialize = new RequestType<any, any, void>("initialize");
const ToolsList  = new RequestType<any, any, void>("tools/list");
const ToolsCall  = new RequestType<any, any, void>("tools/call");

function base(): string {
  const u = process.env.PROM_URL;
  if (!u) throw new Error("PROM_URL not set (e.g., http://localhost:9090)");
  return u.replace(/\/+$/, "");
}

async function promQuery({ ql, time }: QueryReq) {
  const url = new URL(base() + "/api/v1/query");
  url.searchParams.set("query", ql);
  if (time) url.searchParams.set("time", time);
  const res = await fetch(url.toString());
  const json: any = await res.json();
  if (json.status !== "success") throw new Error(JSON.stringify(json));
  return { status: json.status, resultType: json.data?.resultType, result: json.data?.result };
}

connection.onRequest(Initialize, async () => {
  log("initialize → handshake start");
  const res = {
    protocolVersion: "2024-11-05",
    serverInfo: { name: "prom-metrics", version: "0.1.0" },
    capabilities: { tools: {} }
  };
  log("initialize ←", res);
  return res;
});

connection.onRequest(ToolsList, async () => {
  log("tools/list → request");
  const res = {
    tools: [
      {
        name: "ping",
        description: "Health check tool that returns ok: true",
        inputSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: "prom_query",
        description: "Run a Prometheus instant query (v1/query)",
        inputSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: {
            ql: { type: "string", description: "PromQL query" },
            time: { type: "string", description: "Optional RFC3339 or unix seconds timestamp" }
          },
          required: ["ql"],
          additionalProperties: false
        }
      }
    ]
  };
  log("tools/list ←", res.tools.map((t: any) => t.name));
  return res;
});

connection.onRequest(ToolsCall, async (req: any) => {
  try {
    log("tools/call →", req?.name, req?.arguments);
    if (req.name === "prom_query") {
      const out = await promQuery(req.arguments as QueryReq);
      const res = { content: [{ type: "json", json: out }] } as any;
      log("tools/call ← ok", req?.name, JSON.stringify(out).slice(0, 200));
      return res;
    }
    if (req.name === "ping") {
      const res = { content: [{ type: "json", json: { ok: true } }] } as any;
      log("tools/call ← ok", req?.name, JSON.stringify(res));
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


