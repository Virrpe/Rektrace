import { request } from 'undici';
const RPC = process.env.EVM_RPC || process.env.ETH_RPC || 'https://eth.llamarpc.com';

export async function verifyErc20Payment(opts: { txHash: string; to: string; token: string; minAmount: number }): Promise<boolean> {
  const { txHash, to, token, minAmount } = opts;
  const body = (method: string, params: any[]) => ({ jsonrpc: '2.0', id: 1, method, params });
  const post = async (p: any) => (await (await fetch(RPC, { method: 'POST', body: JSON.stringify(p), headers: { 'content-type': 'application/json' } })).json());
  const rec = await post(body('eth_getTransactionReceipt', [txHash]));
  const receipt = rec.result;
  if (!receipt || receipt.status !== '0x1') return false;
  const logs: any[] = receipt.logs || [];
  const sig = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  for (const l of logs) {
    if ((l.address as string).toLowerCase() !== token.toLowerCase()) continue;
    if (!l.topics || l.topics[0] !== sig) continue;
    const toAddr = '0x' + l.topics[2].slice(26).toLowerCase();
    if (toAddr !== to.toLowerCase()) continue;
    const amount = BigInt(l.data);
    if (amount >= BigInt(Math.floor(minAmount * 1e6))) return true;
  }
  return false;
}
