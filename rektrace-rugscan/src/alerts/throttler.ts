export class AlertThrottler {
  private last: Map<string, number> = new Map();
  constructor(private getWindowMs: () => number) {}
  shouldNotify(key: string, now = Date.now()): boolean {
    const win = this.getWindowMs();
    const prev = this.last.get(key) ?? 0;
    if (now - prev < win) return false;
    this.last.set(key, now);
    return true;
  }
}


