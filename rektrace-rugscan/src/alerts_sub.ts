import Redis from 'ioredis';

// In-memory fallback for tests/demo when REDIS_URL is not set; persist across HMR/module reload
const TOK_KEY = '__subsTokens__';
const USR_KEY = '__subsUsers__';
const memTokens: Map<string, Set<string>> = (globalThis as any)[TOK_KEY] ?? ((globalThis as any)[TOK_KEY] = new Map());
const memUsers: Map<string, Set<string>> = (globalThis as any)[USR_KEY] ?? ((globalThis as any)[USR_KEY] = new Map());

async function getRedis(): Promise<Redis | null> {
  const url = process.env.REDIS_URL || '';
  if (!url) return null;
  return new Redis(url);
}

export type SubKey = { chain: string; token: string };

const tokenKey = ({chain, token}: SubKey) => `subs:token:${chain}:${token}`;
const userKey  = (chatId: number) => `subs:user:${chatId}`;
const metaKey  = ({chain, token}: SubKey) => `subs:meta:${chain}:${token}`;

export async function subscribe(chatId: number, sub: SubKey) {
  const r = await getRedis();
  if (r) {
    await r.sadd(tokenKey(sub), String(chatId));
    await r.sadd(userKey(chatId), `${sub.chain}:${sub.token}`);
    await r.quit();
    return;
  }
  const tk = tokenKey(sub);
  const uk = userKey(chatId);
  const a = memTokens.get(tk) ?? new Set<string>(); a.add(String(chatId)); memTokens.set(tk, a);
  const b = memUsers.get(uk) ?? new Set<string>(); b.add(`${sub.chain}:${sub.token}`); memUsers.set(uk, b);
}

export async function listSubs(chatId: number): Promise<SubKey[]> {
  const r = await getRedis();
  if (r) {
    const raw = await r.smembers(userKey(chatId));
    await r.quit();
    return (raw ?? []).map(s => {
      const [chain, token] = s.split(":");
      return { chain, token };
    });
  }
  const raw = Array.from(memUsers.get(userKey(chatId)) ?? []);
  return (raw ?? []).map(s => {
    const [chain, token] = s.split(":");
    return { chain, token };
  });
}

export async function subscribers(sub: SubKey): Promise<number[]> {
  const r = await getRedis();
  if (r) {
    const raw = await r.smembers(tokenKey(sub));
    await r.quit();
    return (raw ?? []).map(Number);
  }
  const raw = Array.from(memTokens.get(tokenKey(sub)) ?? []);
  return (raw ?? []).map(Number);
}

export async function listAllTokenSubs(): Promise<SubKey[]> {
  // Only available in-memory (tests) unless Redis scan added
  const out: SubKey[] = [];
  for (const k of memTokens.keys()) {
    const parts = k.split(':'); // subs:token:{chain}:{token}
    const chain = parts[2];
    const token = parts.slice(3).join(':');
    if (chain && token) out.push({ chain, token });
  }
  return out;
}

export type SubMeta = { lastScore?: number; lpUnlock7dNotified?: boolean };

export async function getMeta(sub: SubKey): Promise<SubMeta> {
  const r = await getRedis();
  if (r) {
    const raw = await r.hgetall(metaKey(sub));
    await r.quit();
    const lastScore = raw.lastScore != null ? Number(raw.lastScore) : undefined;
    const lpUnlock7dNotified = raw.lpUnlock7dNotified === '1';
    return { lastScore, lpUnlock7dNotified };
  }
  const mk = metaKey(sub);
  const m = (memUsers as any)._meta as Map<string, SubMeta> || new Map<string, SubMeta>();
  (memUsers as any)._meta = m;
  return m.get(mk) || {};
}

export async function setMeta(sub: SubKey, meta: SubMeta): Promise<void> {
  const r = await getRedis();
  if (r) {
    const payload: Record<string,string> = {};
    if (meta.lastScore != null) payload.lastScore = String(meta.lastScore);
    if (meta.lpUnlock7dNotified != null) payload.lpUnlock7dNotified = meta.lpUnlock7dNotified ? '1' : '0';
    if (Object.keys(payload).length) await r.hset(metaKey(sub), payload);
    await r.quit();
    return;
  }
  const mk = metaKey(sub);
  const m = (memUsers as any)._meta as Map<string, SubMeta> || new Map<string, SubMeta>();
  (memUsers as any)._meta = m;
  const cur = m.get(mk) || {};
  m.set(mk, { ...cur, ...meta });
}

export async function unsubscribe(chatId: number, sub: SubKey) {
  const r = await getRedis();
  if (r) {
    await r.srem(tokenKey(sub), String(chatId));
    await r.srem(userKey(chatId), `${sub.chain}:${sub.token}`);
    await r.quit();
    return;
  }
  const tk = tokenKey(sub);
  const uk = userKey(chatId);
  const a = memTokens.get(tk); if (a) { a.delete(String(chatId)); if (a.size===0) memTokens.delete(tk); }
  const b = memUsers.get(uk); if (b) { b.delete(`${sub.chain}:${sub.token}`); if (b.size===0) memUsers.delete(uk); }
}

// --- Per-subscription preferences ---
export type SubPref = { drop: number; unlockDays: number };
const DEFAULT_PREF: SubPref = { drop: 10, unlockDays: 7 };
const prefKey = (chatId: number, sub: SubKey) => `subs:pref:${chatId}:${sub.chain}:${sub.token}`;

export async function setPref(chatId: number, sub: SubKey, pref: Partial<SubPref>): Promise<void> {
  const r = await getRedis();
  const next: SubPref = { ...DEFAULT_PREF, ...pref } as SubPref;
  if (r) {
    await r.hset(prefKey(chatId, sub), { drop: String(next.drop), unlockDays: String(next.unlockDays) });
    await r.quit();
    return;
  }
  const mk = prefKey(chatId, sub);
  const store = (memUsers as any)._pref as Map<string, SubPref> || new Map<string, SubPref>();
  (memUsers as any)._pref = store;
  store.set(mk, next);
}

export async function getPref(chatId: number, sub: SubKey): Promise<SubPref> {
  const r = await getRedis();
  if (r) {
    const raw = await r.hgetall(prefKey(chatId, sub));
    await r.quit();
    const drop = raw.drop != null ? Number(raw.drop) : DEFAULT_PREF.drop;
    const unlockDays = raw.unlockDays != null ? Number(raw.unlockDays) : DEFAULT_PREF.unlockDays;
    return { drop, unlockDays };
  }
  const mk = prefKey(chatId, sub);
  const store = (memUsers as any)._pref as Map<string, SubPref> || new Map<string, SubPref>();
  (memUsers as any)._pref = store;
  return store.get(mk) || DEFAULT_PREF;
}


