import Redis from 'ioredis';

const ENABLED = process.env.IDEMP_ENABLED === 'true';
const TTL_MS = Math.max(1, Number(process.env.IDEMP_TTL_MS ?? 60000));

function hashBody(body: string): string {
  // Simple, non-crypto hash (no deps)
  let h = 2166136261 >>> 0;
  for (let i=0;i<body.length;i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

let redis: Redis | null = null;
function getRedis(): Redis | null {
  const url = process.env.REDIS_URL || '';
  if (!url) return null;
  if (!redis) redis = new (Redis as any)(url);
  return redis;
}

export async function checkIdempotency(keyHeader: string | string[] | undefined, bodyString: string): Promise<{ok:true}|{ok:false;status:number;body:any}> {
  if (!ENABLED) return { ok: true } as const;
  const key = typeof keyHeader === 'string' ? keyHeader : (Array.isArray(keyHeader) ? keyHeader[0] : '');
  if (!key) return { ok: false, status: 400, body: { error: 'Idempotency-Key required' } } as const;
  const bodyHash = hashBody(bodyString);
  const memKey = `idem:${key}:${bodyHash}`;
  const r = getRedis();
  if (r) {
    const exists = await r.get(memKey);
    if (exists) return { ok: false, status: 409, body: { error: 'duplicate' } } as const;
    await r.set(memKey, '1', 'PX', TTL_MS);
    return { ok: true } as const;
  } else {
    // in-memory
    if (!(globalThis as any).__idem) (globalThis as any).__idem = new Map<string, number>();
    const m: Map<string, number> = (globalThis as any).__idem;
    const now = Date.now();
    // cleanup
    for (const [k,v] of m) if (now - v > TTL_MS) m.delete(k);
    if (m.has(memKey)) return { ok: false, status: 409, body: { error: 'duplicate' } } as const;
    m.set(memKey, now);
    return { ok: true } as const;
  }
}


