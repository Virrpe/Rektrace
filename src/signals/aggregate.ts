import { MinuteBucket, TradeTick, WindowAgg } from './schemas.js';

// A tiny per-pair ring of last 60 minute buckets
export class MinuteRing {
  private buckets: MinuteBucket[] = [];
  private capacity: number;
  constructor(capacity = 60) { this.capacity = Math.max(1, capacity); }

  pushTick(t: TradeTick) {
    const m0 = Math.floor(t.ts / 60000) * 60000;
    const last = this.buckets[this.buckets.length - 1];
    if (!last || last.t0 !== m0) {
      this.buckets.push({ t0: m0, count: 0, volUsd: 0, buyUsd: 0, sellUsd: 0 });
      if (this.buckets.length > this.capacity) this.buckets.shift();
    }
    const b = this.buckets[this.buckets.length - 1];
    b.count++;
    const v = Math.max(0, t.amountUsd ?? 0);
    b.volUsd += v;
    if (t.maker === 'buy') b.buyUsd += v; else if (t.maker === 'sell') b.sellUsd += v;
    if (t.priceUsd != null) {
      if (b.firstPrice == null) b.firstPrice = t.priceUsd;
      b.lastPrice = t.priceUsd;
    }
  }

  computeWindowAgg(winMin: number): WindowAgg {
    const nowMin = Math.floor(Date.now() / 60000) * 60000;
    const cutoff = nowMin - winMin * 60000;
    const win = this.buckets.filter(b => b.t0 >= cutoff);
    let volUsd = 0, buy = 0, sell = 0;
    let firstPrice: number | undefined;
    let lastPrice: number | undefined;
    for (const b of win) {
      volUsd += b.volUsd;
      buy += b.buyUsd; sell += b.sellUsd;
      if (b.firstPrice != null && firstPrice == null) firstPrice = b.firstPrice;
      if (b.lastPrice != null) lastPrice = b.lastPrice;
    }
    const priceChangePct = (firstPrice != null && lastPrice != null && firstPrice > 0)
      ? ((lastPrice - firstPrice) / firstPrice) * 100
      : 0;
    const makerDelta = (buy - sell) / Math.max(1, volUsd);
    return { windowMin: winMin, volUsd, priceChangePct, makerDelta };
  }
}

export function makerDelta(win: WindowAgg): number { return win.makerDelta; }


