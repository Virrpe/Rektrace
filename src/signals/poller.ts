import { bus } from '../observability/events.js';
import { TradeTick } from './schemas.js';

type Stopper = () => void;

export function startSignalsPoller(fetchPairs: () => Promise<{ pair: { chain: string; address: string; symbol?: string }, priceUsd?: number }[] | null>): Stopper {
  if (process.env.SIGNALS_ENABLED !== 'true') return () => {};
  const ms = Math.max(1000, Number(process.env.SIGNALS_POLL_MS ?? 5000));
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const list = await fetchPairs();
      const now = Date.now();
      for (const p of list || []) {
        const t: TradeTick = {
          pair: p.pair,
          ts: now,
          priceUsd: p.priceUsd,
          amountUsd: undefined,
          maker: undefined,
        };
        bus.emit('signals:tick', t);
      }
    } catch {}
  };
  const id = setInterval(tick, ms);
  return () => { stopped = true; clearInterval(id); };
}


