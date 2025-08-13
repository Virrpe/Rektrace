import crypto from 'node:crypto';
import Redis from 'ioredis';
import { Attestation } from './schemas.js';

type Store = {
  put(a: Attestation, ttlSec: number): Promise<void>;
  get(id: string): Promise<Attestation | null>;
};

class MemStore implements Store {
  private m = new Map<string, { a: Attestation; exp: number }>();
  async put(a: Attestation, ttlSec: number) {
    this.m.set(a.id, { a, exp: Date.now() + ttlSec * 1000 });
  }
  async get(id: string) {
    const v = this.m.get(id);
    if (!v) return null;
    if (Date.now() > v.exp) { this.m.delete(id); return null; }
    return v.a;
  }
}

class RedisStore implements Store {
  constructor(private r: Redis) {}
  async put(a: Attestation, ttlSec: number) {
    const buf = Buffer.from(JSON.stringify(a));
    await this.r.set(`signals:att:${a.id}`, buf, 'EX', ttlSec);
  }
  async get(id: string) {
    const raw = await this.r.getBuffer(`signals:att:${id}`);
    return raw ? (JSON.parse(raw.toString()) as Attestation) : null;
  }
}

let store: Store | null = null;
function getStore(): Store {
  if (store) return store;
  const url = process.env.REDIS_URL || '';
  store = url ? new RedisStore(new Redis(url)) : new MemStore();
  return store;
}

export function deriveAttestationId(seed: string) {
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
}

export async function attest(input: unknown): Promise<Attestation> {
  const normalized = JSON.stringify(input, Object.keys(input as any).sort());
  const sha256 = crypto.createHash('sha256').update(normalized).digest('hex');
  const id = deriveAttestationId(sha256);
  const a: Attestation = { id, sha256, generated_at: Date.now() };
  const ttlSec = Math.max(60, Number(process.env.SIGNALS_ATTEST_TTL_SEC ?? 86400));
  await getStore().put(a, ttlSec);
  return a;
}

export async function fetchAttestation(id: string): Promise<Attestation | null> {
  return await getStore().get(id);
}


