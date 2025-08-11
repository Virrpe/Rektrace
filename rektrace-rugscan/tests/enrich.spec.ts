import { describe, it, expect } from 'vitest';

describe('enrichment cache demo', () => {
  it('returns demo enrichment in DEMO_MODE', async () => {
    process.env.DEMO_MODE = 'true';
    const { enrichToken } = await import('../src/enrich.js');
    const e = await enrichToken('ethereum', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(e).toBeDefined();
    expect(e.price).toBeDefined();
  });
});


