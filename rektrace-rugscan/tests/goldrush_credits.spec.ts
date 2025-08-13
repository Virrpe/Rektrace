import { describe, it, expect } from 'vitest';
import { estimateCredits, GOLD_WEIGHTS } from '../../src/goldrush_cost.js';
import { addGoldrushUsage, getGoldrushUsage } from '../../src/metrics.js';

describe('GoldRush credits estimator + metrics', () => {
  it('uses defaults and aggregates', () => {
    const a = estimateCredits('HOLDERS');
    const b = estimateCredits('DEPLOYER');
    expect(a).toBe(GOLD_WEIGHTS.HOLDERS);
    expect(b).toBe(GOLD_WEIGHTS.DEPLOYER);
    const before = getGoldrushUsage();
    addGoldrushUsage('HOLDERS', a);
    addGoldrushUsage('DEPLOYER', b);
    const after = getGoldrushUsage();
    expect(after.calls - before.calls).toBe(2);
    expect(after.estCredits - before.estCredits).toBe(a + b);
  });
});

