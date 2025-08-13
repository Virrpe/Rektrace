import { describe, it, expect, vi } from 'vitest';

// Mock providers to short-circuit to EVM path and control liquidity
vi.mock('../../src/providers.js', async (orig) => {
  const mod = await orig();
  return {
    ...(mod as any),
    resolveContracts: vi.fn(async () => ({ ethereum: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' })),
    fetchHolders: vi.fn(async () => ({ holders: 123, source: 'demo' })),
  };
});
vi.mock('../../src/providers_goplus.js', () => ({ goplusTokenSecurity: vi.fn(async () => ({ is_honeypot: '0', is_mintable: '0', cannot_sell_all: '0', owner_change_balance: '0', buy_tax: '0', sell_tax: '0', holder_count: '3000', lp_holders: [] })) }));

// Mock undici request used by liquidity fetcher inside scan.ts
vi.mock('undici', () => ({
  request: vi.fn(async () => ({ body: { json: async () => ({ pairs: [ { chainId: 'eth', liquidity: { usd: 125000 }, pairAddress: '0xpair', baseToken: { symbol: 'TOKEN' }, quoteToken: { symbol: 'WETH' } } ] }) } })) as any,
}));

describe('liquidity scoring', () => {
  it('adds score and flags from DexScreener liquidity', async () => {
    vi.resetModules();
    process.env.DEMO_MODE = 'false';
    process.env.ENABLE_LIQ_TEST = 'true';
    const { scanToken } = await import('../src/scan.js');
    const res = await scanToken('pepe');
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      const item = res.items[0];
      expect(item.sources.includes('dexscreener')).toBe(true);
      expect(item.flags.some(f => f.includes('liquidity') || f.includes('LP'))).toBe(true);
    }
  });
});


