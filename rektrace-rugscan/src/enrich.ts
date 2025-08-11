import { request } from 'undici';
import Redis from 'ioredis';
import { MemoryCache, RedisCache, type CacheLike } from '../../src/cache.js';

const DEMO = process.env.DEMO_MODE === 'true';

export type TradeLite = { side: 'buy'|'sell'; amountUsd?: number; from?: string; to?: string; ts?: number };
export type ContractMeta = { createdAt?: string; deployer?: string; deployerTxCount?: number };
export type Enrichment = {
  price?: { change24h?: number; baseSymbol?: string; quoteSymbol?: string; pair?: string };
  trades?: TradeLite[];
  contract?: ContractMeta;
};

let cache: CacheLike | undefined;
const LP_TTL_SECONDS = Math.max(60, Number(process.env.LP_TTL_SECONDS ?? 600));
function getCache(ttl = LP_TTL_SECONDS): CacheLike {
  if (cache) return cache;
  const url = process.env.REDIS_URL || '';
  cache = url ? new RedisCache(new Redis(url), ttl) : new MemoryCache(ttl);
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

async function enrichFromDexScreener(chain: string, address: string): Promise<Pick<Enrichment,'price'|'trades'>> {
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${address}`;
    const res = await request(url);
    const j: any = await res.body.json();
    const pairs = (j.pairs || []) as any[];
    if (!pairs.length) return {};
    // prefer same-chain, highest liquidity
    const alias: Record<string,string> = { bsc:'binance-smart-chain', bnb:'binance-smart-chain', eth:'ethereum', base:'base', matic:'polygon-pos', polygon:'polygon-pos', arb:'arbitrum-one', arbitrum:'arbitrum-one', op:'optimistic-ethereum', optimism:'optimistic-ethereum', avax:'avalanche', ftm:'fantom', sol:'solana', solana:'solana' };
    const pick = pairs
      .filter(p => (alias[(p.chainId||'').toLowerCase()] || (p.chainId||'').toLowerCase()) === chain)
      .sort((a,b)=> (b.liquidity?.usd||0) - (a.liquidity?.usd||0))[0] || pairs.sort((a,b)=> (b.liquidity?.usd||0) - (a.liquidity?.usd||0))[0];
    if (!pick) return {};
    const price = {
      change24h: typeof pick.priceChange?.h24 === 'number' ? pick.priceChange.h24 : undefined,
      baseSymbol: pick.baseToken?.symbol,
      quoteSymbol: pick.quoteToken?.symbol,
      pair: pick.pairAddress,
    };
    // DexScreener public API doesn't provide raw trade list in this endpoint; leave empty
    const trades: TradeLite[] = [];
    return { price, trades };
  } catch {
    return {};
  }
}

async function enrichContractMeta(chain: string, address: string): Promise<ContractMeta | undefined> {
  try {
    if (chain === 'solana') {
      // Best-effort: Solana token creation not trivial here; skip gracefully
      return undefined;
    }
    const key = process.env.COVALENT_API_KEY || '';
    const cid = evmChainId(chain);
    if (!key || !cid) return undefined;
    // Heuristic: earliest tx to the contract address
    const url = `https://api.covalenthq.com/v1/${cid}/address/${address}/transactions_v2/?page-size=1&block-signed-at-asc=true&key=${encodeURIComponent(key)}`;
    const res = await request(url);
    const j: any = await res.body.json();
    const tx = j?.data?.items?.[0];
    if (!tx) return undefined;
    const createdAt: string | undefined = tx.block_signed_at;
    const deployer: string | undefined = tx.from_address;
    // Fetch deployer tx count (best-effort)
    let deployerTxCount: number | undefined = undefined;
    try {
      const url2 = `https://api.covalenthq.com/v1/${cid}/address/${deployer}/transactions_v2/?page-size=1&key=${encodeURIComponent(key)}`;
      const res2 = await request(url2);
      const j2: any = await res2.body.json();
      const total = j2?.data?.pagination?.total_count;
      if (typeof total === 'number') deployerTxCount = total;
    } catch {}
    return { createdAt, deployer, deployerTxCount };
  } catch {
    return undefined;
  }
}

export async function enrichToken(chain: string, address: string): Promise<Enrichment> {
  const c = getCache();
  const key = `enrich:${chain}:${address}`;
  const hit = await c.get<Enrichment>(key);
  if (hit) return hit;

  if (DEMO) {
    const demo: Enrichment = {
      price: { change24h: 1.23, baseSymbol: 'DEMO', quoteSymbol: 'USDC', pair: '0xpair' },
      trades: [
        { side: 'buy', amountUsd: 1200, ts: Date.now()-60_000 },
        { side: 'sell', amountUsd: 800, ts: Date.now()-120_000 },
      ],
      contract: { createdAt: new Date(Date.now()-7*86400000).toISOString(), deployer: '0xdeployer', deployerTxCount: 42 },
    };
    await c.set(key, demo, LP_TTL_SECONDS);
    return demo;
  }

  const [ds, meta] = await Promise.all([
    enrichFromDexScreener(chain, address),
    enrichContractMeta(chain, address),
  ]);
  const out: Enrichment = { price: ds.price, trades: ds.trades, contract: meta };
  await c.set(key, out, LP_TTL_SECONDS);
  return out;
}


