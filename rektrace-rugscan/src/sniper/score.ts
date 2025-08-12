import type { EarlyWindow } from './collector.js';

export type SniperSummary = {
  level: 'low' | 'medium' | 'high' | 'unknown';
  uniqueBuyers: number;
  top1Pct: number;
  top3Pct: number;
  botting?: 'none' | 'mild' | 'strong';
};

const MIN_USD = Math.max(0, Number(process.env.SNIPER_MIN_USD ?? 200));
const TOP1_HI = Math.max(1, Number(process.env.SNIPER_TOP1_HI ?? 12));
const TOP3_HI = Math.max(1, Number(process.env.SNIPER_TOP3_HI ?? 25));

const BOT_BURST_TRADES = Math.max(1, Number(process.env.BOT_BURST_TRADES ?? 15));
const BOT_BURST_WINDOW_S = Math.max(5, Number(process.env.BOT_BURST_WINDOW_S ?? 30));
const BOT_PINGPONG_MIN = Math.max(2, Number(process.env.BOT_PINGPONG_MIN ?? 6));
const BOT_UNIFORM_COEF = Math.max(0.01, Number(process.env.BOT_UNIFORM_COEF ?? 0.1));

export function scoreEarlyWindow(win: EarlyWindow): { summary: SniperSummary; events: Array<{ buyer: string; sharePct: number }> } {
  if (win.dataStatus !== 'ok') {
    return { summary: { level: 'unknown', uniqueBuyers: 0, top1Pct: 0, top3Pct: 0 }, events: [] };
  }
  const trades = win.trades.slice().sort((a,b)=>a.ts-b.ts);
  if (trades.length === 0) return { summary: { level: 'unknown', uniqueBuyers: 0, top1Pct: 0, top3Pct: 0 }, events: [] };

  // Group by buyer
  const byBuyer = new Map<string, { count: number; usd: number; sizes: number[]; times: number[] }>();
  for (const t of trades) {
    const key = (t.buyer||'').toLowerCase();
    if (!key) continue;
    const v = byBuyer.get(key) || { count: 0, usd: 0, sizes: [], times: [] };
    v.count += 1;
    if (typeof t.amountUsd === 'number' && isFinite(t.amountUsd)) {
      v.usd += Math.max(0, t.amountUsd);
      v.sizes.push(Math.max(0, t.amountUsd));
    }
    v.times.push(t.ts);
    byBuyer.set(key, v);
  }
  const uniqueBuyers = byBuyer.size;
  if (uniqueBuyers === 0) return { summary: { level: 'unknown', uniqueBuyers: 0, top1Pct: 0, top3Pct: 0 }, events: [] };

  // Compute shares by USD if any USD present and meets minimal threshold, else by count
  const anyUsd = trades.some(t => typeof t.amountUsd === 'number' && isFinite(t.amountUsd));
  const useUsd = anyUsd; // MIN_USD is threshold for individual trades, but for shares we use aggregate availability
  const totals = Array.from(byBuyer.entries()).map(([buyer, v]) => ({ buyer, total: useUsd ? v.usd : v.count }));
  const totalSum = totals.reduce((a,b)=>a + (b.total||0), 0);
  const ordered = totals.sort((a,b)=> (b.total||0) - (a.total||0));
  const top1 = ordered[0]?.total ?? 0;
  const top3 = ordered.slice(0,3).reduce((a,b)=>a + (b.total||0), 0);
  const top1Pct = totalSum>0 ? Math.round((top1/totalSum)*100) : 0;
  const top3Pct = totalSum>0 ? Math.round((top3/totalSum)*100) : 0;

  // Level
  let level: SniperSummary['level'] = 'low';
  if (uniqueBuyers >= 2) level = 'medium';
  if (top3Pct >= TOP3_HI || top1Pct >= TOP1_HI) level = 'high';
  if (!isFinite(top1Pct) || !isFinite(top3Pct)) level = 'unknown';

  // Botting hints (best-effort, only if we have signal)
  let botting: SniperSummary['botting'] | undefined = undefined;
  try {
    let bursts = 0;
    {
      const windowMs = BOT_BURST_WINDOW_S * 1000;
      let i = 0;
      while (i < trades.length) {
        const start = trades[i].ts;
        let j = i;
        while (j < trades.length && trades[j].ts - start <= windowMs) j++;
        const inWin = j - i;
        if (inWin >= BOT_BURST_TRADES) bursts++;
        i++;
      }
    }
    const hasPingPong = Array.from(byBuyer.values()).some(v => v.count >= BOT_PINGPONG_MIN);
    let uniform = false;
    if (useUsd) {
      // stddev/mean for top buyer sizes
      const topBuyer = ordered[0]?.buyer;
      if (topBuyer) {
        const sizes = byBuyer.get(topBuyer)?.sizes || [];
        if (sizes.length >= 3) {
          const mean = sizes.reduce((a,b)=>a+b,0)/sizes.length;
          const sd = Math.sqrt(sizes.reduce((a,b)=>a + Math.pow(b-mean,2),0)/sizes.length);
          if (mean>0 && sd/mean < BOT_UNIFORM_COEF) uniform = true;
        }
      }
    }
    const strong = bursts>0 || (hasPingPong && uniform);
    const mild = hasPingPong || uniform;
    botting = strong ? 'strong' : (mild ? 'mild' : 'none');
  } catch {
    // omit botting
  }

  const events = ordered.slice(0, Math.min(10, ordered.length)).map(e => ({ buyer: e.buyer, sharePct: totalSum>0 ? Math.round((e.total/totalSum)*100) : 0 }));
  const summary: SniperSummary = { level, uniqueBuyers, top1Pct, top3Pct };
  if (botting) summary.botting = botting;
  return { summary, events };
}


