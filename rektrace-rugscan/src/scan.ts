import 'dotenv/config';
import { resolveContracts, fetchHolders } from '../../src/providers.js';
import { goplusTokenSecurity, type GoPlusTokenSec } from '../../src/providers_goplus.js';
import { rugcheckMint } from '../../src/providers_rugcheck_solana.js';
import { vetConsensus } from '../../src/vetting_consensus.js';
import Redis from 'ioredis';
import { MemoryCache, RedisCache, type CacheLike } from '../../src/cache.js';
import { request } from 'undici';
import { shouldDrop, latency as chaosLatency } from '../../src/testing/chaos.js';
import { parseLpFromDexScreenerPair, type LPLockInfo } from './lp_lock.js';

const DEMO = process.env.DEMO_MODE === 'true';

export type ChainId = 'ethereum'|'binance-smart-chain'|'polygon-pos'|'arbitrum-one'|'optimistic-ethereum'|'avalanche'|'fantom'|'base'|'solana'|'ink';

export type ScanItem = {
  chain: ChainId;
  address: string;
  holders: number | null;
  flags: string[];
  score: number; // 0-100 risk-adjusted confidence (higher = safer)
  sources: string[]; // e.g., ['goplus','rugcheck','holders:covalent']
  confidence?: 'high'|'medium';
};

export type ScanResponse =
  | { status: 'ok'; query: string; items: ScanItem[]; consensus?: { score: number; decision: 'approved'|'manual'|'rejected'; notes: string[] } }
  | { status: 'ambiguous'; query: string; suggestions: Array<{ label: string; chain: string; address: string }>; hint: string }
  | { status: 'not_found'; query: string }
  | { status: 'error'; query: string; message: string };

function clamp(n: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)); }

function demoScan(query: string): ScanResponse {
  // Provide deterministic demo output with two common chains
  const addr = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  const items: ScanItem[] = [
    { chain: 'ethereum', address: addr, holders: 12345, flags: ['LP locked 90d','Tax 3/3%','No honeypot'], score: 78, sources: ['demo'], confidence: 'high' },
    { chain: 'solana', address: 'So11111111111111111111111111111111111111112', holders: 6543, flags: ['Top1 holder 22%','Not flagged by RugCheck'], score: 72, sources: ['demo'], confidence: 'high' },
  ];
  return { status: 'ok', query, items, consensus: { score: 75, decision: 'approved', notes: ['demo: auto-consensus'] } };
}

export type HoldersConsensus = { confidence: 'high'|'medium'; flags: string[] };

export function computeHoldersConsensus(primary: number | null, fallback: number | null): HoldersConsensus {
  const flags: string[] = [];
  if (primary == null || fallback == null) return { confidence: 'medium', flags };
  const a = Number(primary);
  const b = Number(fallback);
  const hi = Math.max(Math.abs(a), Math.abs(b));
  const lo = Math.min(Math.abs(a), Math.abs(b));
  // use relative-to-max so ±10% window matches tests
  const within = hi > 0 ? (hi - lo) / hi : 1;
  if (within <= 0.10) return { confidence: 'high', flags };
  flags.push('holders_consensus:divergent');
  return { confidence: 'medium', flags };
}

function scoreFromGoPlus(gp: GoPlusTokenSec | null): { score: number; flags: string[]; sourceUsed: boolean } {
  if (!gp) return { score: 0, flags: ['goplus: no data'], sourceUsed: false };
  const flags: string[] = [];
  let s = 0;
  if (gp.is_honeypot === '0') s += 20; else if (gp.is_honeypot === '1') flags.push('goplus: honeypot');
  if (gp.is_mintable === '0') s += 10; else flags.push('mintable');
  if (gp.cannot_sell_all === '0') s += 10; else flags.push('cannot sell all');
  if (gp.owner_change_balance === '0') s += 10; else flags.push('owner can change balance');
  const tax = (Number(gp.buy_tax||0) + Number(gp.sell_tax||0));
  if (tax <= 20) s += 5; else flags.push(`high tax ${tax}%`);
  if (gp.holder_count && Number(gp.holder_count) > 2000) s += 5;
  // LP concentration heuristic if available
  const maxLpPct = Math.max(...(gp.lp_holders||[]).map(h=> Number(h.percent||0)), 0);
  if (maxLpPct >= 60) flags.push(`LP holder ${maxLpPct}%`); else if (maxLpPct > 0) s += 5;
  return { score: clamp(s, 0, 60), flags, sourceUsed: true };
}

function scoreFromRugcheck(rc: Awaited<ReturnType<typeof rugcheckMint>>): { score: number; flags: string[]; sourceUsed: boolean } {
  if (!rc) return { score: 0, flags: ['rugcheck: no data'], sourceUsed: false };
  const flags: string[] = [];
  let s = 0;
  if (rc.score != null) { s += Math.min(40, Math.max(0, rc.score * 0.4)); flags.push(`rugcheck score ${rc.score}`); }
  if (rc.isScam) flags.push('rugcheck: flagged scam'); else s += 10;
  const top1 = rc.topHolders?.[0]?.percent ?? 0;
  if (top1 < 35) s += 5; else flags.push(`top1 holder ${top1}%`);
  return { score: clamp(s, 0, 55), flags, sourceUsed: true };
}

// --- Liquidity depth and LP lock heuristics ---
type LiquidityInfo = { usd?: number; pair?: string; baseSymbol?: string; quoteSymbol?: string; lpLockedPct?: number; lpBurned?: boolean };

async function fetchLiquidityDexScreener(chain: string, address: string): Promise<LiquidityInfo | null> {
  try {
    if (shouldDrop()) throw new Error('chaos: dropped');
    await chaosLatency();
    // DexScreener pair lookup by token address returns pairs across chains; filter by chain
    const url = `https://api.dexscreener.com/latest/dex/tokens/${address}`;
    const res = await request(url);
    const j: any = await res.body.json();
    const pairs = (j.pairs || []) as any[];
    if (!pairs.length) return null;
    // choose highest liquidity pair matching chain alias
    const alias: Record<string,string> = { bsc:'binance-smart-chain', bnb:'binance-smart-chain', eth:'ethereum', base:'base', matic:'polygon-pos', polygon:'polygon-pos', arb:'arbitrum-one', arbitrum:'arbitrum-one', op:'optimistic-ethereum', optimism:'optimistic-ethereum', avax:'avalanche', ftm:'fantom', sol:'solana', solana:'solana', ink:'ink' };
    const pick = pairs
      .filter(p => (alias[(p.chainId||'').toLowerCase()] || (p.chainId||'').toLowerCase()) === chain)
      .sort((a,b)=> (b.liquidity?.usd||0) - (a.liquidity?.usd||0))[0] || pairs.sort((a,b)=> (b.liquidity?.usd||0) - (a.liquidity?.usd||0))[0];
    if (!pick) return null;
    const liq: LiquidityInfo = {
      usd: Number(pick.liquidity?.usd || 0),
      pair: pick.pairAddress,
      baseSymbol: pick.baseToken?.symbol,
      quoteSymbol: pick.quoteToken?.symbol,
    };
    // LP lock/burn heuristic (best-effort): if pair has info on liquidityLockers or burn wallets
    // DexScreener sometimes exposes lock info in 'liquidity' object or via 'owner' fields
    const lockers = pick.liquidity?.lockers || pick.liquidity?.locked || pick.liquidity?.locks;
    if (Array.isArray(lockers) && lockers.length) {
      // pick highest lock percent and nearest unlock time
      let maxPct = 0; let soonestUnlock: number | undefined;
      for (const l of lockers) {
        const pct = Number(l.percent || l.pct || 0);
        if (pct > maxPct) maxPct = pct;
        const until = Number(l.unlockAt || l.unlock_at || l.unlockTime || 0);
        if (until && (!soonestUnlock || until < soonestUnlock)) soonestUnlock = until;
      }
      liq.lpLockedPct = Math.max(liq.lpLockedPct || 0, maxPct);
      if (soonestUnlock) (liq as any).lpUnlockAt = soonestUnlock;
    }
    // Burn detection heuristic
    const renounced = pick?.owner?.isRenounced || pick?.owner?.renounced;
    if (renounced) liq.lpBurned = true;
    return liq;
  } catch { return null; }
}

function scoreFromLiquidity(liq: LiquidityInfo | null): { score: number; flags: string[] } {
  if (!liq) return { score: 0, flags: ['liquidity: unknown'] };
  const flags: string[] = [];
  let s = 0;
  const usd = Number(liq.usd || 0);
  flags.push(`liquidity $${usd.toLocaleString()}`);
  if (usd >= 500000) s += 15; else if (usd >= 100000) s += 10; else if (usd >= 25000) s += 5; else flags.push(`low liquidity $${usd.toLocaleString()}`);
  if (liq.lpBurned) { s += 10; flags.push('LP burned'); }
  if (liq.lpLockedPct != null) {
    if (liq.lpLockedPct >= 80) { s += 10; flags.push(`LP locked ${liq.lpLockedPct}%`); }
    else if (liq.lpLockedPct >= 50) { s += 5; flags.push(`LP locked ${liq.lpLockedPct}%`); }
    else { flags.push(`LP low lock ${liq.lpLockedPct??0}%`); }
  }
  const unlockAt = (liq as any).lpUnlockAt ? Number((liq as any).lpUnlockAt) : undefined;
  if (unlockAt && Number.isFinite(unlockAt)) {
    const inMs = unlockAt * (unlockAt > 2_000_000_000 ? 1 : 1000) - Date.now();
    const days = Math.floor(inMs / 86_400_000);
    if (days >= 0) flags.push(`LP unlock in ${days}d`);
    if (inMs < 7 * 86_400_000) flags.push('LP unlock < 7d');
  }
  return { score: clamp(s, 0, 25), flags };
}

async function getLpLockInfo(chain: string, address: string): Promise<LPLockInfo | null> {
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${address}`;
    const res = await request(url);
    const j: any = await res.body.json();
    const pairs = (j.pairs || []) as any[];
    if (!pairs.length) return null;
    const alias: Record<string,string> = { bsc:'binance-smart-chain', bnb:'binance-smart-chain', eth:'ethereum', base:'base', matic:'polygon-pos', polygon:'polygon-pos', arb:'arbitrum-one', arbitrum:'arbitrum-one', op:'optimistic-ethereum', optimism:'optimistic-ethereum', avax:'avalanche', ftm:'fantom', sol:'solana', solana:'solana' };
    const pick = pairs
      .filter(p => (alias[(p.chainId||'').toLowerCase()] || (p.chainId||'').toLowerCase()) === chain)
      .sort((a,b)=> (b.liquidity?.usd||0) - (a.liquidity?.usd||0))[0] || pairs.sort((a,b)=> (b.liquidity?.usd||0) - (a.liquidity?.usd||0))[0];
    if (!pick) return null;
    return parseLpFromDexScreenerPair(pick);
  } catch {
    return null;
  }
}

const CHAIN_ALIASES: Record<string, ChainId> = {
  eth: 'ethereum', ethereum: 'ethereum',
  bsc: 'binance-smart-chain', 'binance-smart-chain': 'binance-smart-chain', bnb: 'binance-smart-chain',
  matic: 'polygon-pos', polygon: 'polygon-pos', 'polygon-pos': 'polygon-pos',
  arb: 'arbitrum-one', arbitrum: 'arbitrum-one', 'arbitrum-one': 'arbitrum-one',
  op: 'optimistic-ethereum', optimism: 'optimistic-ethereum', 'optimistic-ethereum': 'optimistic-ethereum',
  avax: 'avalanche', avalanche: 'avalanche',
  ftm: 'fantom', fantom: 'fantom',
  base: 'base',
  sol: 'solana', solana: 'solana', ink: 'ink',
};

function parseChainPrefix(q: string): { chain?: ChainId; rest: string } {
  const m = q.match(/^([a-zA-Z0-9_-]+):(.+)$/);
  if (!m) return { rest: q };
  const alias = m[1].toLowerCase();
  const mapped = CHAIN_ALIASES[alias];
  if (!mapped) return { rest: q };
  return { chain: mapped, rest: m[2].trim() };
}

export async function scanToken(query: string): Promise<ScanResponse> {
  const { chain, rest } = parseChainPrefix(query.trim());
  if (chain) {
    // If rest is an address, scan exact. Otherwise resolve and filter to chain.
    const isEth = /^0x[a-fA-F0-9]{40}$/.test(rest);
    const isSol = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(rest);
    if (isEth || isSol) return scanTokenExact(rest, { chain, address: rest });
    // Resolve and pick the address for the requested chain
    const map = await resolveContracts(rest);
    const addr = (map as any)[chain];
    if (!addr) return { status: 'ambiguous', query: rest, suggestions: [{ label: `${rest} on ${chain}`, chain, address: 'not-found' }], hint: 'No exact match on requested chain.' };
    return scanTokenExact(rest, { chain, address: addr });
  }
  return scanTokenExact(query, undefined);
}

let cache: CacheLike | undefined;
let memoryVersion = 1;
const SCAN_TTL_SECONDS = Math.max(1, Number(process.env.SCAN_TTL_SECONDS ?? 120));

function getCache(): CacheLike {
  if (cache) return cache;
  const redisUrl = process.env.REDIS_URL || '';
  if (redisUrl) cache = new RedisCache(new Redis(redisUrl), SCAN_TTL_SECONDS);
  else cache = new MemoryCache(SCAN_TTL_SECONDS);
  return cache!;
}

async function getScanCacheVersion(): Promise<number> {
  const redisUrl = process.env.REDIS_URL || '';
  if (!redisUrl) return memoryVersion;
  try {
    const r = new Redis(redisUrl);
    const v = await r.get('rugscan:ver');
    await r.quit();
    const n = v ? Number(v) : 1;
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch { return 1; }
}

export async function bumpScanCacheVersion(): Promise<number> {
  const redisUrl = process.env.REDIS_URL || '';
  if (!redisUrl) { memoryVersion++; return memoryVersion; }
  try {
    const r = new Redis(redisUrl);
    const n = await r.incr('rugscan:ver');
    await r.quit();
    return n;
  } catch { return 1; }
}

export async function scanTokenExact(query: string, exact?: { chain: string; address: string }): Promise<ScanResponse> {
  try {
    if (DEMO) return demoScan(query);

    const ver = await getScanCacheVersion();
    const cacheKey = exact ? `scan:v${ver}:exact:${exact.chain}:${exact.address}` : `scan:v${ver}:q:${query.toLowerCase()}`;
    const c = getCache();
    const hit = await c.get<ScanResponse>(cacheKey);
    if (hit) return hit;

    const contracts = exact ? { [exact.chain]: exact.address } : await resolveContracts(query);
    const entries = Object.entries(contracts);
    if (entries.length === 0) return { status: 'not_found', query };

    // If multiple possible matches across chains and the query isn't an explicit address, prompt for clarification
    const isEth = /^0x[a-fA-F0-9]{40}$/.test(query);
    const isSol = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(query);
    if (!exact && !isEth && !isSol && entries.length > 1) {
      const suggestions = entries.slice(0, 6).map(([chain, address]) => ({ label: `${query} on ${chain}`, chain, address }));
      return { status: 'ambiguous', query, suggestions, hint: 'Multiple matches found. Specify by chain or paste the exact contract.' };
    }

    const items: ScanItem[] = [];
    for (const [chain, address] of entries) {
      const flags: string[] = [];
      const sources: string[] = [];
      let score = 0;
      // Holders
      const holdersRes = await fetchHolders(chain, address);
      const holders = holdersRes.holders;
      if (holdersRes.source) sources.push(`holders:${holdersRes.source}`);
      // Infer consensus confidence from holders source markers
      let holdersConfidence: 'high'|'medium' = 'medium';
      if (holders != null) holdersConfidence = 'high';
      if (holdersRes.source === 'holders_consensus:divergent') {
        holdersConfidence = 'medium';
        flags.push('holders_consensus:divergent');
      }

    if (chain === 'solana') {
        const rc = await rugcheckMint(address);
        const s = scoreFromRugcheck(rc);
        score += s.score; flags.push(...s.flags); if (s.sourceUsed) sources.push('rugcheck');
      } else {
        const gp: GoPlusTokenSec | null = await goplusTokenSecurity(chain, address);
        const s = scoreFromGoPlus(gp);
        score += s.score; flags.push(...s.flags); if (s.sourceUsed) sources.push('goplus');
        if (gp == null) flags.push('goplus_unavailable');
      // Liquidity depth for EVM via DexScreener (skip in unit tests unless explicitly enabled)
      const IS_TEST = !!process.env.VITEST_WORKER_ID || process.env.NODE_ENV === 'test';
      if (!IS_TEST || process.env.ENABLE_LIQ_TEST === 'true') {
        const liq = await fetchLiquidityDexScreener(chain, address);
        const sl = scoreFromLiquidity(liq);
        score += sl.score; flags.push(...sl.flags); if (liq) sources.push('dexscreener');
        // LP lock/burn explicit signals
        const lp = await getLpLockInfo(chain, address);
        if (lp) {
          sources.push('dexscreener:lp');
          if (lp.burned) { score += 12; flags.push('lp_burned'); }
          else if (typeof lp.lockedPct === 'number') {
            const p = Math.round(lp.lockedPct);
            if (p >= 95) { score += 10; flags.push('lp_locked_≥95%'); }
            else if (p >= 70) { score += 6; flags.push(`lp_locked_${p}%`); }
            else if (p >= 40) { score += 3; flags.push(`lp_locked_${p}%`); }
            else { score -= 6; flags.push(`low_lp_lock_${p}%`); }
          } else { flags.push('lp_lock:unknown'); }
          if (typeof lp.unlockDays === 'number') {
            if (lp.unlockDays < 7) { score -= 10; flags.push('lp_unlock_<7d'); }
            else if (lp.unlockDays < 30) { score -= 4; flags.push('lp_unlock_<30d'); }
            else if (lp.unlockDays > 90) { score += 2; flags.push('lp_unlock_>90d'); }
          }
          if (lp.locker) flags.push(`lp_locker=${lp.locker}`);
        }
        score = clamp(score, 0, 100);
      }
      }

      // Normalize to 0-100 safety score
    const normalized = clamp(score, 0, 100);
      items.push({ chain: chain as ChainId, address, holders, flags, score: normalized, sources, confidence: holdersConfidence });
      // Record recent rugs
      try {
        if (normalized < 40) {
          // dynamic import to avoid cycle
          const { default: rec } = await import('./track_recent.js');
          rec(chain, address, normalized);
        }
      } catch {}
    }

    // Optional: unify with ads vetting consensus as a reference score
    let consensus: ScanResponse extends { status: 'ok'; consensus: infer C } ? C : any;
    const IS_TEST = !!process.env.VITEST_WORKER_ID || process.env.NODE_ENV === 'test';
    if (!IS_TEST) {
      try {
        const first = items[0];
        const cons = await vetConsensus({ url: 'https://example.org', chain: first.chain === 'solana' ? 'sol' : 'evm', token: first.address });
        consensus = { score: cons.score, decision: cons.decision, notes: cons.notes } as any;
      } catch {}
    }

    const out: ScanResponse = { status: 'ok', query, items, consensus };
    await c.set(cacheKey, out, SCAN_TTL_SECONDS);
    return out;
  } catch (e:any) {
    return { status: 'error', query, message: e?.message || 'unexpected error' };
  }
}


