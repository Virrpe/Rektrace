import { describe, it, expect } from 'vitest';
import { recordProviderSuccess, recordProviderFailure, getProviderMetrics } from '../../src/metrics.js';

describe('metrics rollups p50/p90/error%', () => {
  it('computes quantiles and error pct', () => {
    const xs = [10,20,30,40,50,60,70,80,90,100];
    for (const x of xs) recordProviderSuccess('testp', x);
    // add some failures
    recordProviderFailure('testp', 200, new Error('x'));
    const m = getProviderMetrics();
    const s = m['testp'];
    expect(s.p50).toBeGreaterThanOrEqual(50);
    expect(s.p90).toBeGreaterThanOrEqual(90);
    expect(typeof s.errorPct).toBe('number');
  });
});


