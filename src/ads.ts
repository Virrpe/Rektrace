import Redis from 'ioredis';
const DEMO = process.env.DEMO_MODE === 'true';
import { vetConsensus } from './vetting_consensus.js';
import { verifyErc20Payment } from './payments_onchain.js';
import { verifyEthNative } from './payments_eth_native.js';
import { verifySolPayment, verifySplPayment } from './payments_solana.js';
import { verifyInkPayment } from './payments_kraken_ink.js';

export type VetScore = { score: number; notes: string[] };

const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null as unknown as Redis;

const AD_CHAIN = (process.env.AD_CHAIN || 'evm').toLowerCase();
const AD_CURRENCY = (process.env.AD_CURRENCY || 'usdt').toLowerCase();
const SLOT_DAYS = Number(process.env.AD_SLOT_DAYS || '7');

// EVM USDT
const PRICE_USDT = Number(process.env.AD_PRICE_USDT || '25');
const EVM_USDT_RECEIVER = (process.env.AD_EVM_USDT_RECEIVER || '').toLowerCase();
const USDT = (process.env.USDT_ADDRESS || '0xdAC17F958D2ee523a2206206994597C13D831ec7').toLowerCase();
// EVM ETH native
const ETHINK_RECEIVER = (process.env.ETHINK_RECEIVER || '').toLowerCase();
const ETHINK_PRICE = Number(process.env.ETHINK_PRICE || '0.02');
// Solana
const SOL_RECEIVER = process.env.SOL_RECEIVER || '';
const AD_PRICE_SOL = Number(process.env.AD_PRICE_SOL || '0.2');
const USDC_SOL_MINT = process.env.USDC_SOL_MINT || '';
const AD_PRICE_USDC_SOL = Number(process.env.AD_PRICE_USDC_SOL || '25');
// Kraken ink!
const KRAKEN_INK_RECEIVER = process.env.KRAKEN_INK_RECEIVER || '';
const KRAKEN_INK_PRICE = Number(process.env.KRAKEN_INK_PRICE || '25');
const KRAKEN_INK_ASSET_ID = process.env.KRAKEN_INK_ASSET_ID ? Number(process.env.KRAKEN_INK_ASSET_ID) : undefined;

export type AdRecord = {
  id: string; userId: number; brand: string; url: string; text: string;
  chains: string[]; token?: string; wallet?: string;
  status: 'draft'|'await_payment'|'vetting'|'approved'|'manual'|'rejected';
  score?: number; tx?: string; createdAt: number; startsAt?: number; endsAt?: number;
};

async function put(key:string, val:any) {
  if (!redis) return;
  await redis.set(key, JSON.stringify(val), 'EX', 60*60*24*30);
}
async function get<T=any>(key:string): Promise<T|null> {
  if (!redis) return null; const raw = await redis.get(key); return raw ? JSON.parse(raw) as T : null;
}

export async function createAd(a: Omit<AdRecord,'id'|'status'|'createdAt'>): Promise<AdRecord> {
  const id = `ad:${crypto.randomUUID()}`;
  const rec: AdRecord = { id, status: 'await_payment', createdAt: Date.now(), ...a } as AdRecord;
  await put(id, rec);
  return rec;
}
export async function getAd(id: string) { return await get<AdRecord>(id); }
export async function saveAd(ad: AdRecord) { await put(ad.id, ad); }

export function adFormHelp(){
  return [
    '*Advertise on RekTrace*',
    'Send in one message (lines):',
    '1) Brand name',
    '2) URL (https)',
    '3) Chains (comma list, e.g., ethereum,solana)',
    '4) Token address (optional for vet checks)',
    '5) Ad text (<=120 chars)'
  ].join('\n');
}

export function parseAdForm(text: string) {
  const lines = text.split(/\n/).map(s=>s.trim()).filter(Boolean);
  if (lines.length < 4) return null;
  const brand = lines[0];
  const url = lines[1];
  const chains = lines[2].split(',').map(s=>s.trim());
  const token = lines[3] && lines[3] !== '-' ? lines[3] : undefined;
  const adText = lines[4] ?? `${brand} — ${url}`;
  if (adText.length > 120) return null;
  try { new URL(url); } catch { return null; }
  return { brand, url, chains, token, text: adText };
}

export function paymentInstructions(ad: AdRecord){
  if (AD_CHAIN === 'evm') {
    if (AD_CURRENCY === 'eth') {
      return [
        `💸 Send *${ETHINK_PRICE} ETH* to:`,
        '`'+ETHINK_RECEIVER+'`',
        'Then reply with: `/paid '+ad.id+' <txHash>`'
      ].join('\n');
    }
    return [
      `💸 Send *${PRICE_USDT} USDT (ERC20)* to:`,
      '`'+EVM_USDT_RECEIVER+'`',
      'Then reply with: `/paid '+ad.id+' <txHash>`'
    ].join('\n');
  }
  if (AD_CHAIN === 'sol') {
    if (AD_CURRENCY === 'usdc_spl') {
      return [
        `💸 Send *${AD_PRICE_USDC_SOL} USDC (SPL)* to:`,
        '`'+SOL_RECEIVER+'`',
        'Then reply with: `/paid '+ad.id+' <signature>`'
      ].join('\n');
    }
    return [
      `💸 Send *${AD_PRICE_SOL} SOL* to:`,
      '`'+SOL_RECEIVER+'`',
      'Then reply with: `/paid '+ad.id+' <signature>`'
    ].join('\n');
  }
  if (AD_CHAIN === 'ink') {
    return [
      `💸 Send *${KRAKEN_INK_PRICE} INK* to:`,
      '`'+KRAKEN_INK_RECEIVER+'`',
      'Then reply with: `/paid '+ad.id+' <txHashOrIndex>`'
    ].join('\n');
  }
  return 'Payment route not configured.';
}

export async function requestPaymentText(ad: AdRecord){ return paymentInstructions(ad); }

export async function handlePaid(ad: AdRecord, tx: string): Promise<boolean> {
  if (DEMO) {
    ad.tx = 'demo-tx';
    ad.status = 'vetting';
    await saveAd(ad);
    return true;
  }
  let ok = false;
  if (AD_CHAIN === 'evm') {
    if (AD_CURRENCY === 'eth') {
      ok = await verifyEthNative({ txHash: tx, to: ETHINK_RECEIVER, minEth: ETHINK_PRICE });
    } else {
      ok = await verifyErc20Payment({ txHash: tx, to: EVM_USDT_RECEIVER, token: USDT, minAmount: PRICE_USDT });
    }
  } else if (AD_CHAIN === 'sol') {
    if (AD_CURRENCY === 'usdc_spl') {
      ok = await verifySplPayment({ signature: tx, to: SOL_RECEIVER, mint: USDC_SOL_MINT, minAmount: AD_PRICE_USDC_SOL });
    } else {
      ok = await verifySolPayment({ signature: tx, to: SOL_RECEIVER, minSol: AD_PRICE_SOL });
    }
  } else if (AD_CHAIN === 'ink') {
    ok = await verifyInkPayment({ hash: tx, to: KRAKEN_INK_RECEIVER, minAmount: KRAKEN_INK_PRICE, assetId: KRAKEN_INK_ASSET_ID });
  }
  if (!ok) return false;
  ad.tx = tx; ad.status = 'vetting'; await saveAd(ad); return true;
}

export async function runVetting(ad: AdRecord): Promise<VetScore> {
  if (DEMO) {
    ad.score = 75;
    ad.status = 'approved';
    ad.startsAt = Date.now();
    ad.endsAt = Date.now() + SLOT_DAYS*24*60*60*1000;
    await saveAd(ad);
    return { score: 75, notes: ['demo: auto-approved'] };
  }
  const chain = ad.chains.map(c=>c.toLowerCase()).includes('solana') ? 'sol' : 'evm';
  const res = await vetConsensus({ url: ad.url, chain, token: ad.token });
  ad.score = res.score;
  ad.status = res.decision;
  if (ad.status === 'approved') { ad.startsAt = Date.now(); ad.endsAt = Date.now() + SLOT_DAYS*24*60*60*1000; }
  await saveAd(ad);
  return { score: res.score, notes: res.notes };
}

export async function pickAd(chains: string[]): Promise<string|undefined> {
  if (DEMO) {
    return 'Pay with INK on Kraken L2 — demo';
  }
  if (!redis) return undefined;
  const keys = await redis.keys('ad:*');
  const now = Date.now();
  const approved: AdRecord[] = [];
  for (const k of keys) {
    const raw = await redis.get(k); if (!raw) continue;
    const ad = JSON.parse(raw) as AdRecord;
    if (ad.status==='approved' && (!ad.endsAt || ad.endsAt>now)) approved.push(ad);
  }
  if (!approved.length) return undefined;
  const idx = Math.floor(now/60000) % approved.length;
  return approved[idx].text;
}
