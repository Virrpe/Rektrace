import { bus } from './events.js';

export type Credits = { used: number; limit: number };

type Action = 'none' | 'degrade' | 'deny' | 'stub';

let lastAlertAt = 0;
let clampUntil = 0;
let dayKey: string | null = null;
let baselineUsed = 0;

export function startBudgetGuard(getCredits: () => Credits | null) {
  if (process.env.BUDGET_ENABLED !== 'true') return () => {};
  const debounceMs = Math.max(1, Number(process.env.BUDGET_DEBOUNCE_MS ?? 60000));
  const action = String(process.env.BUDGET_ACTION || 'degrade') as Action;

  const tick = async () => {
    try {
      const c = getCredits();
      if (!c || !c.limit || c.limit <= 0) return;
      const todayKey = new Date().toISOString().slice(0,10); // UTC day
      if (dayKey !== todayKey) { dayKey = todayKey; baselineUsed = c.used; }
      const usedDelta = Math.max(0, c.used - baselineUsed);
      const pct = Math.round((usedDelta / c.limit) * 100);
      const over = usedDelta >= c.limit || pct >= 100;
      if (!over) return;

      const now = Date.now();
      if (now - lastAlertAt < debounceMs) return;
      lastAlertAt = now;
      const note = `budget breach: used_delta_today=${usedDelta} limit=${c.limit} (${pct}%) action=${action}`;
      try { bus.emit('alert:budget_breach', { type: 'credits', note }); } catch {}
      try { console.warn(`[BUDGET] ${note}`); } catch {}

      if (process.env.AUTO_GUARD_ENABLED === 'true' && action !== 'none') {
        clampUntil = now + 60_000; // default 60s clamp window
        const until = clampUntil;
        try {
          const { setBudgetClamp } = await import('../security/auto_guard.js');
          if (action === 'degrade') setBudgetClamp({ degrade: true, until });
          else if (action === 'deny') setBudgetClamp({ deny: true, until });
          else if (action === 'stub') setBudgetClamp({ stub: true, until });
        } catch {}
      }
    } catch {}
  };

  const id = setInterval(tick, 5000);
  return () => clearInterval(id);
}


