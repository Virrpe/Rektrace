import { bus } from '../observability/events.js';
import { MinuteRing } from './aggregate.js';
import { attest } from './attest.js';
import { scoreFromWindows, type PenaltyContext } from './score.js';
import type { Pair, Signal } from './schemas.js';
import { incrWindowsBuilt, incrEmittedTotal, incrAttestationsTotal, observeComputeMs } from '../observability/signals_metrics.js';

type RingMap = Map<string, MinuteRing>;
const rings: RingMap = new Map();

function key(p: Pair) { return `${p.chain}:${p.address}`; }

export function bootstrapSignalsCompute() {
  if (process.env.SIGNALS_ENABLED !== 'true') return () => {};
  const onTick = (t: any) => {
    const k = key(t.pair);
    let r = rings.get(k);
    if (!r) { r = new MinuteRing(60); rings.set(k, r); }
    r.pushTick(t);
  };
  bus.on('signals:tick', onTick);
  return () => { bus.off('signals:tick', onTick); };
}

export async function computeTopSignals(n = 5): Promise<Signal[]> {
  if (process.env.SIGNALS_ENABLED !== 'true') return [];
  const out: Signal[] = [];
  const t0 = Date.now();
  for (const [k, r] of rings.entries()) {
    const [chain, address] = k.split(':');
    const win5 = r.computeWindowAgg(5);
    const win15 = r.computeWindowAgg(15);
    incrWindowsBuilt();
    // Penalties — reuse simple env knobs; integrate richer invariants later by import where safe
    const penalties: PenaltyContext = { contractAgeDays: null, blacklistProximity: 0, invariantWarnings: 0 };
    const s = scoreFromWindows(win5, win15, penalties);
    const att = await attest({ k, win5, win15, penalties, calc: s });
    incrAttestationsTotal();
    out.push({ id: att.id, pair: { chain, address }, score: Number(s.total.toFixed(3)), metrics: { vol5m: win5.volUsd, price15m: win15.priceChangePct, maker5m: win5.makerDelta }, attestationId: att.id });
  }
  out.sort((a,b)=> b.score - a.score);
  const top = out.slice(0, n);
  if (top.length) incrEmittedTotal();
  observeComputeMs(Date.now() - t0);
  return top;
}


