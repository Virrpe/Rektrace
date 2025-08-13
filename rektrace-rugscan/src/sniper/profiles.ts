export type SniperProfile = {
  address: string;
  snipes30d: number;
  recentTokens: Array<{ token: string; ts: number }>;
  firstSeen?: number;
  lastSeen?: number;
};

const HORIZON_MS = 30 * 24 * 3600 * 1000;
const CAP_RECENT = 10;

const store = new Map<string, SniperProfile>();

function prune(p: SniperProfile): SniperProfile {
  const now = Date.now();
  const rec = p.recentTokens.filter(x => now - x.ts <= HORIZON_MS).slice(-CAP_RECENT);
  const snipes = rec.length;
  return { ...p, recentTokens: rec, snipes30d: snipes };
}

export async function recordSniperEvent(addr: string, token: string, ts: number): Promise<void> {
  const a = addr.toLowerCase();
  const now = ts || Date.now();
  const prev = store.get(a) || { address: a, snipes30d: 0, recentTokens: [] } as SniperProfile;
  const next: SniperProfile = {
    ...prev,
    recentTokens: [...prev.recentTokens, { token, ts: now }].slice(-CAP_RECENT),
    firstSeen: prev.firstSeen ?? now,
    lastSeen: now,
  };
  store.set(a, prune(next));
}

export async function getSniperProfile(addr: string): Promise<SniperProfile | undefined> {
  const a = addr.toLowerCase();
  const p = store.get(a);
  if (!p) return undefined;
  const pr = prune(p);
  store.set(a, pr);
  return pr;
}


