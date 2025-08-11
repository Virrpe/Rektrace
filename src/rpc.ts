import Redis from 'ioredis';
import { request } from 'undici';

const redisUrl = process.env.REDIS_URL || '';
const redis = redisUrl ? new Redis(redisUrl) : null as unknown as Redis;

export interface RpcEndpoint { url: string; weight?: number }

export class RpcClient {
  private endpoints: RpcEndpoint[];
  private idx = 0;
  constructor(endpoints: RpcEndpoint[]) { this.endpoints = endpoints.filter(Boolean); }
  private next(): RpcEndpoint { this.idx = (this.idx + 1) % this.endpoints.length; return this.endpoints[this.idx]; }

  async call(method: string, params: any[], kind: 'evm'|'sol', cacheKey?: string, ttlSec = 600): Promise<any> {
    if (cacheKey && redis) {
      const hit = await redis.get(cacheKey);
      if (hit) return JSON.parse(hit);
    }
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    let lastErr: any;
    for (let i=0;i<this.endpoints.length;i++) {
      const ep = this.next();
      try {
        const res = await request(ep.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
        if (res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode}`);
        const j: any = await res.body.json();
        if (j.error) throw new Error(j.error.message || 'rpc error');
        if (cacheKey && redis) await redis.set(cacheKey, JSON.stringify(j.result), 'EX', ttlSec);
        return j.result;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('RPC failover exhausted');
  }
}

export function evmClient() {
  const a = (process.env.ETH_RPC || '').split(',').map(s=>s.trim()).filter(Boolean);
  const urls = a.length ? a : ['https://eth.llamarpc.com'];
  return new RpcClient(urls.map(url=>({url})));
}
export function solClient() {
  const a = (process.env.SOL_RPC || '').split(',').map(s=>s.trim()).filter(Boolean);
  const urls = a.length ? a : ['https://api.mainnet-beta.solana.com'];
  return new RpcClient(urls.map(url=>({url})));
}
