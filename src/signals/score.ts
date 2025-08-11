import { SignalScore, WindowAgg } from './schemas.js';

function zscore(x: number, mean: number, std: number): number {
  const s = Math.max(1e-6, std);
  return (x - mean) / s;
}

// Tiny running baselines (in-memory); optional TODO: export/hydrate
const baseline = {
  vol5m: { mean: 1000, std: 800 },
  price15m: { mean: 0, std: 5 },
  maker5m: { mean: 0, std: 0.4 },
};

export type PenaltyContext = {
  contractAgeDays?: number | null;
  blacklistProximity?: number | null; // [0..1], 1=near
  invariantWarnings?: number; // count
};

export function scoreFromWindows(win5: WindowAgg, win15: WindowAgg, p: PenaltyContext): SignalScore {
  const zVol5m = zscore(win5.volUsd, baseline.vol5m.mean, baseline.vol5m.std);
  const zPrice15m = zscore(win15.priceChangePct, baseline.price15m.mean, baseline.price15m.std);
  const zMaker5m = zscore(win5.makerDelta, baseline.maker5m.mean, baseline.maker5m.std);
  const parts = 1.5 * zVol5m + 1.0 * zPrice15m + 1.2 * zMaker5m;
  const penalties: { label: string; value: number }[] = [];
  if ((p.contractAgeDays ?? Infinity) < Number(process.env.SIGNAL_MIN_CONTRACT_AGE_DAYS ?? 3)) penalties.push({ label: 'contract_age', value: 1.5 });
  if ((p.blacklistProximity ?? 0) > 0.5) penalties.push({ label: 'blacklist_proximity', value: 1.0 });
  if ((p.invariantWarnings ?? 0) > 0) penalties.push({ label: 'invariants', value: Math.min(2, (p.invariantWarnings || 0) * 0.5) });
  const total = parts - penalties.reduce((a, b) => a + b.value, 0);
  return { zVol5m, zPrice15m, zMaker5m, penalties, total };
}


