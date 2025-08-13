import crypto from 'node:crypto';
import type http from 'node:http';

export function verifyHmac(timestamp: string, body: string, signature: string, secret: string): boolean {
  try {
    const msg = timestamp + body;
    const h = crypto.createHash('sha256').update(msg).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(signature));
  } catch { return false; }
}

export function withHmacGate(handler: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => boolean | Promise<boolean>) {
  return async (req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> => {
    if (process.env.HMAC_API_ENFORCE !== 'true') return handler(req, res, '');
    const secret = process.env.HMAC_API_SECRET || '';
    if (!secret) { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'hmac_not_configured' })); return true; }
    const ts = String(req.headers['x-timestamp'] || '');
    const sig = String(req.headers['x-signature'] || '');
    let body = '';
    await new Promise<void>(resolve => { req.setEncoding('utf8'); req.on('data', c=> body += c); req.on('end', ()=> resolve()); });
    if (!verifyHmac(ts, body, sig, secret)) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unauthorized' })); return true; }
    return handler(req, res, body);
  };
}


