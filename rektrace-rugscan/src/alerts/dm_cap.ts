export class PerUserCap {
  private times = new Map<number, number[]>(); // chatId -> timestamps
  constructor(private maxPerWindow: number, private windowMs: number) {}
  allow(chatId: number, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const arr = (this.times.get(chatId) ?? []).filter(t => t > cutoff);
    if (arr.length >= this.maxPerWindow) { this.times.set(chatId, arr); return false; }
    arr.push(now); this.times.set(chatId, arr); return true;
  }
}
export const dmCap = new PerUserCap(
  Number(process.env.ALERTS_DM_MAX ?? 3),
  Number(process.env.ALERTS_DM_WINDOW_MS ?? 600_000) // 10m
);

export function resetDmCapForTests() {
  try { (dmCap as any).times?.clear?.(); } catch {}
}


