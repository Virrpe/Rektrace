import { describe, it, expect } from 'vitest';

describe('recent rugs tracker', () => {
  it('records and returns latest low scores', async () => {
    const { default: trackRecent, getRecent } = await import('../src/track_recent.js');
    trackRecent('ethereum', '0x1', 10);
    trackRecent('base', '0x2', 35);
    trackRecent('solana', 'So11111111111111111111111111111111111111112', 50);
    const items = getRecent();
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].address).toBe('So11111111111111111111111111111111111111112');
  });
});


