type Key = string;

const perKeyHits: Map<Key, number[]> = new Map();

function nowMs() { return Date.now(); }

export function allowAction(key: Key): boolean {
  if (process.env.TG_COOLDOWN_ENABLED !== 'true') return true;
  const windowMs = Math.max(0, Number(process.env.TG_COOLDOWN_MS ?? 1500));
  const burst = Math.max(1, Number(process.env.TG_COOLDOWN_BURST ?? 3));
  const t = nowMs();
  const arr = perKeyHits.get(key) || [];
  const kept = arr.filter(ts => t - ts < windowMs);
  if (kept.length >= burst) { perKeyHits.set(key, kept); return false; }
  kept.push(t);
  perKeyHits.set(key, kept);
  return true;
}


