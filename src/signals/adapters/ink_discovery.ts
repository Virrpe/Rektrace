import Redis from 'ioredis';
import { request } from 'undici';
import type { TradeTick } from '../schemas.js';

type Stopper = () => void;

function getRedis(): Redis | null { const url = process.env.REDIS_URL || ''; return url ? new Redis(url) : null as any; }

function parseChains(): string[] {
  const raw = String(process.env.SIGNALS_CHAINS || 'ink');
  return raw.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
}

async function fetchPairsForChain(chain: string): Promise<Array<{ address: string; symbol?: string; priceUsd?: number }>> {
  // DexScreener chain pairs endpoint (best-effort)
  try {
    const url = `https://api.dexscreener.com/latest/dex/pairs/${encodeURIComponent(chain)}`;
    const res = await request(url);
    const j: any = await res.body.json();
    const pairs = (j.pairs || []) as any[];
    const mapped = pairs.slice(0, 50).map(p => ({
      address: p.pairAddress || p.baseToken?.address || '',
      symbol: p.baseToken?.symbol ? `${p.baseToken.symbol}/${p.quoteToken?.symbol || ''}` : undefined,
      priceUsd: typeof p.priceUsd === 'number' ? p.priceUsd : undefined,
    })).filter(x=>x.address);
    if (mapped.length > 0) return mapped;
  } catch {
    // ignore and try fallback
  }

  // Fallback: DexScreener search API, filter by chainId
  try {
    const q = encodeURIComponent(chain);
    const url2 = `https://api.dexscreener.com/latest/dex/search?q=${q}`;
    const res2 = await request(url2);
    const j2: any = await res2.body.json();
    const pairs2 = (j2.pairs || []) as any[];
    return pairs2
      .filter(p => (p.chainId || '').toLowerCase() === chain.toLowerCase())
      .slice(0, 50)
      .map(p => ({
        address: p.pairAddress || p.baseToken?.address || '',
        symbol: p.baseToken?.symbol ? `${p.baseToken.symbol}/${p.quoteToken?.symbol || ''}` : undefined,
        priceUsd: typeof p.priceUsd === 'number' ? p.priceUsd : undefined,
      }))
      .filter(x => x.address);
  } catch {
    return [];
  }
}

export function startInkDiscovery(opts: { onTick: (t: TradeTick) => void; onInfo?: (msg: string) => void }): Stopper {
  const { onTick, onInfo } = opts;
  const ms = Math.max(1000, Number(process.env.SIGNALS_POLL_MS ?? 5000));
  const DEMO = String(process.env.DEMO_MODE || '').toLowerCase() === 'true';
  const r = getRedis();
  const memSeen = new Map<string, number>(); // key -> ts

  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const chains = parseChains();
      for (const chain of chains) {
        if (DEMO) {
          // Safe demo tick
          const t: TradeTick = { pair: { chain, address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', symbol: 'DEMO/USDC' }, ts: Date.now(), priceUsd: 1.0 };
          onTick(t);
          continue;
        }
        const pairs = await fetchPairsForChain(chain);
        for (const p of pairs) {
          const id = `${chain}:${p.address}`;
          let fresh = false;
          if (r) {
            try {
              const added = await r.sadd('signals:seen', id);
              fresh = added === 1;
              await r.expire('signals:seen', 24 * 3600);
            } catch {}
          } else {
            if (!memSeen.has(id)) { fresh = true; memSeen.set(id, Date.now()); }
          }
          if (!fresh) continue;
          const t: TradeTick = { pair: { chain, address: p.address, symbol: p.symbol }, ts: Date.now(), priceUsd: p.priceUsd };
          onTick(t);
        }
      }
    } catch (e) { onInfo?.('ink_discovery:error'); }
  };
  const id = setInterval(tick, ms);
  return () => { stopped = true; clearInterval(id); };
}


