import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { putCb, getCb } from '../src/cbmap.js';

describe('callback map', () => {
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

  it('stores and expires payloads', async () => {
    const key = await putCb('full|eth|0xabc');
    const v1 = await getCb(key);
    expect(v1).toBe('full|eth|0xabc');
    vi.advanceTimersByTime(601_000); // > TTL 600s
    const v2 = await getCb(key);
    expect(v2).toBeNull();
  });
});


