import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerUserCap } from '../src/alerts/dm_cap.js';

describe('PerUserCap', () => {
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

  it('allows 3 sends in 10m, blocks the 4th, then resets', () => {
    const cap = new PerUserCap(3, 600_000);
    const id = 42;
    expect(cap.allow(id)).toBe(true);
    expect(cap.allow(id)).toBe(true);
    expect(cap.allow(id)).toBe(true);
    expect(cap.allow(id)).toBe(false);
    vi.advanceTimersByTime(600_000);
    expect(cap.allow(id)).toBe(true);
  });
});


