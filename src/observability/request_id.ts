import crypto from 'node:crypto';
import type http from 'node:http';

export type ReqMeta = { id: string };

export function getOrCreateRequestId(req: http.IncomingMessage, res: http.ServerResponse): string {
  const hdr = String(req.headers['x-request-id'] || '');
  const id = hdr || crypto.randomBytes(12).toString('hex');
  try { res.setHeader('X-Request-Id', id); } catch {}
  return id;
}

export function logHttpJson(meta: {
  reqId: string;
  method: string;
  route: string;
  status: number;
  ms: number;
  outcome?: string;
  maskedToken?: string;
  maskedAddr?: string;
}) {
  if (process.env.JSON_LOGS === 'true') {
    const redactList = String(process.env.LOG_REDACT_LIST || '')
      .split(',').map(s=>s.trim()).filter(Boolean);
    const line = {
      ts: new Date().toISOString(),
      level: 'info',
      ...meta,
    } as any;
    let out = JSON.stringify(line);
    for (const needle of redactList) {
      try { if (needle) out = out.split(needle).join('[REDACTED]'); } catch {}
    }
    try { console.log(out); } catch { /* fall back to default logs */ }
  }
}


