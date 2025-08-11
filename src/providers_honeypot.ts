import { request as req } from 'undici';
export async function honeypotCheck(address: string, chain: 'ethereum'|'binance-smart-chain'|'arbitrum-one'|'optimistic-ethereum'|'polygon-pos') {
  const chainId = chain === 'ethereum' ? 1 : chain === 'binance-smart-chain' ? 56 : chain === 'polygon-pos' ? 137 : chain === 'arbitrum-one' ? 42161 : 10;
  const url = `https://api.honeypot.is/v2/IsHoneypot?address=${address}&chainID=${chainId}`;
  try { const r = await req(url); return await r.body.json(); } catch { return null; }
}
