import { describe, it, expect } from 'vitest';
import { vetConsensus } from '../src/vetting_consensus.js';
describe('vetting consensus (dry)', () => {
  it('rejects with no signals', async () => {
    const r = await vetConsensus({ url: 'https://verynewdomain.tld', chain: 'evm' });
    expect(['manual','rejected']).toContain(r.decision);
  });
});
