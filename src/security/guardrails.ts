import type http from 'node:http';

// --- Security headers ---
export function applySecurityHeaders(res: http.ServerResponse): void {
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', "interest-cohort=()");
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    // Header hardening (additive)
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  } catch {}
}

// --- Body limiter + JSON reader ---
export async function readBodyWithLimit(req: http.IncomingMessage, opts?: { maxBytes?: number; strictContentType?: boolean }): Promise<string> {
  const maxBytes = Math.max(1, Number(opts?.maxBytes ?? Number(process.env.MAX_BODY_BYTES ?? 65536)));
  const strict = opts?.strictContentType ?? (process.env.STRICT_CONTENT_TYPE === 'true');
  if (strict) {
    const ct = String(req.headers['content-type'] || '');
    if (!/^application\/json/i.test(ct)) {
      const e: any = new Error('unsupported media type');
      e.statusCode = 415;
      throw e;
    }
  }
  let size = 0;
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on('data', (d: Buffer) => {
      size += d.length;
      if (size > maxBytes) {
        const e: any = new Error('body too large');
        e.statusCode = 413;
        reject(e);
        try { req.removeAllListeners('data'); req.removeAllListeners('end'); req.destroy(); } catch {}
        return;
      }
      chunks.push(Buffer.from(d));
    });
    req.on('end', () => resolve());
    req.on('error', (err) => reject(err));
  });
  return Buffer.concat(chunks).toString('utf8') || '';
}

// --- Simple validators (no heavy deps) ---
const CHAIN_WHITELIST = new Set<string>([
  // EVM primary and aliases supported by scanner
  'eth','ethereum','bsc','binance-smart-chain','polygon','polygon-pos','matic','arb','arbitrum','arbitrum-one','op','optimism','optimistic-ethereum','avax','avalanche','ftm','fantom','base',
  // Non-EVM
  'sol','solana','ink'
]);

export type ScanInput = { token?: unknown; chain?: unknown; enrich?: unknown; query?: unknown };

export function validateScanInput(input: ScanInput): string | null {
  const token = input?.token ?? input?.query;
  if (typeof token !== 'string') return 'token required';
  const tok = token.trim();
  if (!tok) return 'token required';
  if (tok.length > 256) return 'token too long';
  if (tok.includes('..')) return 'invalid token';
  const chain = input?.chain;
  if (chain != null) {
    const cs = String(chain).trim();
    if (!CHAIN_WHITELIST.has(cs.toLowerCase())) return 'invalid chain';
  }
  if (input?.enrich != null && typeof input.enrich !== 'boolean') return 'invalid enrich';
  return null;
}

// --- Optional in-memory rate limiter ---
type Bucket = { hits: number[] };
const ipBuckets: Map<string, Bucket> = new Map();

export function rateLimitAllow(ip: string | undefined | null): boolean {
  if (process.env.RL_ENABLED !== 'true') return true;
  const windowMs = Math.max(1000, Number(process.env.RL_WINDOW_MS ?? 10000));
  const maxHits = Math.max(1, Number(process.env.RL_MAX ?? 20));
  const key = String(ip || 'unknown');
  const now = Date.now();
  const b = ipBuckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter(ts => now - ts < windowMs);
  if (b.hits.length >= maxHits) { ipBuckets.set(key, b); return false; }
  b.hits.push(now);
  ipBuckets.set(key, b);
  return true;
}


