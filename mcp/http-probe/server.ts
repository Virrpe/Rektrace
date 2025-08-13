import { createMessageConnection, StreamMessageReader, StreamMessageWriter, RequestType } from "vscode-jsonrpc/node";

const connection = createMessageConnection(new StreamMessageReader(process.stdin), new StreamMessageWriter(process.stdout));
const log = (...a: any[]) => { try { console.error("[http-probe]", ...a); } catch {} };

// MCP handshake + tools
const Initialize = new RequestType<any, any, void>("initialize");
const ToolsList  = new RequestType<any, any, void>("tools/list");
const ToolsCall  = new RequestType<any, any, void>("tools/call");

type ProbeReq = { url: string; timeoutMs?: number; expect?: number };

async function doProbe({ url, timeoutMs = 5000, expect = 200 }: ProbeReq) {
  const startedAtMs = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const finishedAtMs = Date.now();
    const headers: Record<string,string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return {
      ok: res.status === expect,
      status: res.status,
      latency_ms: finishedAtMs - startedAtMs,
      headers
    };
  } catch (e: any) {
    clearTimeout(timer);
    return { ok: false, error: String(e?.message || e) } as any;
  }
}

connection.onRequest(Initialize, async () => {
  const res = { protocolVersion: "2024-11-05", serverInfo: { name: "http-probe", version: "0.1.0" }, capabilities: { tools: {} } };
  log("initialize ←", res);
  return res;
});

connection.onRequest(ToolsList, async () => {
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
        name: "http_probe",
        description: "Fetch a URL and return status, headers, and latency",
        inputSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: {
            url: { type: "string" },
            timeoutMs: { type: "number", default: 5000 },
            expect: { type: "number", default: 200 }
          },
          required: ["url"],
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
    if (req.name === "ping") {
      return { content: [{ type: "json", json: { ok: true } }] } as any;
    }
    if (req.name === "http_probe") {
      const out = await doProbe(req.arguments as ProbeReq);
      return { content: [{ type: "json", json: out }] } as any;
    }
    return { isError: true, content: [{ type: "text", text: "unknown tool" }] };
  } catch (e: any) {
    return { isError: true, content: [{ type: "text", text: String(e?.message || e) }] };
  }
});

connection.listen();
