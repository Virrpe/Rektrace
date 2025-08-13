export type Budgets = {
  CONNECT_TIMEOUT_MS: number;
  TOTAL_TIMEOUT_MS: number;
  BACKOFF_BASE_MS: number;
  BACKOFF_MAX_MS: number;
  JITTER_PCT: number;
};

export function readBudgets(): Budgets {
  const num = (k: string, d: number) => {
    const n = Number(process.env[k] ?? d);
    return Number.isFinite(n) ? n : d;
  };
  return {
    CONNECT_TIMEOUT_MS: num('CONNECT_TIMEOUT_MS', 3000),
    TOTAL_TIMEOUT_MS: num('TOTAL_TIMEOUT_MS', 7000),
    BACKOFF_BASE_MS: num('BACKOFF_BASE_MS', 200),
    BACKOFF_MAX_MS: num('BACKOFF_MAX_MS', 2000),
    JITTER_PCT: num('JITTER_PCT', 15),
  };
}


