import type { TradeTick } from '../schemas.js';
import { startInkDiscovery } from './ink_discovery.js';

export type DiscoveryOpts = { onTick: (t: TradeTick)=>void; onInfo?: (msg: string)=>void };

export function startSignalsDiscovery(opts: DiscoveryOpts) {
  if (process.env.DEMO_MODE !== 'true' && process.env.SIGNALS_WS_ENABLED === 'true') {
    try {
      const { startQuickNodeWS } = require('./ws_quicknode.js');
      return startQuickNodeWS(opts);
    } catch {
      opts.onInfo?.('ws_unavailable_fallback_to_poll');
      return startInkDiscovery(opts);
    }
  }
  return startInkDiscovery(opts);
}


