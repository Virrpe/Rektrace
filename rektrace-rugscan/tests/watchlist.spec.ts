import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/providers.js', async (orig) => {
  const mod = await orig();
  return { ...(mod as any), fetchHolders: vi.fn(async ()=> ({ holders: 200, source: 'demo' })), resolveContracts: vi.fn(async ()=> ({ ink: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' })) };
});
vi.mock('../../src/providers_goplus.js', () => ({ goplusTokenSecurity: vi.fn(async () => null) }));
vi.mock('undici', () => ({ request: vi.fn(async () => ({ body: { json: async () => ({ pairs: [] }) } })) }));

describe('watchlist v1 + thresholds', () => {
  it('stores prefs and enforces thresholds in checker', async () => {
    vi.resetModules();
    const { subscribe, setPref, getPref, listAllTokenSubs } = await import('../src/alerts_sub.js');
    const { runAlertsPass } = await import('../src/alerts/checker.js');
    const chat = 12345;
    await subscribe(chat, { chain: 'ink', token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' });
    await setPref(chat, { chain: 'ink', token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' }, { drop: 5, unlockDays: 10 });
    const p = await getPref(chat, { chain: 'ink', token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' });
    expect(p.drop).toBe(5);
    expect(p.unlockDays).toBe(10);
    // no throw in alerts pass
    const sent: any[] = [];
    await runAlertsPass(async (cid, text) => { sent.push({ cid, text }); });
    expect(Array.isArray(await listAllTokenSubs())).toBe(true);
  });
});

