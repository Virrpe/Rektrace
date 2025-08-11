import Redis from 'ioredis';

export interface CacheLike {
  get<T=unknown>(key: string): Promise<T | null>;
  set<T=unknown>(key: string, val: T, ttlSec?: number): Promise<void>;
}

export class MemoryCache implements CacheLike {
  private m = new Map<string, {ts:number, val:any}>();
  constructor(private ttlSec: number) {}
  async get<T>(key: string) {
    const e = this.m.get(key);
    if (!e) return null;
    if ((Date.now() - e.ts)/1000 > this.ttlSec) { this.m.delete(key); return null; }
    return e.val as T;
  }
  async set<T>(key: string, val: T) { this.m.set(key, {ts: Date.now(), val}); }
}

export class RedisCache implements CacheLike {
  constructor(private client: Redis, private defaultTtl: number) {}
  async get<T>(key: string) {
    const raw = await this.client.getBuffer(key);
    return raw ? JSON.parse(raw.toString()) as T : null;
  }
  async set<T>(key: string, val: T, ttl?: number) {
    const buf = Buffer.from(JSON.stringify(val));
    await this.client.set(key, buf, 'EX', ttl ?? this.defaultTtl);
  }
}
