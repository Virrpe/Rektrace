import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/providers.js', async (orig) => {
  const mod = await orig();
  return {
    ...(mod as any),
    resolveContracts: vi.fn(async () => ({
      ethereum: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      'binance-smart-chain': '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    })),
    fetchHolders: vi.fn(async () => ({ holders: 100, source: 'demo' })),
  };
});
vi.mock('undici', () => ({ request: vi.fn(async () => ({ body: { json: async () => ({}) } })) as any }));

// dynamic import to respect env and mocks

describe('chain prefix parsing', () => {
  it('filters to requested chain via prefix', async () => {
    vi.resetModules();
    process.env.DEMO_MODE = 'false';
    const { scanToken } = await import('../src/scan.js');
    const res = await scanToken('bsc:pepe');
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      // Because scanTokenExact returns single item for exact chain
      expect(res.items.length).toBe(1);
      expect(res.items[0].chain).toBe('binance-smart-chain');
    }
  });
});


