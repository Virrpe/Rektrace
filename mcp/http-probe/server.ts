import { createMessageConnection, StreamMessageReader, StreamMessageWriter, RequestType } from "vscode-jsonrpc/node";
const connection = createMessageConnection(new StreamMessageReader(process.stdin), new StreamMessageWriter(process.stdout));
const Probe = new RequestType<{ url: string, timeoutMs?: number, expect?: number }, { ok: boolean, status?: number }, void>("http/probe");
connection.onRequest(Probe, async ({ url, timeoutMs=5000, expect=200 }: { url: string; timeoutMs?: number; expect?: number }) => {
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  try { const res = await fetch(url, { signal: ctrl.signal }); clearTimeout(t); return { ok: res.status===expect, status: res.status }; }
  catch { clearTimeout(t); return { ok:false }; }
});
connection.listen();
