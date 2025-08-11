import { describe, it, expect, vi } from 'vitest';

let calls = 0;
vi.mock('../../src/providers.js', async (orig) => {
  const mod = await orig();
  return {
    ...(mod as any),
    resolveContracts: vi.fn(async () => ({ ethereum: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' })),
    fetchHolders: vi.fn(async () => { calls++; return { holders: 111, source: 'covalent' }; }),
  };
});
vi.mock('../../src/providers_goplus.js', () => ({ goplusTokenSecurity: vi.fn(async () => ({})) }));

// dynamic import to ensure fresh module with env and mocks

describe('scan caching and bust', () => {
  it('uses cache then invalidates after version bump', async () => {
    vi.resetModules();
    process.env.DEMO_MODE = 'false';
    const { scanTokenExact, bumpScanCacheVersion } = await import('../src/scan.js');
    calls = 0;
    await scanTokenExact('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', { chain: 'ethereum', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' });
    await scanTokenExact('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', { chain: 'ethereum', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' });
    expect(calls).toBe(1);
    await bumpScanCacheVersion();
    await scanTokenExact('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', { chain: 'ethereum', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' });
    expect(calls).toBe(2);
  });
});


