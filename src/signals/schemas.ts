export type Pair = { chain: string; address: string; symbol?: string };

export type TradeTick = {
  pair: Pair;
  ts: number; // ms epoch
  priceUsd?: number; // last trade/mark price
  amountUsd?: number; // trade size in USD
  maker?: 'buy' | 'sell';
};

export type MinuteBucket = {
  t0: number; // start of minute (ms)
  count: number;
  volUsd: number;
  buyUsd: number;
  sellUsd: number;
  firstPrice?: number;
  lastPrice?: number;
};

export type WindowAgg = {
  windowMin: number; // 5 or 15, etc
  volUsd: number;
  priceChangePct: number; // percent change over window, [-100, +inf)
  makerDelta: number; // (buy - sell) / max(1, vol)
};

export type SignalScore = {
  zVol5m: number;
  zPrice15m: number;
  zMaker5m: number;
  penalties: { label: string; value: number }[];
  total: number;
};

export type Signal = {
  id: string; // stable id for attestation lookup
  pair: Pair;
  score: number;
  metrics: { vol5m: number; price15m: number; maker5m: number };
  attestationId: string; // public id; hash available via attestation API
};

export type Attestation = {
  id: string;
  sha256: string;
  generated_at: number;
};


