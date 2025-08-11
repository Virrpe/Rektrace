import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/providers.js', async (orig) => {
  const mod = await orig();
  return {
    ...(mod as any),
    resolveContracts: vi.fn(async () => ({ ethereum: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' })),
    fetchHolders: vi.fn(async () => ({ holders: 200, source: 'covalent' })),
  };
});
vi.mock('../../src/providers_goplus.js', () => ({
  goplusTokenSecurity: vi.fn(async () => ({ is_honeypot: '0', is_mintable: '0', cannot_sell_all: '0', owner_change_balance: '0', buy_tax: '3', sell_tax: '3', holder_count: '3000', lp_holders: [] })),
}));
vi.mock('../../src/providers_rugcheck_solana.js', () => ({ rugcheckMint: vi.fn(async () => null) }));

// dynamic import inside test to respect env and mocks

describe('scan exact selection', () => {
  it('aggregates flags and scores for exact chain/address', async () => {
    vi.resetModules();
    process.env.DEMO_MODE = 'false';
    vi.doMock('undici', () => ({ request: vi.fn(async () => ({ body: { json: async () => ({}) } })) as any }));
    const { scanTokenExact } = await import('../src/scan.js');
    const res = await scanTokenExact('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', { chain: 'ethereum', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' });
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      const item = res.items[0];
      expect(item.score).toBeGreaterThan(0);
      // holders should come from mock, not demo path
      expect(item.holders).toBe(200);
      expect(item.sources.some(s => s.startsWith('holders:'))).toBe(true);
    }
  });
});


