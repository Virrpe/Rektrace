// Chaos helpers (env-gated). No side effects when disabled.

function envFlag(name: string, dflt = 'false'): boolean {
  return (process.env[name] ?? dflt) === 'true';
}

function envNum(name: string, dflt: number): number {
  const n = Number(process.env[name] ?? dflt);
  return Number.isFinite(n) ? n : dflt;
}

export function chaosEnabled(): boolean {
  return envFlag('CHAOS_ENABLED', 'false');
}

export function shouldDrop(probEnv = 'CHAOS_PROB'): boolean {
  if (!chaosEnabled()) return false;
  const p = Math.max(0, Math.min(1, Number(process.env[probEnv] ?? 0.05)));
  return Math.random() < p;
}

export async function latency(maxMsEnv = 'CHAOS_MAX_LATENCY_MS'): Promise<void> {
  if (!chaosEnabled()) return;
  const max = Math.max(0, envNum(maxMsEnv, 500));
  if (max <= 0) return;
  const ms = Math.floor(Math.random() * max);
  await new Promise(res => setTimeout(res, ms));
}

export function jitter(baseMs: number, pctEnv = 'JITTER_PCT'): number {
  const pct = Math.max(0, Math.min(100, Number(process.env[pctEnv] ?? 15)));
  const amp = baseMs * (pct / 100);
  const delta = (Math.random() * 2 - 1) * amp; // ±amp
  const out = Math.max(0, Math.round(baseMs + delta));
  return out;
}


