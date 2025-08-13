type Ring = { lat: Float64Array; i: number; n: number };

const r: Ring = { lat: new Float64Array(256), i: 0, n: 0 };
let errors1m: number[] = []; // timestamps
let breakerHits1m: number[] = [];

export function recordLatency(ms: number) {
  r.lat[r.i] = ms;
  r.i = (r.i + 1) & 255;
  r.n = Math.min(r.n + 1, 256);
}

export function recordError() {
  const now = Date.now();
  errors1m.push(now);
  errors1m = errors1m.filter(ts => now - ts < 60_000);
}

export function recordBreakerHit() {
  const now = Date.now();
  breakerHits1m.push(now);
  breakerHits1m = breakerHits1m.filter(ts => now - ts < 60_000);
}

export function snapshotSLO() {
  // compute p95 from ring
  const n = r.n;
  let p95: number | null = null;
  if (n > 0) {
    const arr = new Array(n);
    for (let k=0;k<n;k++) arr[k] = r.lat[(r.i - n + k + 256) & 255];
    arr.sort((a,b)=>a-b);
    p95 = arr[Math.floor(0.95 * (arr.length-1))];
  }
  const now = Date.now();
  errors1m = errors1m.filter(ts => now - ts < 60_000);
  breakerHits1m = breakerHits1m.filter(ts => now - ts < 60_000);
  const error_rate_1m = errors1m.length; // raw count over last minute
  const breaker_hits_1m = breakerHits1m.length;
  return { p95_ms: p95 ?? 0, error_rate_1m, breaker_hits_1m };
}

// Per-route lightweight metrics
type RouteKey = '/status'|'/_metrics'|'/api/scan:POST'|'/api/scan:GET';
type RouteRing = { lat: Float64Array; i: number; n: number; errTs: number[] };
const routes: Record<string, RouteRing> = Object.create(null);

function ensureRoute(k: string): RouteRing {
  if (!routes[k]) routes[k] = { lat: new Float64Array(128), i: 0, n: 0, errTs: [] };
  return routes[k];
}

export function recordRoute(k: RouteKey, ms: number, isError: boolean) {
  const r = ensureRoute(k);
  r.lat[r.i] = ms;
  r.i = (r.i + 1) & 127;
  r.n = Math.min(r.n + 1, 128);
  if (isError) { const now = Date.now(); r.errTs.push(now); r.errTs = r.errTs.filter(ts => now - ts < 60_000); }
}

export function snapshotRoutes() {
  const out: Record<string, { p50: number; p95: number; err1m: number }> = {};
  for (const [k, v] of Object.entries(routes)) {
    let p50 = 0, p95 = 0;
    if (v.n > 0) {
      const arr = new Array(v.n);
      for (let i=0;i<v.n;i++) arr[i] = v.lat[(v.i - v.n + i + 128) & 127];
      arr.sort((a,b)=>a-b);
      p50 = arr[Math.floor(0.50 * (arr.length-1))] ?? 0;
      p95 = arr[Math.floor(0.95 * (arr.length-1))] ?? 0;
    }
    out[k] = { p50, p95, err1m: v.errTs.length };
  }
  return out;
}


