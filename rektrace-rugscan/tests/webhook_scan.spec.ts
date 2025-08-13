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

describe('webhook /api/scan', () => {
  it('returns JSON scan result', async () => {
    vi.resetModules();
    process.env.DEMO_MODE = 'false';
    // avoid network calls in this test
    vi.doMock('undici', () => ({ request: vi.fn(async () => ({ body: { json: async () => ({}) } })) as any }));
    const { startHealthServer } = await import('../../src/health.js');
    const { scanToken } = await import('../src/scan.js');
    expect(scanToken).toBeDefined();
    const srv = startHealthServer(0, async (req, res) => {
      if (req.method === 'POST' && req.url?.startsWith('/api/scan')) {
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve) => { req.on('data', d => chunks.push(Buffer.from(d))); req.on('end', ()=> resolve()); });
        const body = Buffer.concat(chunks).toString('utf8') || '{}';
        const json = JSON.parse(body);
        const token = String(json.token || '').trim();
        const result = await scanToken(token);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
        return true;
      }
      return false;
    });
    const addr = srv.address();
    const port = typeof addr === 'object' && addr ? (addr as any).port : 3000;
    const res = await fetch(`http://127.0.0.1:${port}/api/scan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'pepe' }) });
    const j = await res.json();
    expect(j.status === 'ok' || j.status === 'ambiguous').toBe(true);
    srv.close();
  }, 15000);
});


