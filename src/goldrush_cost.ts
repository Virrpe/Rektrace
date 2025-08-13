export type GoldrushOp = "HOLDERS" | "DEPLOYER" | "APPROVALS" | "TRACE";

const n = (v: string | undefined, d: number) => {
  const x = Number(v); return Number.isFinite(x) && x >= 0 ? x : d;
};

export const GOLD_WEIGHTS = {
  HOLDERS: n(process.env.GOLDRUSH_CREDIT_W_HOLDERS, 3),
  DEPLOYER: n(process.env.GOLDRUSH_CREDIT_W_DEPLOYER, 2),
  APPROVALS: n(process.env.GOLDRUSH_CREDIT_W_APPROVALS, 3),
  TRACE:    n(process.env.GOLDRUSH_CREDIT_W_TRACE,    10),
} as const;

export function estimateCredits(op: GoldrushOp): number {
  return GOLD_WEIGHTS[op];
}

