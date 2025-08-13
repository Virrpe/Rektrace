import { bus } from '../observability/events.js';

type GuardStep = 0|1|2|3;
let step: GuardStep = 0;
let lastBreach = 0;

type Clamp = { degrade?: boolean; deny?: boolean; stub?: boolean; until?: number } | null;
let clamp: Clamp = null;

const calmMs = Math.max(1, Number(process.env.AUTO_GUARD_COOLDOWN_MS ?? 300000));

export function autoGuardState() {
  return { step, lastBreach };
}

export function startAutoGuard() {
  if (process.env.AUTO_GUARD_ENABLED !== 'true') return () => {};
  const onBreach = () => {
    lastBreach = Date.now();
    if (step < 3) step = (step + 1) as GuardStep;
    // Apply side effects via env flags proxies
    if (step >= 1) process.env.RL_MAX = String(Math.max(5, Math.floor(Number(process.env.RL_MAX ?? 20) / 2)));
    if (step >= 2) process.env.STRICT_CONTENT_TYPE = 'true';
  };
  bus.on('alert:breach', onBreach);
  const timer = setInterval(() => {
    if (step === 0) return;
    if (Date.now() - lastBreach >= calmMs) {
      // revert
      step = 0;
      // Do not mutate envs back; rely on operator to reset or restart if needed. Minimal/no-op revert.
    }
    // expire clamps
    if (clamp && clamp.until && Date.now() >= clamp.until) clamp = null;
  }, 10000);
  return () => { try { bus.off('alert:breach', onBreach); } catch {}; clearInterval(timer); };
}

export function maybeDenyHeavyScan(): { deny: boolean; retryAfter?: number } {
  if (process.env.AUTO_GUARD_ENABLED !== 'true') return { deny: false };
  // budget clamp can force deny regardless of step
  if (clamp && clamp.deny) return { deny: true, retryAfter: 60 };
  if (step >= 3) return { deny: true, retryAfter: 30 };
  return { deny: false };
}

// In-memory clamp control for budget guard
export function setBudgetClamp(c: { degrade?: boolean; deny?: boolean; stub?: boolean; until?: number }) {
  clamp = { ...c };
  if (clamp.degrade) {
    // halve RL_MAX in-memory, floor >= 5
    process.env.RL_MAX = String(Math.max(5, Math.floor(Number(process.env.RL_MAX ?? 20) / 2)));
  }
}

export function maybeForceStub(): boolean {
  if (process.env.BREAKER_FORCE_OPEN === 'true') return true;
  if (process.env.AUTO_GUARD_ENABLED !== 'true') return false;
  if (!clamp) return false;
  if (clamp.until && Date.now() >= clamp.until) { clamp = null; return false; }
  return !!clamp.stub;
}


