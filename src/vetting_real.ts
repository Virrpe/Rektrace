import { goplusTokenSecurity } from './providers_goplus.js';
import { honeypotCheck } from './providers_honeypot.js';
import { rugcheckMint } from './providers_rugcheck_solana.js';

export type VetScore = { score: number; notes: string[] };

export async function vetEvmTokenFull(chain: string, address: string): Promise<VetScore> {
  const notes: string[] = []; let score = 0;
  const gp = await goplusTokenSecurity(chain, address);
  if (gp) {
    if (gp.is_honeypot === '0') score += 15; else if (gp.is_honeypot === '1') notes.push('goplus: honeypot');
    if (gp.is_mintable === '0') score += 10; else notes.push('mintable');
    if (gp.cannot_sell_all === '0') score += 10; else notes.push('cannot sell all');
    if (gp.owner_change_balance === '0') score += 10; else notes.push('owner can change balance');
    const tax = (Number(gp.buy_tax||0) + Number(gp.sell_tax||0));
    if (tax <= 20) score += 5; else notes.push(`high tax ${tax}%`);
    if (gp.holder_count && Number(gp.holder_count) > 2000) score += 5;
  } else notes.push('goplus: no data');

  const hp: any = await honeypotCheck(address, chain as any);
  if (hp) {
    if (hp.IsHoneypot === false) score += 15; else notes.push('honeypot: true');
    const buy = Number(hp.BuyTax) || 0, sell = Number(hp.SellTax)||0;
    if (buy <= 10 && sell <= 10) score += 5; else notes.push(`honeypot high tax b${buy}/s${sell}`);
  } else notes.push('honeypot: no data');

  if (score < 0) score = 0; if (score > 60) score = 60;
  return { score, notes };
}

export async function vetSolTokenFull(mint: string): Promise<VetScore> {
  const notes: string[] = []; let score = 0;
  const rc = await rugcheckMint(mint);
  if (rc) {
    if (rc.score != null) { score += Math.min(40, Math.max(0, rc.score * 0.4)); notes.push(`rugcheck score ${rc.score}`); }
    if (rc.isScam) notes.push('rugcheck: flagged scam'); else score += 10;
    const top1 = rc.topHolders?.[0]?.percent ?? 0;
    if (top1 < 35) score += 5; else notes.push(`top1 holder ${top1}%`);
  } else notes.push('rugcheck: no data');
  return { score, notes };
}
