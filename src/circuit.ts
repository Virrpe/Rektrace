const CLOSE_AFTER = Math.max(1, Number(process.env.BREAKER_CLOSE_AFTER ?? 3));

export class Breaker {
  private fails = 0;
  private openedUntil = 0;
  private successStreak = 0;
  private lastTransitionTs = Date.now();
  constructor(private threshold = 3, private cooldownMs = 60_000) {}
  allow() { return Date.now() >= this.openedUntil; }
  success() {
    if (!this.allow()) {
      // opened; count towards half-open close when next allowed
      this.successStreak = 0;
      return;
    }
    this.fails = 0;
    if (this.successStreak < CLOSE_AFTER) {
      this.successStreak++;
      if (this.successStreak >= CLOSE_AFTER) {
        // fully close
        if (this.openedUntil !== 0) this.lastTransitionTs = Date.now();
        this.openedUntil = 0;
      }
    }
  }
  fail() {
    this.fails += 1;
    if (this.fails >= this.threshold) {
      this.openedUntil = Date.now() + this.cooldownMs;
      this.successStreak = 0;
      this.lastTransitionTs = Date.now();
    }
  }
  state() {
    if (!this.allow()) return 'open';
    return this.successStreak > 0 && this.successStreak < CLOSE_AFTER ? 'half-open' : 'ok';
  }
  lastTransitionAt() { return this.lastTransitionTs; }
}
