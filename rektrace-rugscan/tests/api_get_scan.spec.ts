import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/providers.js', async (orig) => {
  const mod = await orig();
  return {
    ...(mod as any),
    resolveContracts: vi.fn(async () => ({ ethereum: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' })),
    fetchHolders: vi.fn(async () => ({ holders: 200, source: 'demo' })),
  };
});
vi.mock('../../src/providers_goplus.js', () => ({ goplusTokenSecurity: vi.fn(async () => ({ is_honeypot: '0', is_mintable: '0', cannot_sell_all: '0', owner_change_balance: '0', buy_tax: '3', sell_tax: '3', holder_count: '3000', lp_holders: [] })) }));

describe('GET /api/scan/:chain/:token', () => {
  it('returns JSON scan result (ok or ambiguous)', async () => {
    vi.resetModules();
    process.env.DEMO_MODE = 'false';
    vi.doMock('undici', () => ({ request: vi.fn(async () => ({ body: { json: async () => ({}) } })) as any }));
    const { startHealthServer } = await import('../../src/health.js');
    const { scanTokenExact } = await import('../src/scan.js');
    expect(scanTokenExact).toBeDefined();
    const srv = startHealthServer(0, async (req, res) => {
      if (!req.url) return false;
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname.startsWith('/api/scan/')) {
        const parts = url.pathname.split('/').filter(Boolean);
        const chain = parts[2];
        const token = parts.slice(3).join('/');
        const { scanTokenExact } = await import('../src/scan.js');
        const result = await scanTokenExact(token, { chain, address: token });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
        return true;
      }
      return false;
    });
    const addr = srv.address();
    const port = typeof addr === 'object' && addr ? (addr as any).port : 3000;
    const res = await fetch(`http://127.0.0.1:${port}/api/scan/ethereum/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`);
    const j = await res.json();
    expect(j.status === 'ok' || j.status === 'ambiguous').toBe(true);
    srv.close();
  }, 15000);
});


