import { bus } from '../observability/events.js';
import { TradeTick } from './schemas.js';
import { startSignalsDiscovery } from './adapters/index.js';
import { incrTicksTotal } from '../observability/signals_metrics.js';

type Stopper = () => void;

export function startSignalsPoller(): Stopper {
  if (process.env.SIGNALS_ENABLED !== 'true') return () => {};
  const stop = startSignalsDiscovery({
    onTick: (t: TradeTick) => { incrTicksTotal(); bus.emit('signals:tick', t); },
    onInfo: (_m: string) => {}
  });
  return stop;
}


