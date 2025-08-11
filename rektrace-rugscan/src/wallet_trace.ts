import { request } from 'undici';

const DEMO = process.env.DEMO_MODE === 'true';

export type WalletTrace = {
  chain: string;
  wallet: string;
  related: Array<{ address: string; count: number }>;
  lpEvents?: number;
};

function evmChainId(chain: string): number | null {
  const map: Record<string, number> = {
    ethereum: 1,
    'polygon-pos': 137,
    'arbitrum-one': 42161,
    'optimistic-ethereum': 10,
    base: 8453,
    avalanche: 43114,
    'binance-smart-chain': 56,
    fantom: 250,
  };
  return map[chain] ?? null;
}

const CHAIN_ALIASES: Record<string, string> = {
  eth: 'ethereum', ethereum: 'ethereum',
  bsc: 'binance-smart-chain', bnb: 'binance-smart-chain', 'binance-smart-chain': 'binance-smart-chain',
  matic: 'polygon-pos', polygon: 'polygon-pos', 'polygon-pos': 'polygon-pos',
  arb: 'arbitrum-one', arbitrum: 'arbitrum-one', 'arbitrum-one': 'arbitrum-one',
  op: 'optimistic-ethereum', optimism: 'optimistic-ethereum', 'optimistic-ethereum': 'optimistic-ethereum',
  avax: 'avalanche', avalanche: 'avalanche',
  ftm: 'fantom', fantom: 'fantom',
  base: 'base',
};

function parseWalletQuery(q: string): { chain: string; wallet: string } {
  const m = q.match(/^([a-zA-Z0-9_-]+):(.+)$/);
  if (m) {
    const chain = CHAIN_ALIASES[m[1].toLowerCase()] || m[1].toLowerCase();
    return { chain, wallet: m[2].trim() };
  }
  return { chain: 'ethereum', wallet: q };
}

export async function traceWallet(q: string): Promise<WalletTrace> {
  const { chain, wallet } = parseWalletQuery(q.trim());
  if (DEMO) {
    return {
      chain, wallet,
      related: [
        { address: '0xrel1', count: 3 },
        { address: '0xrel2', count: 2 },
        { address: '0xrel3', count: 1 },
      ],
      lpEvents: 1,
    };
  }
  const key = process.env.COVALENT_API_KEY || '';
  const cid = evmChainId(chain);
  if (!key || !cid) {
    return { chain, wallet, related: [], lpEvents: 0 };
  }
  const url = `https://api.covalenthq.com/v1/${cid}/address/${wallet}/transactions_v2/?page-size=50&no-logs=false&key=${encodeURIComponent(key)}`;
  try {
    const res = await request(url);
    const j: any = await res.body.json();
    const items = (j?.data?.items || []) as any[];
    const counts = new Map<string, number>();
    let lpEvents = 0;
    for (const tx of items) {
      const from = (tx.from_address || '').toLowerCase();
      const to = (tx.to_address || '').toLowerCase();
      const counterparty = from === wallet.toLowerCase() ? to : from;
      if (counterparty && !counterparty.startsWith('0x000000000000000000000000000000000000')) {
        counts.set(counterparty, (counts.get(counterparty) || 0) + 1);
      }
      const logs = Array.isArray(tx.log_events) ? tx.log_events : [];
      for (const le of logs) {
        const name = le?.decoded?.name || '';
        if (typeof name === 'string' && name.toLowerCase() === 'mint') lpEvents += 1;
      }
    }
    const related = Array.from(counts.entries()).sort((a,b)=> b[1]-a[1]).slice(0,10).map(([address, count])=>({ address, count }));
    return { chain, wallet, related, lpEvents };
  } catch {
    return { chain, wallet, related: [], lpEvents: 0 };
  }
}


