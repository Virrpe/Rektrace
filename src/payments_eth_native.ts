import { evmClient } from './rpc.js';

export async function verifyEthNative(opts: { txHash: string; to: string; minEth: number }): Promise<boolean> {
  const { txHash, to, minEth } = opts;
  const rpc = evmClient();
  const receipt = await rpc.call('eth_getTransactionReceipt', [txHash], 'evm', `evm:rcpt:${txHash}`);
  if (!receipt || receipt.status !== '0x1') return false;
  const tx = await rpc.call('eth_getTransactionByHash', [txHash], 'evm', `evm:tx:${txHash}`);
  if (!tx) return false;
  const toAddr = (tx.to || '').toLowerCase();
  if (toAddr !== to.toLowerCase()) return false;
  const valWei = BigInt(tx.value);
  return valWei >= BigInt(Math.floor(minEth * 1e18));
}
