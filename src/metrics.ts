type ProviderStat = {
  success: number;
  fail: number;
  lastLatencyMs: number;
  totalLatencyMs: number;
  count: number;
  lastError?: string;
  ring?: { lat: Float64Array; i: number; n: number };
};

const stats: Record<string, ProviderStat> = Object.create(null);

function ensure(provider: string): ProviderStat {
  if (!stats[provider]) {
    stats[provider] = { success: 0, fail: 0, lastLatencyMs: 0, totalLatencyMs: 0, count: 0 };
  }
  return stats[provider];
}

export function recordProviderSuccess(provider: string, latencyMs: number) {
  const s = ensure(provider);
  s.success += 1;
  s.count += 1;
  s.lastLatencyMs = Math.max(0, Math.round(latencyMs));
  s.totalLatencyMs += latencyMs;
  // ring buffer
  if (!s.ring) s.ring = { lat: new Float64Array(64), i: 0, n: 0 };
  s.ring.lat[s.ring.i] = latencyMs;
  s.ring.i = (s.ring.i + 1) & 63;
  s.ring.n = Math.min(s.ring.n + 1, 64);
}

export function recordProviderFailure(provider: string, latencyMs: number, error?: unknown) {
  const s = ensure(provider);
  s.fail += 1;
  s.count += 1;
  s.lastLatencyMs = Math.max(0, Math.round(latencyMs));
  s.totalLatencyMs += latencyMs;
  s.lastError = error instanceof Error ? error.message : String(error ?? 'error');
  if (!s.ring) s.ring = { lat: new Float64Array(64), i: 0, n: 0 };
  s.ring.lat[s.ring.i] = latencyMs;
  s.ring.i = (s.ring.i + 1) & 63;
  s.ring.n = Math.min(s.ring.n + 1, 64);
}

export function getProviderMetrics(): Record<string, { success: number; fail: number; lastLatencyMs: number; avgLatencyMs: number; lastError?: string; p50?: number|null; p90?: number|null; errorPct?: number }> {
  const out: Record<string, { success: number; fail: number; lastLatencyMs: number; avgLatencyMs: number; lastError?: string; p50?: number|null; p90?: number|null; errorPct?: number }> = {};
  for (const [k, v] of Object.entries(stats)) {
    const avg = v.count > 0 ? Math.round(v.totalLatencyMs / v.count) : 0;
    let p50: number|null = null, p90: number|null = null;
    if (v.ring && v.ring.n > 0) {
      const arr = new Array(v.ring.n);
      for (let k2=0;k2<v.ring.n;k2++) arr[k2] = v.ring.lat[(v.ring.i - v.ring.n + k2 + 64) & 63];
      arr.sort((a,b)=>a-b);
      const q = (p:number)=> arr.length? arr[Math.floor((p/100)*(arr.length-1))] : null;
      p50 = q(50); p90 = q(90);
    }
    const total = v.success + v.fail;
    const errorPct = total ? +(100 * v.fail / total).toFixed(2) : 0;
    out[k] = { success: v.success, fail: v.fail, lastLatencyMs: v.lastLatencyMs, avgLatencyMs: avg, lastError: v.lastError, p50, p90, errorPct };
  }
  return out;
}

// --- GoldRush usage (credits + calls)
const goldrushUsage = { calls: 0, estCredits: 0 };
export function addGoldrushUsage(_op: string, estCredits: number) {
  goldrushUsage.calls += 1;
  goldrushUsage.estCredits += Math.max(0, Math.round(estCredits));
}
export function getGoldrushUsage() {
  return { ...goldrushUsage };
}


// --- Bot (Telegram) minimal counters (in-memory only)
export const botMetrics = {
  bot_requests_total: 0,
  snipers_requests_total: 0,
  snipers_insufficient_total: 0,
  sniper_profile_requests_total: 0,
};

export function getBotMetrics() {
  // return a shallow snapshot; do not reset
  return { ...botMetrics };
}

