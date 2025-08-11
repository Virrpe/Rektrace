import type http from 'node:http';
import { applySecurityHeaders, readBodyWithLimit, validateScanInput, rateLimitAllow } from './guardrails.js';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => boolean | Promise<boolean>;

export function withSecurityHeaders(handler: Handler): Handler {
  return async (req, res) => {
    if (process.env.SECURITY_HEADERS !== 'false') applySecurityHeaders(res);
    return handler(req, res);
  };
}

export function withJsonOnly(handler: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => boolean | Promise<boolean>): Handler {
  return async (req, res) => {
    try {
      const body = await readBodyWithLimit(req, { strictContentType: process.env.STRICT_CONTENT_TYPE === 'true' });
      return await handler(req, res, body);
    } catch (e: any) {
      const code = Number(e?.statusCode || 400);
      try {
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message || 'bad request' }));
      } catch {}
      return true;
    }
  };
}

export function withValidatedScan(handler: (req: http.IncomingMessage, res: http.ServerResponse, json: any) => boolean | Promise<boolean>): (req: http.IncomingMessage, res: http.ServerResponse, body: string) => Promise<boolean> {
  return async (req, res, body) => {
    try {
      const json = body ? JSON.parse(body) : {};
      const err = validateScanInput(json);
      if (err) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: err }));
        return true;
      }
      return handler(req, res, json);
    } catch {
      try {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid json' }));
      } catch {}
      return true;
    }
  };
}

export function withRateLimit(handler: Handler): Handler {
  return async (req, res) => {
    const ip = String((req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '');
    if (!rateLimitAllow(ip)) {
      try {
        res.writeHead(429, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'rate limit' }));
      } catch {}
      return true;
    }
    return handler(req, res);
  };
}


