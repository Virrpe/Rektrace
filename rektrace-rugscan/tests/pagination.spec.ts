import { describe, it, expect, vi } from 'vitest';
process.env.DEMO_MODE = 'true';
vi.mock('undici', () => ({ request: vi.fn(async () => ({ body: { json: async () => ({ pairs: [] }) } })) as any }));

vi.mock('../../src/providers.js', async (orig) => {
  const mod = await orig();
  return {
    ...(mod as any),
    resolveContracts: vi.fn(async () => {
      // Create 12 fake suggestions (across chains)
      const out: Record<string,string> = {};
      for (let i=0;i<12;i++) out[`chain-${i}`] = `0x${i.toString().padStart(40,'e')}`;
      return out;
    }),
    fetchHolders: vi.fn(async () => ({ holders: 100, source: 'demo' })),
  };
});

describe('ambiguity pagination logic', () => {
  it('returns ambiguous when multiple matches and supports slicing by page size 6', async () => {
    vi.resetModules();
    process.env.DEMO_MODE = 'false';
    const { scanToken } = await import('../src/scan.js');
    const res = await scanToken('pepe');
    expect(res.status).toBe('ambiguous');
    if (res.status === 'ambiguous') {
      expect(res.suggestions.length).toBe(6);
    }
  });
});


