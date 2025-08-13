import { describe, it, expect } from 'vitest';
import { estimateSwapGuard, formatGuardAdviceMessage } from '../src/guard.js';

describe('swap guard (demo)', () => {
  it('produces deterministic advice and message', async () => {
    process.env.DEMO_MODE = 'true';
    const advice = await estimateSwapGuard('ink', '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    expect(advice.minOut).toBeGreaterThan(0);
    const msg = formatGuardAdviceMessage(advice);
    expect(msg).toContain('🛡️ Guarded swap');
    expect(msg).toContain('Explorer');
  });
});

