import { request } from 'undici';
import { recordProviderFailure, recordProviderSuccess } from './metrics.js';
import { breakers } from './providers.js';

const IS_TEST = !!process.env.VITEST_WORKER_ID || process.env.NODE_ENV === 'test';
const PROVIDER_TIMEOUT_MS = IS_TEST ? 50 : Number(process.env.PROVIDER_TIMEOUT_MS ?? 2500);
const PROVIDER_RETRY = Math.max(0, Number(process.env.PROVIDER_RETRY ?? (IS_TEST ? 0 : 1)));
const GOPLUS_KEY = process.env.GOPLUS_API_KEY || '';

const GOPLUS_CHAIN: Record<string, string> = {
  'ethereum': '1','binance-smart-chain':'56','polygon-pos':'137','arbitrum-one':'42161','optimistic-ethereum':'10','avalanche':'43114','fantom':'250'
};

export type GoPlusTokenSec = {
  is_honeypot?: string; owner_change_balance?: string; can_take_back_ownership?: string; is_mintable?: string;
  lp_holders?: Array<{ address: string; percent: string }>; holder_count?: string; cannot_sell_all?: string;
  slippage_modifiable?: string; buy_tax?: string; sell_tax?: string; selfdestruct?: string;
};

export async function goplusTokenSecurity(chain: string, address: string): Promise<GoPlusTokenSec | null> {
  const cid = GOPLUS_CHAIN[chain]; if (!cid) return null;
  const url = `https://api.gopluslabs.io/api/v1/token_security/${cid}?contract_addresses=${address}`;
  const t0 = Date.now();
  try {
    if (!breakers.goplus.allow()) return null;
    let res: any;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= PROVIDER_RETRY; attempt++) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
      try {
        res = await request(url, { headers: GOPLUS_KEY ? { 'API-KEY': GOPLUS_KEY } : undefined, signal: controller.signal });
        break;
      } catch (e) {
        lastErr = e;
        if (attempt === PROVIDER_RETRY) throw e;
      } finally { clearTimeout(id); }
    }
    const j: any = await res.body.json();
    const data = j.result?.[address.toLowerCase()];
    breakers.goplus.success();
    recordProviderSuccess('goplus', Date.now() - t0);
    return data ?? null;
  } catch (e) {
    breakers.goplus.fail();
    recordProviderFailure('goplus', Date.now() - t0, e);
    return null;
  }
}

export function isGoPlusSupported(chain: string): boolean {
  return !!GOPLUS_CHAIN[chain];
}
