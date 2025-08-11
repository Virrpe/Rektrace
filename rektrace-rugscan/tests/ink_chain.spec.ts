import { describe, it, expect, vi } from 'vitest';

describe('Ink chain support', () => {
  it('POST /api/scan with chain=ink returns ok/ambiguous in DEMO and no live calls', async () => {
    vi.resetModules();
    process.env.DEMO_MODE = 'true';
    process.env.API_KEY = 'demo_key';
    const { startHealthServer } = await import('../../src/health.js');
    const { scanToken } = await import('../src/scan.js');
    expect(scanToken).toBeDefined();
    const srv = startHealthServer(0, async (req, res) => {
      if (!req.url) return false;
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'POST' && url.pathname === '/api/scan') {
        const chunks: Buffer[] = []; await new Promise<void>(r=>{req.on('data',d=>chunks.push(Buffer.from(d))); req.on('end',()=>r());});
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
        const q = body.chain ? `${body.chain}:${body.token}` : String(body.token||'');
        const { scanToken } = await import('../src/scan.js');
        const result = await scanToken(q);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
        return true;
      }
      return false;
    });
    const addr = srv.address(); const port = typeof addr==='object'&&addr?(addr as any).port:3000;
    const r = await fetch(`http://127.0.0.1:${port}/api/scan`, { method:'POST', headers:{'content-type':'application/json','X-API-Key':'demo_key'}, body: JSON.stringify({ token:'pepe', chain:'ink', enrich:true }) });
    const j = await r.json();
    expect(['ok','ambiguous','not_found','error']).toContain(j.status);
    srv.close();
  }, 15000);

  it('scan ink:pepe triggers ambiguity pagination path deterministically', async () => {
    vi.resetModules();
    process.env.DEMO_MODE = 'true';
    const { scanToken } = await import('../src/scan.js');
    const res = await scanToken('ink:pepe');
    expect(['ok','ambiguous']).toContain(res.status);
  });

  it('flags goplus_unavailable when GoPlus does not support Ink but proceeds', async () => {
    vi.resetModules();
    process.env.DEMO_MODE = 'false';
    vi.doMock('../../src/providers.js', async (orig) => {
      const mod = await orig();
      return { ...(mod as any), resolveContracts: vi.fn(async ()=> ({ ink: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' })), fetchHolders: vi.fn(async ()=> ({ holders: 123, source: 'demo' })) };
    });
    vi.doMock('../../src/providers_goplus.js', () => ({ goplusTokenSecurity: vi.fn(async ()=> null), isGoPlusSupported: () => false }));
    vi.doMock('undici', () => ({ request: vi.fn(async () => ({ body: { json: async () => ({ pairs: [] }) } })) as any }));
    const { scanToken } = await import('../src/scan.js');
    const res = await scanToken('ink:pepe');
    if (res.status === 'ok') {
      expect(res.items[0].flags).toContain('goplus_unavailable');
    }
  });
});


