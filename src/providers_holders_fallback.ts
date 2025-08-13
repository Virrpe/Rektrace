import { request } from 'undici';
import { recordProviderFailure, recordProviderSuccess } from './metrics.js';
import { breakers } from './providers.js';

const IS_TEST = !!process.env.VITEST_WORKER_ID || process.env.NODE_ENV === 'test';
const PROVIDER_TIMEOUT_MS = IS_TEST ? 50 : Number(process.env.HOLDERS_FALLBACK_TIMEOUT_MS ?? process.env.PROVIDER_TIMEOUT_MS ?? 2500);

export async function holdersFallback(chain: string, contract: string): Promise<number | null> {
  const enabled = (process.env.HOLDERS_FALLBACK_ENABLED || 'true').toLowerCase() === 'true';
  if (!enabled) return null;
  const allow = (breakers as any)?.moralis?.allow?.() ?? true;
  if (!allow) return null;
  let lastErr: unknown;
  const t0 = Date.now();
  try {
    // Placeholder stub returns null; wire real provider later
    (breakers as any)?.moralis?.success?.();
    recordProviderSuccess('moralis', Date.now() - t0);
    return null;
  } catch (e) {
    (breakers as any)?.moralis?.fail?.();
    recordProviderFailure('moralis', Date.now() - t0, e);
    return null;
  }
}


