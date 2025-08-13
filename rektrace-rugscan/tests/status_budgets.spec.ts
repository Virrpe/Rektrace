import { describe, it, expect, vi } from 'vitest';

describe('status budgets surface', () => {
  it('includes provider budgets and ttls', async () => {
    vi.resetModules();
    process.env.PROVIDER_TIMEOUT_MS = '2600';
    process.env.PROVIDER_RETRY = '2';
    process.env.SCAN_TTL_SECONDS = '180';
    process.env.LP_TTL_SECONDS = '900';
    const { buildStatusBody } = await import('../src/status_util.js');
    const body = buildStatusBody();
    expect(body).toContain('timeouts: 2600ms');
    expect(body).toContain('retries: 2');
    expect(body).toContain('scan_ttl: 180s');
    expect(body).toContain('lp_ttl: 900s');
  });
});


