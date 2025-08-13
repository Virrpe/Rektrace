import { createMessageConnection, StreamMessageReader, StreamMessageWriter, RequestType } from "vscode-jsonrpc/node";

type SendReq = { chatId: number | string; text: string; parse_mode?: "Markdown" | "HTML" | "MarkdownV2"; disable_web_page_preview?: boolean; dryRun?: boolean; traceId?: string };
type PhotoReq = { chatId: number | string; photoUrl: string; caption?: string; parse_mode?: "Markdown" | "HTML" | "MarkdownV2"; dryRun?: boolean; traceId?: string };

const connection = createMessageConnection(new StreamMessageReader(process.stdin), new StreamMessageWriter(process.stdout));
const log = (...a: any[]) => { try { console.error("[tg-notify]", ...a); } catch {} };

const Initialize = new RequestType<any, any, void>("initialize");
const ToolsList  = new RequestType<any, any, void>("tools/list");
const ToolsCall  = new RequestType<any, any, void>("tools/call");

const API = "https://api.telegram.org";
function requireToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN not set");
  return t;
}

async function postJSON(url: string, body: any) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json as any).ok === false) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json as any;
}

connection.onRequest(Initialize, async () => {
  log("initialize → handshake start");
  const res = { protocolVersion: "2024-11-05", serverInfo: { name: "tg-notify", version: "0.1.0" }, capabilities: { tools: {} } };
  log("initialize ←", res);
  return res;
});

connection.onRequest(ToolsList, async () => {
  log("tools/list → request");
  const res = {
    tools: [
      {
        name: "tg_send",
        description: "Send a Telegram text message (requires TELEGRAM_BOT_TOKEN)",
        inputSchema: {
          type: "object",
          properties: {
            chatId: { type: "string" },
            text: { type: "string" },
            parse_mode: { type: "string", enum: ["Markdown","HTML","MarkdownV2"], default: "HTML" },
            disable_web_page_preview: { type: "boolean", default: true },
            dryRun: { type: "boolean", default: false },
            traceId: { type: "string" }
          },
          required: ["chatId","text"]
        }
      },
      {
        name: "tg_photo",
        description: "Send a Telegram photo by URL (requires TELEGRAM_BOT_TOKEN)",
        inputSchema: {
          type: "object",
          properties: {
            chatId: { type: "string" },
            photoUrl: { type: "string" },
            caption: { type: "string" },
            parse_mode: { type: "string", enum: ["Markdown","HTML","MarkdownV2"], default: "HTML" },
            dryRun: { type: "boolean", default: false },
            traceId: { type: "string" }
          },
          required: ["chatId","photoUrl"]
        }
      }
    ]
  };
  log("tools/list ←", res.tools.map((t: any) => t.name));
  return res;
});

connection.onRequest(ToolsCall, async (req: any) => {
  try {
    log("tools/call →", req?.name);
    if (req.name === "tg_send") {
      const r = req.arguments as SendReq;
      if (r.dryRun) return { content: [{ type: "json", json: { ok: true, dryRun: true } }] };
      const token = requireToken();
      const text = r.text + (r.traceId ? `\n\ntrace: ${r.traceId}` : "");
      const json: any = await postJSON(`${API}/bot${token}/sendMessage`, {
        chat_id: r.chatId,
        text,
        parse_mode: r.parse_mode || "HTML",
        disable_web_page_preview: r.disable_web_page_preview ?? true
      });
      const res = { content: [{ type: "json", json: { ok: true, messageId: json.result?.message_id } }] } as any;
      log("tools/call ← ok", req?.name, JSON.stringify(res).slice(0, 160));
      return res;
    }
    if (req.name === "tg_photo") {
      const r = req.arguments as PhotoReq;
      if (r.dryRun) return { content: [{ type: "json", json: { ok: true, dryRun: true } }] };
      const token = requireToken();
      const caption = (r.caption || "") + (r.traceId ? `\n\ntrace: ${r.traceId}` : "");
      const json: any = await postJSON(`${API}/bot${token}/sendPhoto`, {
        chat_id: r.chatId,
        photo: r.photoUrl,
        caption,
        parse_mode: r.parse_mode || "HTML"
      });
      const res = { content: [{ type: "json", json: { ok: true, messageId: json.result?.message_id } }] } as any;
      log("tools/call ← ok", req?.name, JSON.stringify(res).slice(0, 160));
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


