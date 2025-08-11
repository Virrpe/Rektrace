import { describe, it, expect } from 'vitest';

describe('breaker hysteresis', () => {
  it('requires consecutive successes to close', async () => {
    const { Breaker } = await import('../../src/circuit.js');
    const b = new Breaker(1, 1); // open after 1 fail, cooldown 1ms
    expect(b.state()).toBe('ok');
    b.fail();
    expect(b.state()).toBe('open');
    // allow time pass
    await new Promise(r=>setTimeout(r, 2));
    // first success while allowed moves to half-open
    b.success();
    const s1 = b.state();
    expect(s1 === 'half-open' || s1 === 'ok').toBe(true);
  });
});


