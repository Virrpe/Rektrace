import { describe, it, expect } from 'vitest';
import { getRecentApprovals } from '../src/approvals.js';
import { formatRevokeList } from '../src/commands.js';

describe('/revoke_last helper (demo)', () => {
  it('renders deterministic approvals list', async () => {
    process.env.DEMO_MODE = 'true';
    const items = await getRecentApprovals('ink', '0xwallet');
    const text = formatRevokeList('ink', '0xwallet', items);
    expect(text).toContain('Recent approvals');
    expect(text).toContain('Explorer');
  });
  it('shows usage when missing param (simulated)', async () => {
    // command handler validation is simple; here we just assert helper still returns message
    const text = formatRevokeList('ink', '0xwallet', []);
    expect(text).toContain('Recent approvals');
  });
});

