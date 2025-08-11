import { describe, it, expect } from 'vitest';
import { computeHoldersConsensus } from '../src/scan.js';

describe('holders fallback consensus', () => {
  it('high confidence within ±10%', () => {
    expect(computeHoldersConsensus(1000, 1099)).toEqual({ confidence: 'high', flags: [] });
    expect(computeHoldersConsensus(1000, 901)).toEqual({ confidence: 'high', flags: [] });
  });
  it('divergent otherwise', () => {
    expect(computeHoldersConsensus(1000, 800)).toEqual({ confidence: 'medium', flags: ['holders_consensus:divergent'] });
  });
  it('medium when missing', () => {
    expect(computeHoldersConsensus(null as any, 1000).confidence).toBe('medium');
  });
});


