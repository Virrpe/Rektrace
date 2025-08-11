import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetDmCapForTests } from '../src/alerts/dm_cap.js';
import { subscribe } from '../src/alerts_sub.js';
import { runAlertsPass } from '../src/alerts/checker.js';

describe('alert subscriptions and checker', () => {
  beforeEach(() => { vi.useFakeTimers(); process.env.DEMO_MODE = 'true'; process.env.ALERT_THROTTLE_MIN = '1'; });
  afterEach(() => { vi.useRealTimers(); resetDmCapForTests(); });

  it('notifies on score drop with throttling', async () => {
    // Subscribe
    await subscribe(42, { chain: 'ethereum', token: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' });
    const send = vi.fn(async()=>{});
    // First pass baseline (demo) — sets lastScore
    await runAlertsPass(send);
    expect(send).toHaveBeenCalledTimes(0);
    // Simulate drop by switching off demo and mocking scan to lower score
    process.env.DEMO_MODE = 'false';
    vi.resetModules();
    // Mock scanTokenExact to return low score and lp flag
    vi.doMock('../src/scan.js', async (orig:any) => {
      const mod = await orig();
      return {
        ...mod,
        scanTokenExact: vi.fn(async () => ({ status: 'ok', query: '', items: [{ chain: 'ethereum', address: '0xdead', holders: 100, flags: [], score: 10, sources: [] }] }))
      };
    });
    const { runAlertsPass: runPass } = await import('../src/alerts/checker.js');
    await runPass(send);
    expect(send).toHaveBeenCalledTimes(1);
    // Within throttle window suppressed
    await runPass(send);
    expect(send).toHaveBeenCalledTimes(1);
    // Advance time beyond 60s and allow again
    vi.advanceTimersByTime(60_000);
    await runPass(send);
    expect(send).toHaveBeenCalledTimes(2);
  });
});


