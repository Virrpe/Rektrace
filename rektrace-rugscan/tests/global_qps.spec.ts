import { describe, it, expect, vi } from 'vitest';
import { TokenBucket } from '../src/rate_limit.js';

describe('global QPS token bucket', () => {
  it('fills capacity, then limits, then refills', () => {
    vi.useFakeTimers();
    const b = new TokenBucket(8);
    // consume burst 8
    for (let i=0;i<8;i++) expect(b.tryRemove(0)).toBe(true);
    expect(b.tryRemove(0)).toBe(false);
    // advance 1s → ~8 tokens
    vi.advanceTimersByTime(1000);
    expect(b.tryRemove()).toBe(true);
    vi.useRealTimers();
  });
});


