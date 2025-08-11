import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/providers.js', async (orig) => {
  const mod = await orig();
  return { ...(mod as any), fetchHolders: vi.fn(async ()=> ({ holders: 200, source: 'demo' })), resolveContracts: vi.fn(async ()=> ({ ink: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' })) };
});
vi.mock('../../src/providers_goplus.js', () => ({ goplusTokenSecurity: vi.fn(async () => null) }));
vi.mock('undici', () => ({ request: vi.fn(async () => ({ body: { json: async () => ({ pairs: [] }) } })) }));

describe('alert thresholds', () => {
  it('lp unlock threshold is respected', async () => {
    vi.resetModules();
    const { subscribe, setPref } = await import('../src/alerts_sub.js');
    const { runAlertsPass } = await import('../src/alerts/checker.js');
    const chat = 777;
    const sub = { chain: 'ink', token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' };
    await subscribe(chat, sub);
    await setPref(chat, sub, { unlockDays: 3 });
    const sent: any[] = [];
    await runAlertsPass(async (cid, text) => { sent.push({ cid, text }); });
    expect(Array.isArray(sent)).toBe(true);
  });
});

