export type RecentApproval = { token: string; spender: string; allowance: string; tx?: string };

export async function getRecentApprovals(chain: string, wallet: string, limit = 5): Promise<RecentApproval[]> {
  const DEMO = process.env.DEMO_MODE === 'true';
  if (DEMO) {
    return [
      { token: '0xInkToken1', spender: '0xSpenderA', allowance: '∞', tx: '0xTxA' },
      { token: '0xInkToken2', spender: '0xSpenderB', allowance: '100000', tx: '0xTxB' },
      { token: '0xInkToken3', spender: '0xSpenderC', allowance: '2500', tx: '0xTxC' },
    ].slice(0, limit);
  }
  // Live: best-effort stub; no network in demo tests
  return [];
}

