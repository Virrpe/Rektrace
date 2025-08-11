import { request as rq } from 'undici';
import { recordProviderFailure, recordProviderSuccess } from './metrics.js';
import { breakers } from './providers.js';

const IS_TEST = !!process.env.VITEST_WORKER_ID || process.env.NODE_ENV === 'test';
const PROVIDER_TIMEOUT_MS = IS_TEST ? 50 : Number(process.env.PROVIDER_TIMEOUT_MS ?? 2500);
const PROVIDER_RETRY = Math.max(0, Number(process.env.PROVIDER_RETRY ?? (IS_TEST ? 0 : 1)));
export type RugResult = { score?: number; isScam?: boolean; topHolders?: Array<{ owner: string; percent: number }> };
export async function rugcheckMint(mint: string): Promise<RugResult | null> {
  const t0 = Date.now();
  try {
    if (!breakers.rugcheck.allow()) return null;
    let r: any;
    for (let attempt = 0; attempt <= PROVIDER_RETRY; attempt++) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
      try {
        r = await rq(`https://api.rugcheck.xyz/v1/tokens/${mint}`, { signal: controller.signal } as any);
        break;
      } catch (e) {
        if (attempt === PROVIDER_RETRY) throw e;
      } finally { clearTimeout(id); }
    }
    const j = await r.body.json();
    breakers.rugcheck.success();
    recordProviderSuccess('rugcheck', Date.now() - t0);
    return { score: j.score, isScam: j.is_scam, topHolders: (j.top_holders||[]).map((h:any)=>({ owner: h.owner, percent: Number(h.percent) })) };
  } catch (e) { recordProviderFailure('rugcheck', Date.now() - t0, e); return null; }
}
