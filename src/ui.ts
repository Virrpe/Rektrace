export const Divider = '━━━━━━━━━━━━━━━━';
export type ChainRow = { chain: string; contract: string; holders: number | null; source: string };

export type RenderOptions = {
  tokenLabel: string;
  chains: string[];
  rows: ChainRow[];
  total: number;
  confidence: 'green'|'amber'|'red';
  delta7d?: number | null;
  affiliateText?: string;
  proEnabled?: boolean;
};

function fmt(n: number | null) { return n === null ? '—' : n.toLocaleString(); }
function confBadge(c: RenderOptions['confidence']) { return ({green:'🟢',amber:'🟡',red:'🔴'} as const)[c]; }
const MD_CHARS = /([_*\[\]()~`>#+\-=|{}.!])/g;
export function escapeMD(s: string) { return s.replace(MD_CHARS, '\\$1'); }

export function renderAffiliateCTA(text?: string) { return text ? `\n${escapeMD(text)}` : ''; }
export function renderProCTA(enabled?: boolean) { return enabled ? `\n*Get Pro* \(alerts + CSV\) — /pro` : ''; }

export function renderHoldersCard(o: RenderOptions) {
  const { tokenLabel, chains, rows, total, confidence } = o;
  const head = `💎 ${escapeMD(tokenLabel)} Holders (All Chains)\n${Divider}`;
  const demo = process.env.DEMO_MODE === 'true' ? ' (demo)' : '';
  const meta = `🌐 Chains: ${escapeMD(chains.join(', '))}\n${confBadge(confidence)} Confidence: *${confidence.toUpperCase()}*${demo}`;
  const core = `👥 Holders: *${fmt(total)}*${o.delta7d!=null ? ` \(${o.delta7d>=0?'+':''}${o.delta7d}% 7d\)` : ''}`;
  const sorted = [...rows].sort((a,b)=> (Number(a.holders===null) - Number(b.holders===null)) || ((b.holders??0) - (a.holders??0)));
  const tableHdr = `*Per-chain:* \(source\) holders — contract`;
  const table = sorted.map(r => `• \`${escapeMD(r.chain)}\` (${escapeMD(r.source)})  *${fmt(r.holders)}* — \`${escapeMD(r.contract)}\``).join('\n');
  const legal = `\n_Disclaimer: per-chain addresses; not unique persons. Data may vary across sources._`;
  const affiliate = renderAffiliateCTA(o.affiliateText);
  const pro = renderProCTA(o.proEnabled);
  return [head, meta, core, Divider, tableHdr, table, affiliate, pro, legal].filter(Boolean).join('\n');
}

export type AdItem = { id: string; text: string; targetChains?: string[] };
export function nextAd(ads: AdItem[], counter: number, tokenChains: string[]): string | undefined {
  if (!ads.length) return undefined;
  const pool = ads.filter(a => !a.targetChains || a.targetChains.some(c => tokenChains.includes(c)));
  if (!pool.length) return undefined;
  const pick = pool[Math.floor(counter) % pool.length];
  return pick.text;
}
