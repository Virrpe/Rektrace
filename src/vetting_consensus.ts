import { vetEvmTokenFull, vetSolTokenFull } from './vetting_real.js';
import { isMatureDomain } from './whois.js';

export type ConsensusResult = { score: number; notes: string[]; decision: 'approved'|'manual'|'rejected' };

export async function vetConsensus(opts: { url: string; chain: 'evm'|'sol'; token?: string }): Promise<ConsensusResult> {
  const notes: string[] = [];
  let pScores = 0;

  const dom = await isMatureDomain(opts.url);
  if (dom.ok) { pScores += 10; notes.push(`domain age ${dom.days}d`); } else notes.push(`domain young/unknown`);

  if (opts.token) {
    if (opts.chain === 'sol') {
      const s = await vetSolTokenFull(opts.token);
      pScores += Math.min(40, s.score);
      notes.push(...s.notes.map(n=>'sol:'+n));
    } else {
      const e = await vetEvmTokenFull('ethereum', opts.token);
      pScores += Math.min(60, e.score);
      notes.push(...e.notes.map(n=>'evm:'+n));
    }
  } else {
    notes.push('no token provided');
  }

  const score = Math.max(0, Math.min(100, pScores));
  const has2Signals = (dom.ok ? 1 : 0) + (opts.token ? 1 : 0) >= 2;
  const decision: 'approved'|'manual'|'rejected' = score >= 70 && has2Signals ? 'approved' : score >= 50 ? 'manual' : 'rejected';
  return { score, notes, decision };
}
