import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/metrics.js', async (orig) => {
  const mod = await orig();
  return {
    ...(mod as any),
    getProviderMetrics: vi.fn(() => ({ coingecko: { success: 1, fail: 0, lastLatencyMs: 10, avgLatencyMs: 10 } })),
  };
});

describe('metrics exposure', () => {
  it('health /metrics payload includes providers section', async () => {
    vi.resetModules();
    const { startHealthServer } = await import('../../src/health.js');
    const srv = startHealthServer(0);
    const address = srv.address();
    const port = typeof address === 'object' && address ? (address as any).port : 3000;
    const res = await fetch(`http://127.0.0.1:${port}/metrics`);
    const j = await res.json();
    expect(j.providers).toBeDefined();
    srv.close();
  });
});


