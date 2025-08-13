import { createSnipersHandler, createSniperHandler } from '../rektrace-rugscan/src/commands.js';

function ctxStub(text: string) {
  const outputs: string[] = [];
  return {
    match: text.split(' ').slice(1).join(' '),
    reply: async (s: string) => { outputs.push(s); },
    _out: outputs,
  } as any;
}

describe('commands snipers/sniper (glue)', () => {
  test('/snipers ok flow renders metrics', async () => {
    const handler = createSnipersHandler({
      scanToken: async () => ({ status: 'ok', items: [{ chain: 'ink', address: '0xabc' }] }),
      fetchEarlyWindow: async () => ({ dataStatus: 'ok', windowMs: 2000, trades: [{ buyer: 'a', ts: Date.now() }] }),
      scoreEarlyWindow: () => ({ summary: { level: 'medium', uniqueBuyers: 1, top1Pct: 100, top3Pct: 100 } }) as any,
      rlAllow: () => true,
    });
    const ctx = ctxStub('/snipers ink:token');
    await handler(ctx);
    expect(ctx._out.join('\n')).toMatch(/Early Sniper Check/);
    expect(ctx._out.join('\n')).toMatch(/Unique buyers/);
  });

  test('/snipers insufficient renders deterministic message', async () => {
    const handler = createSnipersHandler({
      scanToken: async () => ({ status: 'ok', items: [{ chain: 'ink', address: '0xabc' }] }),
      fetchEarlyWindow: async () => ({ dataStatus: 'insufficient', windowMs: 2000 }),
      scoreEarlyWindow: () => ({ summary: { level: 'unknown', uniqueBuyers: 0, top1Pct: 0, top3Pct: 0 } }) as any,
      rlAllow: () => true,
    });
    const ctx = ctxStub('/snipers ink:token');
    await handler(ctx);
    expect(ctx._out.join('\n')).toMatch(/Data: insufficient/);
  });

  test('/sniper profile renders or shows empty message', async () => {
    const ok = createSniperHandler({
      getSniperProfile: async () => ({ snipes30d: 2, recentTokens: [{ token: '0x1' }], firstSeen: Date.now()-1000, lastSeen: Date.now() }),
      rlAllow: () => true,
    });
    const ctx1 = ctxStub('/sniper 0xaddr');
    await ok(ctx1);
    expect(ctx1._out.join('\n')).toMatch(/Sniper Profile/);

    const none = createSniperHandler({ getSniperProfile: async () => undefined, rlAllow: () => true });
    const ctx2 = ctxStub('/sniper 0xaddr');
    await none(ctx2);
    expect(ctx2._out.join('\n')).toMatch(/No sniper activity recorded yet/);
  });

  test('RL wrapper prevents execution when not allowed', async () => {
    const handler = createSnipersHandler({
      scanToken: async () => ({ status: 'ok', items: [{ chain: 'ink', address: '0xabc' }] }),
      fetchEarlyWindow: async () => ({ dataStatus: 'ok', windowMs: 2000, trades: [{ buyer: 'a', ts: Date.now() }] }),
      scoreEarlyWindow: () => ({ summary: { level: 'low', uniqueBuyers: 1, top1Pct: 100, top3Pct: 100 } }) as any,
      rlAllow: () => false,
    });
    const ctx = ctxStub('/snipers ink:token');
    await handler(ctx);
    expect(ctx._out.length).toBe(0);
  });
});


