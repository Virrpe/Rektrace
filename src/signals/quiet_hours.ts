import fs from 'node:fs';

type Window = { startMin: number; endMin: number };

function parseWindows(spec: string | undefined): Window[] {
  const txt = (spec || '').trim();
  if (!txt) return [];
  return txt.split(',').map(s => s.trim()).filter(Boolean).map(seg => {
    const m = seg.match(/^([0-2]\d):([0-5]\d)-([0-2]\d):([0-5]\d)$/);
    if (!m) return null;
    const sh = Number(m[1]); const sm = Number(m[2]);
    const eh = Number(m[3]); const em = Number(m[4]);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    return { startMin, endMin } as Window;
  }).filter((x): x is Window => !!x);
}

function minutesSinceUtcMidnight(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function isQuietNow(nowUTC: Date = new Date(), opts?: { admin: boolean }): boolean {
  return whyQuiet(nowUTC, opts) !== null;
}

export function whyQuiet(nowUTC: Date = new Date(), opts?: { admin: boolean }): 'muted' | 'quiet_hours' | null {
  const adminOverride = (process.env.SIGNALS_QUIET_ADMIN_OVERRIDE === 'true') && !!(opts?.admin);
  if (process.env.SIGNALS_EMERGENCY_MUTE === 'true') {
    if (!adminOverride) return 'muted';
  }
  if (process.env.SIGNALS_QUIET_ENABLED === 'true') {
    const windows = parseWindows(process.env.SIGNALS_QUIET_WINDOW_UTC || '');
    if (windows.length > 0) {
      const t = minutesSinceUtcMidnight(nowUTC);
      for (const w of windows) {
        // treat window as [start, end), supports same-day ranges
        if (w.startMin <= w.endMin) {
          if (t >= w.startMin && t < w.endMin) {
            if (!adminOverride) return 'quiet_hours';
          }
        } else {
          // wrap-around (e.g., 22:00-02:00)
          if ((t >= w.startMin && t < 24*60) || (t >= 0 && t < w.endMin)) {
            if (!adminOverride) return 'quiet_hours';
          }
        }
      }
    }
  }
  return null;
}

type AllowCache = { entries: Set<string>; mtimeMs: number; loadedAt: number } | null;
let allowCache: AllowCache = null;

async function loadAllowList(): Promise<AllowCache> {
  const path = process.env.SIGNALS_PARTNER_ALLOW_FILE || 'ops/allowlist.txt';
  try {
    const st = await fs.promises.stat(path);
    if (allowCache && allowCache.mtimeMs === st.mtimeMs && (Date.now() - allowCache.loadedAt) < 60000) {
      return allowCache;
    }
    const raw = await fs.promises.readFile(path, 'utf8');
    const set = new Set<string>();
    for (const line of raw.split(/\r?\n/)) {
      const v = line.trim();
      if (!v) continue;
      if (v.startsWith('#')) continue;
      set.add(v.toLowerCase());
    }
    allowCache = { entries: set, mtimeMs: st.mtimeMs, loadedAt: Date.now() };
    return allowCache;
  } catch (e) {
    // if enabled but unreadable, return empty set with current ts to avoid tight loops
    if (process.env.SIGNALS_PARTNER_ALLOW_ENABLED === 'true') {
      allowCache = { entries: new Set(), mtimeMs: 0, loadedAt: Date.now() };
      return allowCache;
    }
    return { entries: new Set(), mtimeMs: 0, loadedAt: Date.now() };
  }
}

export async function shouldAllowByPartnerList(symbol?: string, address?: string): Promise<{ allow: boolean; reason?: string }> {
  if (process.env.SIGNALS_PARTNER_ALLOW_ENABLED !== 'true') return { allow: true };
  const cache = await loadAllowList();
  const list = cache?.entries ?? new Set<string>();
  if (!list || list.size === 0) return { allow: false, reason: 'allowlist_empty' };
  const sym = (symbol || '').toLowerCase();
  const addr = (address || '').toLowerCase();
  if (addr && list.has(addr)) return { allow: true };
  if (sym && list.has(sym)) return { allow: true };
  // support chain-qualified symbol like "ink:pepe"
  if (sym && process.env.SIGNALS_CHAINS) {
    for (const chain of String(process.env.SIGNALS_CHAINS).split(',').map(s=>s.trim().toLowerCase())) {
      if (list.has(`${chain}:${sym}`)) return { allow: true };
    }
  }
  return { allow: false, reason: 'allowlist_miss' };
}


