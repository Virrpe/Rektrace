import { request } from 'undici';
import { shouldDrop, latency as chaosLatency } from './testing/chaos.js';
import { recordProviderFailure, recordProviderSuccess, addGoldrushUsage } from './metrics.js';
import { estimateCredits } from './goldrush_cost.js';
import { Breaker } from './circuit.js';

const DEMO = process.env.DEMO_MODE === 'true';

const IS_TEST = !!process.env.VITEST_WORKER_ID || process.env.NODE_ENV === 'test';
const PROVIDER_TIMEOUT_MS = IS_TEST ? 50 : Number(process.env.PROVIDER_TIMEOUT_MS ?? 2500);
const PROVIDER_RETRY = Math.max(0, Number(process.env.PROVIDER_RETRY ?? (IS_TEST ? 0 : 1)));
// GoldRush concurrency cap
let grInFlight = 0;
const grQueue: Array<() => void> = [];
const GR_MAX = Math.max(1, Number(process.env.GOLDRUSH_MAX_CONCURRENCY || 4));
async function withGoldrushConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  if (grInFlight >= GR_MAX) await new Promise<void>(res => grQueue.push(res));
  grInFlight++;
  try { return await fn(); } finally { grInFlight--; const next = grQueue.shift(); if (next) next(); }
}

export const breakers = {
  coingecko: new Breaker(),
  bitquery: new Breaker(),
  moralis: new Breaker(),
  helius: new Breaker(),
  solscan: new Breaker(),
  dexscreener: new Breaker(),
  covalent: new Breaker(),
  goplus: new Breaker(),
  rugcheck: new Breaker(),
};

async function getJSON(url: string, opts: any = {}) {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= PROVIDER_RETRY; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      // chaos: optional drop/latency
      if (shouldDrop()) throw new Error('chaos: dropped');
      await chaosLatency();
      const res = await request(url, { ...opts, signal: controller.signal });
      if (res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode}`);
      const body = await res.body.json();
      return body;
    } catch (e) {
      lastErr = e;
      if (attempt === PROVIDER_RETRY) throw e;
    } finally {
      clearTimeout(id);
    }
  }
  throw lastErr ?? new Error('request failed');
}

export async function cgSearchId(q: string): Promise<string | null> {
  if (!breakers.coingecko.allow()) { try { (await import('./observability/slo.js')).recordBreakerHit(); } catch {} ; return null; }
  try {
    const t0 = Date.now();
    const j: any = await getJSON(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
    breakers.coingecko.success();
    recordProviderSuccess('coingecko', Date.now() - t0);
    return j.coins?.[0]?.id ?? null;
  } catch (e) { breakers.coingecko.fail(); recordProviderFailure('coingecko', Date.now() - (0), e); return null; }
}

export async function cgPlatforms(coinId: string): Promise<Record<string,string>> {
  if (!breakers.coingecko.allow()) { try { (await import('./observability/slo.js')).recordBreakerHit(); } catch {} ; return {}; }
  try {
    const t0 = Date.now();
    const j: any = await getJSON(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}`);
    breakers.coingecko.success();
    recordProviderSuccess('coingecko', Date.now() - t0);
    return (j.platforms ?? {}) as Record<string,string>;
  } catch (e) { breakers.coingecko.fail(); recordProviderFailure('coingecko', Date.now() - (0), e); return {}; }
}


async function dsSearchContracts(symbol: string): Promise<Record<string,string>> {
  if (!breakers.dexscreener.allow()) { try { (await import('./observability/slo.js')).recordBreakerHit(); } catch {} ; return {}; }
  try {
    const t0 = Date.now();
    const j: any = await getJSON(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`);
    breakers.dexscreener.success();
    recordProviderSuccess('dexscreener', Date.now() - t0);
    const map: Record<string,string> = {};
    const pairs = (j.pairs || []) as any[];
    // sort by liquidity descending
    pairs.sort((a,b)=> (b.liquidity?.usd||0) - (a.liquidity?.usd||0));
    for (const p of pairs) {
      const base = p.baseToken || {}; // {address,symbol}
      const chain = (p.chainId || '').toLowerCase();
      if (!base.address || !chain) continue;
      // map popular chain aliases to our IDs
      const alias: Record<string,string> = { bsc:'binance-smart-chain', bnb:'binance-smart-chain', eth:'ethereum', base:'base', matic:'polygon-pos', polygon:'polygon-pos', arb:'arbitrum-one', arbitrum:'arbitrum-one', op:'optimistic-ethereum', optimism:'optimistic-ethereum', avax:'avalanche', ftm:'fantom', sol:'solana', solana:'solana' };
      const key = alias[chain] || chain;
      // keep first (most liquid) per chain
      if (!map[key]) map[key] = base.address;
      // limit to ~6 chains
      if (Object.keys(map).length >= 6) break;
    }
    return map;
  } catch (e) { breakers.dexscreener.fail(); recordProviderFailure('dexscreener', Date.now() - (0), e); return {}; }
}

export async function resolveContracts(query: string): Promise<Record<string,string>> {
  if (DEMO) {
    return {
      ethereum: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      'binance-smart-chain': '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      'polygon-pos': '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      ink: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      solana: 'So11111111111111111111111111111111111111112'
    };
  }
  const isEth = /^0x[a-fA-F0-9]{40}$/.test(query);
  const isSol = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(query);
  if (isEth) return { ethereum: query };
  if (isSol) return { solana: query };
  if (query.startsWith('http') && query.includes('coingecko.com/coins/')) {
    const id = query.split('/').pop() as string; return await cgPlatforms(id);
  }
  const id = await cgSearchId(query);
  if (id) return await cgPlatforms(id);
  // Fallback: DexScreener by symbol (best-effort)
  const ds = await dsSearchContracts(query);
  return ds;
}

export async function holdersEvmBitquery(chain: string, contract: string): Promise<number | null> {
  return null; // Bitquery key not wired in this minimal zip; add later
}

export async function holdersEvmMoralis(chain: string, contract: string): Promise<number | null> {
  return null; // placeholder; plug Moralis or other providers as you get keys
}

// Covalent: uses pagination.total_count from token holders endpoint
export async function holdersEvmCovalent(chain: string, contract: string): Promise<number | null> {
  const key = process.env.COVALENT_API_KEY || '';
  if (!key) return null;
  if (!breakers.covalent.allow()) { try { (await import('./observability/slo.js')).recordBreakerHit(); } catch {} ; return null; }
  const chainMap: Record<string, number> = {
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
  const cid = chainMap[chain];
  if (!cid) return null;
  try {
    const url = `https://api.covalenthq.com/v1/${cid}/tokens/${contract}/token_holders/?page-size=1&key=${encodeURIComponent(key)}`;
    const t0 = Date.now();
    const j: any = await withGoldrushConcurrency(() => getJSON(url));
    breakers.covalent.success();
    recordProviderSuccess('covalent', Date.now() - t0);
    addGoldrushUsage('HOLDERS', estimateCredits('HOLDERS'));
    const total = j?.data?.pagination?.total_count ?? j?.data?.pagination?.total_count?.toString?.();
    if (typeof total === 'number') return total;
    const asNum = Number(total ?? j?.data?.items?.length ?? 0);
    return Number.isFinite(asNum) && asNum > 0 ? asNum : null;
  } catch (e) { breakers.covalent.fail(); recordProviderFailure('covalent', Date.now() - (0), e); return null; }
}

export async function holdersSolanaSolscan(mint: string): Promise<number | null> {
  if (!breakers.solscan.allow()) { try { (await import('./observability/slo.js')).recordBreakerHit(); } catch {} ; return null; }
  try {
    const t0 = Date.now();
    const j = await getJSON(`https://api.solscan.io/token/meta?tokenAddress=${mint}`);
    breakers.solscan.success();
    recordProviderSuccess('solscan', Date.now() - t0);
    if ((j as any).success) return Number((j as any).data?.holder ?? 0);
    return null;
  } catch (e) { breakers.solscan.fail(); recordProviderFailure('solscan', Date.now() - (0), e); return null; }
}

export async function fetchHolders(chain: string, contract: string): Promise<{holders:number|null, source:string}> {
  if (DEMO) {
    const demoMap: Record<string, number> = {
      ethereum: 12345,
      'binance-smart-chain': 8901,
      'polygon-pos': 7777,
      base: 4567,
      'arbitrum-one': 6789,
      solana: 6543,
    };
    const v = demoMap[chain] ?? 1111;
    return { holders: v, source: 'demo' };
  }
  if (chain === 'solana') {
    const v2 = await holdersSolanaSolscan(contract); if (v2 !== null) return { holders: v2, source: 'solscan' };
    return { holders: null, source: 'none' };
  }
  // EVM: Covalent primary with optional fallback consensus
  const { holdersFallback } = await import('./providers_holders_fallback.js');
  const cvPromise = holdersEvmCovalent(chain, contract);
  const fbPromise = holdersFallback(chain, contract);
  const [cv, fb] = await Promise.all([cvPromise, fbPromise]);
  if (cv !== null && fb !== null) {
    const a = Number(cv), b = Number(fb);
    const near = Math.abs(a - b) / Math.max(1, Math.max(a, b)) <= 0.10;
    const picked = near ? a : Math.max(a, b);
    return { holders: picked, source: near ? 'covalent+fallback' : 'holders_consensus:divergent' } as any;
  }
  if (cv !== null) return { holders: cv, source: 'covalent' };
  if (fb !== null) return { holders: fb, source: 'fallback' } as any;
  const mr = await holdersEvmMoralis(chain, contract);
  if (mr !== null) return { holders: mr, source: 'moralis' };
  const bq = await holdersEvmBitquery(chain, contract);
  if (bq !== null) return { holders: bq, source: 'bitquery' };
  return { holders: null, source: 'none' };
}
