import { escapeMD } from '../../src/ui.js';
import { request } from 'undici';
import { scanTokenExact } from './scan.js';

export type GuardAdvice = {
  chain: string;
  tokenAddress: string;
  notionalInNative: number;
  estOut: number;
  slippagePct: number;
  minOut: number;
  risks: string[];
  links: { explorer: string; pair?: string };
  copyable: { token: string };
  symbol?: string;
};

export async function estimateSwapGuard(chain: string, tokenAddress: string, opts?: { notionalInNative?: number; slippagePct?: number }): Promise<GuardAdvice> {
  const DEMO = process.env.DEMO_MODE === 'true';
  const notionalInNative = opts?.notionalInNative ?? 0.2;
  const slippagePct = opts?.slippagePct ?? 2;
  let estOut = 123.45;
  let symbol = 'TOKEN';
  let pairUrl: string | undefined;
  const risks: string[] = [];

  if (!DEMO) {
    try {
      const res = await scanTokenExact(tokenAddress, { chain, address: tokenAddress });
      if (res.status === 'ok' && res.items.length) {
        const it = res.items[0];
        const pick = (it.flags||[]).filter(f=> /owner|mint|lp_unlock|fee/i.test(f)).slice(0,5);
        risks.push(...pick);
      }
    } catch {}
    try {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
      const r = await request(url);
      const j: any = await r.body.json();
      const pairs = (j.pairs || []) as any[];
      if (pairs.length) {
        const pick = pairs.sort((a,b)=> (b.liquidity?.usd||0) - (a.liquidity?.usd||0))[0];
        symbol = pick?.baseToken?.symbol || symbol;
        const priceNat = Number(pick?.priceNative || 0);
        if (priceNat > 0) estOut = +(notionalInNative / priceNat).toFixed(4);
        pairUrl = pick?.pairAddress ? `https://dexscreener.com/${(pick.chainId||'').toLowerCase()}/${pick.pairAddress}` : undefined;
      }
    } catch {}
  }
  const minOut = +((estOut) * (1 - slippagePct/100)).toFixed(4);
  const links = { explorer: explorerLink(chain, tokenAddress), pair: pairUrl };
  return { chain, tokenAddress, notionalInNative, estOut, slippagePct, minOut, risks, links, copyable: { token: tokenAddress }, symbol };
}

export function formatGuardAdviceMessage(a: GuardAdvice): string {
  const sym = a.symbol || 'TOKEN';
  const risks = (a.risks||[]).length ? a.risks.map(r=>`\`${escapeMD(r)}\``).join(', ') : 'none detected';
  const lines = [
    `🛡️ Guarded swap (${escapeMD(a.chain)})`,
    `• Amount: ${a.notionalInNative} ${a.chain.toUpperCase()} → ~${a.estOut} ${escapeMD(sym)}`,
    `• Min. received (${a.slippagePct}% guard): ${a.minOut} ${escapeMD(sym)}`,
    `• Risks: ${risks}`,
    `Links: [Explorer](${a.links.explorer})${a.links.pair?`, [Pair](${a.links.pair})`:''}`,
    `Note: We don’t route your trade. Use your preferred DEX, paste the token, set slippage ≥${a.slippagePct}%. Risk signals only.`
  ];
  return lines.join('\n');
}

function explorerLink(chain: string, addr: string): string {
  if (chain === 'ink') return `https://explorer.inkonchain.com/address/${encodeURIComponent(addr)}`;
  if (chain === 'ethereum') return `https://etherscan.io/token/${encodeURIComponent(addr)}`;
  return `https://explorer.${encodeURIComponent(chain)}.org/address/${encodeURIComponent(addr)}`;
}

