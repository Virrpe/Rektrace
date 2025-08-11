export class TokenBucket {
  private tokens: number;
  private lastRefill = Date.now();
  constructor(private ratePerSec: number, private capacity = ratePerSec) {
    this.tokens = capacity;
  }
  tryRemove(now = Date.now()): boolean {
    const delta = (now - this.lastRefill) / 1000;
    if (delta > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + delta * this.ratePerSec);
      this.lastRefill = now;
    }
    if (this.tokens >= 1) { this.tokens -= 1; return true; }
    return false;
  }
}

// HMR-safe singleton
const BUCKET_KEY = "__rektraceBucket__";
function makeBucket() {
  const qps = Number(process.env.GLOBAL_QPS ?? 8);
  return new TokenBucket(qps, qps);
}
export const globalBucket: TokenBucket =
  (globalThis as any)[BUCKET_KEY] ?? ((globalThis as any)[BUCKET_KEY] = makeBucket());

// Test helper to reset state between tests
export function resetGlobalBucketForTests() {
  try {
    (globalBucket as any).tokens = (globalBucket as any).capacity ?? Number(process.env.GLOBAL_QPS ?? 8);
    (globalBucket as any).lastRefill = Date.now();
  } catch {}
}


