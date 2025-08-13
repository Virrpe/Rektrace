import { request as undiciRequest } from 'undici';
import Redis from 'ioredis';
import { MemoryCache, RedisCache, type CacheLike } from '../../../src/cache.js';
import { enrichToken } from '../enrich.js';

export type EarlyTrade = { buyer: string; ts: number; amountUsd?: number };
export type EarlyWindow = {
  t0: number;
  windowMs: number;
  trades: EarlyTrade[];
  dataStatus: 'ok' | 'insufficient' | 'unavailable';
  reason?: string; // e.g., "no_pair_or_t0", "no_trades", "provider_error"
};

const DEFAULT_T_SECONDS = Math.max(30, Number(process.env.SNIPER_T_SECONDS ?? 120));

let cache: CacheLike | undefined;
function getCache(ttlSec = 120): CacheLike {
  if (cache) return cache;
  const url = process.env.REDIS_URL || '';
  cache = url ? new RedisCache(new Redis(url), ttlSec) : new MemoryCache(ttlSec);
  return cache;
}

function evmChainId(chain: string): number | null {
  const map: Record<string, number> = {
    ethereum: 1,
    'polygon-pos': 137,
    'arbitrum-one': 42161,
    'optimistic-ethereum': 10,
    base: 8453,
    avalanche: 43114,
    'binance-smart-chain': 56,
    fantom: 250,
    ink: 57073,
  };
  return map[chain] ?? null;
}

export async function getPairT0(chain: string, pairAddress: string): Promise<number | undefined> {
  try {
    const cid = evmChainId(chain);
    const key = process.env.COVALENT_API_KEY || '';
    if (!cid || !pairAddress) return undefined;
    if (!key) return undefined; // degrade silently
    const url = `https://api.covalenthq.com/v1/${cid}/address/${pairAddress}/transactions_v2/?page-size=1&block-signed-at-asc=true&key=${encodeURIComponent(key)}`;
    const res = await request(url);
    const j: any = await res.body.json();
    const tx = j?.data?.items?.[0];
    if (!tx?.block_signed_at) return undefined;
    const ts = Date.parse(tx.block_signed_at);
    return isFinite(ts) ? ts : undefined;
  } catch {
    return undefined;
  }
}

type TxLite = { ts: number; from: string; valueUsd?: number };

async function fetchPairTxsInWindow(chain: string, pairAddress: string, t0Ms: number, windowMs: number): Promise<TxLite[] | undefined> {
  try {
    const cid = evmChainId(chain);
    const key = process.env.COVALENT_API_KEY || '';
    if (!cid || !key) return undefined;
    // Fetch first page ascending and a small next page to cover ~early window
    // Covalent does not support direct time filtering on this endpoint in free tier; we'll fetch first ~200 asc
    const url = `https://api.covalenthq.com/v1/${cid}/address/${pairAddress}/transactions_v2/?page-size=200&block-signed-at-asc=true&key=${encodeURIComponent(key)}`;
    const res = await undiciRequest(url);
    const j: any = await res.body.json();
    const items = Array.isArray(j?.data?.items) ? j.data.items : [];
    const t1 = t0Ms + windowMs;
    const out: TxLite[] = [];
    for (const it of items) {
      const ts = Date.parse(it.block_signed_at || '');
      if (!isFinite(ts)) continue;
      if (ts < t0Ms) continue;
      if (ts > t1) break;
      const from = String(it.from_address || '').toLowerCase();
      // Best-effort USD estimation not available here; leave undefined for count-based share
      out.push({ ts, from });
    }
    return out;
  } catch {
    return undefined;
  }
}

// Test seam: overrideable HTTP implementation for explorer fallback only
type HttpResponse = { statusCode: number; body: { json: () => Promise<any> } };
type HttpImpl = (url: string, init?: any) => Promise<HttpResponse>;
let httpImpl: HttpImpl = undiciRequest as unknown as HttpImpl;
export function __testOnly_setHttpImpl(impl?: HttpImpl) {
  httpImpl = (impl || (undiciRequest as unknown as HttpImpl));
}

export async function fetchEarlyWindow(
  chain: string,
  tokenAddress: string,
  pairAddress: string | undefined,
  windowMs?: number
): Promise<EarlyWindow> {
  const wMs = Math.max(10_000, Number(windowMs ?? DEFAULT_T_SECONDS * 1000));
  try {
    let pair = pairAddress;
    if (!pair) {
      try {
        const enr = await enrichToken(chain, tokenAddress);
        pair = enr.price?.pair;
      } catch {}
    }
    if (!pair) {
      return { t0: Date.now(), windowMs: wMs, trades: [], dataStatus: 'insufficient', reason: 'no_pair_or_t0' };
    }
    const t0 = await getPairT0(chain, pair);
    if (!t0) {
      return { t0: Date.now(), windowMs: wMs, trades: [], dataStatus: 'insufficient', reason: 'no_pair_or_t0' };
    }

    const c = getCache();
    const cacheKey = `sniper:early:${chain}:${pair}:t0:${Math.floor(t0/1000)}:w:${Math.floor(wMs/1000)}`;
    const hit = await c.get<EarlyWindow>(cacheKey);
    if (hit) return hit;

    let txs = await fetchPairTxsInWindow(chain, pair, t0, wMs);
    // Optional REST explorer fallback for early trades — disabled by default
    // Env flags:
    // - EXPLORER_FALLBACK_ENABLED=false
    // - EXPLORER_BASE_URL_INK (string; optional)
    if ((!txs || txs.length === 0) && process.env.EXPLORER_FALLBACK_ENABLED === 'true') {
      try {
        const base = process.env.EXPLORER_BASE_URL_INK || '';
        const inkwanted = chain.toLowerCase() === 'ink';
        if (base && inkwanted) {
          const start = t0;
          const end = t0 + wMs;
          const url = `${base.replace(/\/$/, '')}/api/logs?pair=${encodeURIComponent(pair)}&start=${start}&end=${end}`;
          const resp = await httpImpl(url, { method: 'GET', headers: { 'accept': 'application/json' } });
          if (resp.statusCode === 200) {
            const json: any = await resp.body.json().catch(()=>({}));
            const items: Array<{ from?: string; ts?: number; amountUsd?: number }>
              = Array.isArray(json?.logs) ? json.logs : Array.isArray(json) ? json : [];
            if (items.length > 0) {
              txs = items
                .filter(it => typeof it.ts === 'number' && it.ts >= start && it.ts <= end)
                .map(it => ({ from: String(it.from||'').toLowerCase(), ts: Number(it.ts), amountUsd: typeof it.amountUsd==='number'?it.amountUsd:undefined }));
            }
          }
        }
      } catch {
        // Best-effort; ignore errors and fall through
      }
    }
    if (!txs) {
      // After fallback failure, surface as "insufficient" with provider_error to match REST fallback contract
      const v: EarlyWindow = { t0, windowMs: wMs, trades: [], dataStatus: 'insufficient', reason: 'provider_error' };
      await c.set(cacheKey, v, 60);
      return v;
    }
    if (txs.length === 0) {
      const v: EarlyWindow = { t0, windowMs: wMs, trades: [], dataStatus: 'insufficient', reason: 'no_trades' };
      await c.set(cacheKey, v, 60);
      return v;
    }

    // Best-effort: treat tx.from as buyer identity
    const trades: EarlyTrade[] = txs.map(tx => ({ buyer: tx.from, ts: tx.ts }));
    const out: EarlyWindow = { t0, windowMs: wMs, trades, dataStatus: 'ok' };
    await c.set(cacheKey, out, 120);
    return out;
  } catch {
    return { t0: Date.now(), windowMs: Math.max(10_000, Number(windowMs ?? DEFAULT_T_SECONDS * 1000)), trades: [], dataStatus: 'unavailable', reason: 'provider_error' };
  }
}


