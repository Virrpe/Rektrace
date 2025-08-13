import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlertThrottler } from '../src/alerts/throttler.js';

describe('Alert throttling', () => {
  let t: AlertThrottler;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.ALERT_THROTTLE_MIN = '1'; // 60s
    t = new AlertThrottler(() => Number(process.env.ALERT_THROTTLE_MIN) * 60_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('suppresses inside window and allows after window', async () => {
    const key = 'eth:0xdead';
    // First attempt → allowed
    expect(t.shouldNotify(key)).toBe(true);

    // Immediate second attempt → suppressed
    expect(t.shouldNotify(key)).toBe(false);

    // 59s later → still suppressed
    vi.advanceTimersByTime(59_000);
    expect(t.shouldNotify(key)).toBe(false);

    // 60s later → allowed again
    vi.advanceTimersByTime(1_000);
    expect(t.shouldNotify(key)).toBe(true);
  });
});


