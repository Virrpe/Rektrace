import { solClient } from './rpc.js';

export async function verifySolPayment(opts: { signature: string; to: string; minSol: number }): Promise<boolean> {
  const { signature, to, minSol } = opts;
  const rpc = solClient();
  const tx = await rpc.call('getTransaction', [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }], 'sol', `sol:tx:${signature}`);
  if (!tx || tx.meta?.err) return false;
  const instrs = tx.transaction?.message?.instructions || [];
  for (const i of instrs) {
    if (i.program === 'system' && i.parsed?.type === 'transfer') {
      const info = i.parsed.info;
      if (info?.destination === to) {
        const lamports = Number(info.lamports || 0);
        if (lamports >= minSol * 1e9) return true;
      }
    }
  }
  return false;
}

export async function verifySplPayment(opts: { signature: string; to: string; mint: string; minAmount: number; decimals?: number }): Promise<boolean> {
  const { signature, to, mint, minAmount, decimals = 6 } = opts;
  const rpc = solClient();
  const tx = await rpc.call('getTransaction', [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }], 'sol', `sol:tx:${signature}`);
  if (!tx || tx.meta?.err) return false;
  const tokenBalances = tx.meta?.postTokenBalances || [];
  for (const b of tokenBalances) {
    if (b.mint === mint && b.owner === to) {
      const ui = Number(b.uiTokenAmount?.uiAmountString || b.uiTokenAmount?.uiAmount || 0);
      if (ui >= minAmount) return true;
    }
  }
  const instrs = tx.transaction?.message?.instructions || [];
  for (const i of instrs) {
    if (i.program === 'spl-token' && i.parsed?.type === 'transfer') {
      const info = i.parsed.info;
      if (info?.mint === mint && (info?.destinationOwner === to || info?.destination === to)) {
        const amt = Number(info.amount) / Math.pow(10, decimals);
        if (amt >= minAmount) return true;
      }
    }
  }
  return false;
}
