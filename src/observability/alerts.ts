import { bus, type BreachEvent } from './events.js';

export type SLOSnapshot = { p95_ms: number; error_rate_1m: number; breaker_hits_1m: number };

type Credits = { used: number; limit: number };

export function startAlertLoop(getSnapshot: () => SLOSnapshot, getCredits: () => Credits | null, notifyAdmin?: (text: string) => Promise<void>) {
  if (process.env.ALERTS_ENABLED !== 'true') return () => {};
  const debounceMs = Math.max(1, Number(process.env.ALERT_DEBOUNCE_MS ?? 60000));
  const last: Record<string, number> = {};
  const threshold = {
    p95: Number(process.env.ALERT_SLO_P95_MS ?? 1500),
    err: Number(process.env.ALERT_ERR_RATE_PCT ?? 1.0),
    brk: Number(process.env.ALERT_BREAKER_RATE_PCT ?? 2.0),
    creditsRemain: Number(process.env.ALERT_CREDITS_REMAIN_PCT ?? 10),
  };
  const tick = async () => {
    try {
      const slo = getSnapshot();
      const breaches: string[] = [];
      if (slo.p95_ms > threshold.p95) breaches.push(`p95 ${slo.p95_ms}ms > ${threshold.p95}ms`);
      if (slo.error_rate_1m > threshold.err) breaches.push(`err1m ${slo.error_rate_1m}% > ${threshold.err}%`);
      if (slo.breaker_hits_1m > threshold.brk) breaches.push(`breaker1m ${slo.breaker_hits_1m} > ${threshold.brk}`);
      const cr = getCredits();
      if (cr && cr.limit > 0) {
        const remainPct = Math.max(0, 100 - Math.round((cr.used/cr.limit)*100));
        if (remainPct <= threshold.creditsRemain) breaches.push(`credits remaining ${remainPct}% <= ${threshold.creditsRemain}%`);
      }
      if (breaches.length) {
        const now = Date.now();
        const key = breaches.join('|');
        if (!last[key] || now - last[key] >= debounceMs) {
          last[key] = now;
          const text = `ALERT: ${breaches.join('; ')}`;
          try { await notifyAdmin?.(text); } catch {}
          const ev: BreachEvent = { type: 'slo', note: text };
          bus.emit('alert:breach', ev);
          try { console.warn(`[ADMIN ALERT] ${text}`); } catch {}
        }
      }
    } catch {}
  };
  const id = setInterval(tick, 5000);
  return () => clearInterval(id);
}


