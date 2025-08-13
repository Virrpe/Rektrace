import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/providers.js', async (orig) => {
  const mod = await orig();
  return {
    ...(mod as any),
    resolveContracts: vi.fn(async () => ({
      ethereum: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      solana: 'So11111111111111111111111111111111111111112',
    })),
    fetchHolders: vi.fn(async () => ({ holders: 100, source: 'demo' })),
  };
});
vi.mock('undici', () => ({ request: vi.fn(async () => ({ body: { json: async () => ({}) } })) as any }));

describe('scan ambiguity', () => {
  it('returns ambiguous when multiple chains match and no exact address', async () => {
    process.env.DEMO_MODE = 'false';
    const _vit = await import('vitest'); // no-op to satisfy await
    const { scanToken } = await import('../src/scan.js');
    const res = await scanToken('pepe');
    expect(res.status).toBe('ambiguous');
  });
});


