import Redis from 'ioredis';

type Decision = {
  allow: boolean;
  reason: 'ok' | 'disabled' | 'admin_override' | 'clamp_deny' | 'clamp_sample_drop' | 'cooldown' | 'hour_cap' | 'day_cap';
  wait_ms: number;
  hour_used: number;
  day_used: number;
};

let redisClient: Redis | null = null;
function getRedis(): Redis | null {
  try {
    const url = process.env.REDIS_URL || '';
    if (!url) return null;
    if (!redisClient) redisClient = new Redis(url);
    return redisClient;
  } catch {
    return null;
  }
}

function fmtHourStamp(ms: number) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  return `${y}${m}${dd}${h}`; // YYYYMMDDHH
}
function fmtDayStamp(ms: number) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${dd}`; // YYYYMMDD
}

// In-memory fallback state
const mem = {
  lastCooldownUntil: 0,
  hour: { stamp: '', count: 0, expireAt: 0 },
  day: { stamp: '', count: 0, expireAt: 0 },
};

function getEnvBool(key: string, def: boolean): boolean {
  const v = process.env[key];
  if (v == null) return def;
  return String(v).toLowerCase() === 'true';
}
function getEnvInt(key: string, def: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : def;
}
function getEnvChoice<T extends string>(key: string, choices: T[], def: T): T {
  const v = String(process.env[key] || '').toLowerCase() as T;
  return (choices as readonly string[]).includes(v) ? v : def;
}

async function detectClamped(): Promise<boolean> {
  try {
    const mod: any = await import('../security/auto_guard.js');
    // Prefer explicit deny/stub via helpers if available
    const deny = typeof mod.maybeDenyHeavyScan === 'function' ? !!mod.maybeDenyHeavyScan().deny : false;
    const stub = typeof mod.maybeForceStub === 'function' ? !!mod.maybeForceStub() : false;
    // Treat non-zero step as degraded (clamped)
    const step = typeof mod.autoGuardState === 'function' ? Number(mod.autoGuardState()?.step || 0) : 0;
    return !!(deny || stub || step >= 1);
  } catch {
    return false;
  }
}

export async function shouldPost(now = Date.now(), opts: { admin: boolean }): Promise<Decision> {
  const ENABLED = getEnvBool('SIGNALS_POST_BUDGET_ENABLED', false);
  const MAX_HOUR = getEnvInt('SIGNALS_POST_MAX_PER_HOUR', 6);
  const MAX_DAY = getEnvInt('SIGNALS_POST_MAX_PER_DAY', 50);
  const COOLDOWN_MS = getEnvInt('SIGNALS_POST_COOLDOWN_MS', 20000);
  const WHEN_CLAMP = getEnvChoice('SIGNALS_POST_WHEN_CLAMP', ['deny', 'sample', 'allow'], 'sample');
  const SAMPLE_PCT = Math.min(100, Math.max(0, getEnvInt('SIGNALS_POST_SAMPLE_PCT', 30)));
  const ADMIN_BYPASS = getEnvBool('SIGNALS_POST_ADMIN_OVERRIDE', false);

  const hourStamp = fmtHourStamp(now);
  const dayStamp = fmtDayStamp(now);

  if (!ENABLED) return { allow: true, reason: 'disabled', wait_ms: 0, hour_used: 0, day_used: 0 };
  if (ADMIN_BYPASS && opts.admin) return { allow: true, reason: 'admin_override', wait_ms: 0, hour_used: 0, day_used: 0 };

  // Clamp policy
  const clamped = await detectClamped();
  if (clamped) {
    if (WHEN_CLAMP === 'deny') return { allow: false, reason: 'clamp_deny', wait_ms: COOLDOWN_MS, hour_used: 0, day_used: 0 };
    if (WHEN_CLAMP === 'sample') {
      const ok = Math.random() * 100 < SAMPLE_PCT;
      if (!ok) return { allow: false, reason: 'clamp_sample_drop', wait_ms: COOLDOWN_MS, hour_used: 0, day_used: 0 };
      // proceed
    }
    // allow-through → continue checks
  }

  // Cooldown check
  const r = getRedis();
  if (r) {
    try {
      const pttl = await r.pttl('signals:post:last_ts');
      if (pttl && pttl > 0) return { allow: false, reason: 'cooldown', wait_ms: pttl, hour_used: 0, day_used: 0 };
    } catch {}
  } else {
    if (mem.lastCooldownUntil > now) {
      return { allow: false, reason: 'cooldown', wait_ms: Math.max(0, mem.lastCooldownUntil - now), hour_used: 0, day_used: 0 };
    }
  }

  // Counters (hour/day)
  let hourUsed = 0, dayUsed = 0;
  if (r) {
    try {
      const hk = `signals:post:h:${hourStamp}`;
      const dk = `signals:post:d:${dayStamp}`;
      const hv = await r.incr(hk);
      if (hv === 1) await r.expire(hk, 3700);
      const dv = await r.incr(dk);
      if (dv === 1) await r.expire(dk, 90000);
      hourUsed = hv;
      dayUsed = dv;
      if (hourUsed > MAX_HOUR) return { allow: false, reason: 'hour_cap', wait_ms: COOLDOWN_MS, hour_used: hourUsed, day_used: dayUsed };
      if (dayUsed > MAX_DAY) return { allow: false, reason: 'day_cap', wait_ms: COOLDOWN_MS, hour_used: hourUsed, day_used: dayUsed };
      // Set cooldown on allow
      await r.set('signals:post:last_ts', '1', 'PX', COOLDOWN_MS);
      return { allow: true, reason: 'ok', wait_ms: 0, hour_used: hourUsed, day_used: dayUsed };
    } catch {
      // fall through to memory
    }
  }

  // In-memory fallback
  // roll windows if stamps changed or expired
  if (mem.hour.stamp !== hourStamp || mem.hour.expireAt <= now) {
    mem.hour.stamp = hourStamp; mem.hour.count = 0; mem.hour.expireAt = now + 3700 * 1000;
  }
  if (mem.day.stamp !== dayStamp || mem.day.expireAt <= now) {
    mem.day.stamp = dayStamp; mem.day.count = 0; mem.day.expireAt = now + 90000 * 1000;
  }
  hourUsed = ++mem.hour.count;
  dayUsed = ++mem.day.count;
  if (hourUsed > MAX_HOUR) return { allow: false, reason: 'hour_cap', wait_ms: COOLDOWN_MS, hour_used: hourUsed, day_used: dayUsed };
  if (dayUsed > MAX_DAY) return { allow: false, reason: 'day_cap', wait_ms: COOLDOWN_MS, hour_used: hourUsed, day_used: dayUsed };
  mem.lastCooldownUntil = now + COOLDOWN_MS;
  return { allow: true, reason: 'ok', wait_ms: 0, hour_used: hourUsed, day_used: dayUsed };
}


