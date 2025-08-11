import Redis from 'ioredis';

const TTL_SECONDS = 600;
const mem = new Map<string, { v: string; exp: number }>();
function gc(now = Date.now()) { for (const [k, { exp }] of mem) if (exp <= now) mem.delete(k); }

async function getRedis(): Promise<Redis | null> {
  const url = process.env.REDIS_URL || '';
  if (!url) return null;
  return new Redis(url);
}

function genId(): string { return Math.random().toString(36).slice(2, 10); }

export async function putCb(data: string): Promise<string> {
  const id = genId();
  const r = await getRedis();
  if (r) {
    await r.setex(`cb:${id}`, TTL_SECONDS, data);
    await r.quit();
  } else {
    gc();
    mem.set(`cb:${id}`, { v: data, exp: Date.now() + TTL_SECONDS * 1000 });
  }
  return `cb:${id}`;
}

export async function getCb(cb: string): Promise<string | null> {
  const key = cb.startsWith('cb:') ? cb : `cb:${cb}`;
  const r = await getRedis();
  if (r) {
    const v = await r.get(key);
    await r.quit();
    return v ?? null;
  }
  gc();
  const it = mem.get(key);
  if (!it) return null;
  if (Date.now() > it.exp) { mem.delete(key); return null; }
  return it.v;
}


