import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/providers.js', async (orig) => {
  const mod = await orig();
  return {
    ...(mod as any),
    resolveContracts: vi.fn(async () => ({ ethereum: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' })),
    fetchHolders: vi.fn(async () => ({ holders: 123, source: 'demo' })),
  };
});
vi.mock('../../src/providers_goplus.js', () => ({ goplusTokenSecurity: vi.fn(async () => ({ is_honeypot: '0', is_mintable: '0', cannot_sell_all: '0', owner_change_balance: '0', buy_tax: '0', sell_tax: '0', holder_count: '3000', lp_holders: [] })) }));

// Mock DexScreener with lock info and soon unlock
vi.mock('undici', () => ({
  request: vi.fn(async () => ({ body: { json: async () => ({ pairs: [ { chainId: 'eth', liquidity: { usd: 125000, lockers: [ { percent: 65, unlockAt: Math.floor((Date.now()+5*24*3600*1000)/1000) } ] }, pairAddress: '0xpair', baseToken: { symbol: 'TOKEN' }, quoteToken: { symbol: 'WETH' } } ] }) } })) as any,
}));

describe('LP lock heuristics', () => {
  it('flags lock percent and <7d unlock', async () => {
    vi.resetModules();
    process.env.DEMO_MODE = 'false';
    process.env.ENABLE_LIQ_TEST = 'true';
    const { scanTokenExact } = await import('../src/scan.js');
    const res = await scanTokenExact('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', { chain: 'ethereum', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' });
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      const flags = res.items[0].flags.join(' | ');
      expect(flags).toMatch(/lp_locked_65%/);
      expect(flags).toMatch(/lp_unlock_<7d/);
    }
  });
});


