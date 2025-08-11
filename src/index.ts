import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';
import type { Context, NextFunction } from 'grammy';
import Redis from 'ioredis';
import { MemoryCache, RedisCache, type CacheLike } from './cache.js';
import { breakers, resolveContracts, fetchHolders } from './providers.js';
import { renderHoldersCard, nextAd } from './ui.js';
import { pickAd, adFormHelp, createAd, requestPaymentText, getAd, handlePaid, runVetting, parseAdForm } from './ads.js';
import { registerPreflight } from './preflight.js';
import { startHealthServer } from './health.js';

const token = process.env.TELEGRAM_BOT_TOKEN!;
if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN');

const redisUrl = process.env.REDIS_URL || '';
const ttl = Number(process.env.CACHE_TTL_SECONDS ?? 900);
const providerToken = process.env.TELEGRAM_PAYMENT_PROVIDER_TOKEN || '';
const PRO_PRICE_XTR = Number(process.env.PRO_PRICE_XTR || '100');

let cache: CacheLike;
if (redisUrl) {
  const client = new Redis(redisUrl);
  cache = new RedisCache(client, ttl);
} else {
  cache = new MemoryCache(ttl);
}

// simple in-memory entitlements (swap to Redis for persistence)
const PRO_USERS = new Set<number>();

// Simple rotating fallback ad pool (chain-aware)
const ADS = [
  { id: 'exA', text: 'Trade on ExampleX — https://example.com/ref', targetChains: ['ethereum','arbitrum-one','polygon-pos'] },
  { id: 'exB', text: 'Best SOL wallet → https://example.org/sol', targetChains: ['solana'] },
  { id: 'exC', text: 'Institutional charts — https://charts.example.net' },
];

const bot = new Bot(token);
registerPreflight(bot); // /preflight enabled

// --- Minimal rate limiter & budget gate ---
const RATE_WINDOW_MS = 10_000;
const RATE_PER_USER = 5;
const GLOBAL_CONCURRENCY_MAX = 25;
const CACHE_ONLY_MS = 120_000;
const userHits = new Map<number, number[]>();
let inflight = 0;
let cacheOnlyUntil = 0;

async function guard(ctx: Context, next: NextFunction) {
  const now = Date.now();
  // cache-only window
  if (now < cacheOnlyUntil && ctx.msg?.text?.startsWith('/holders')) {
    await ctx.reply('High load — serving cached results only. Retry shortly.');
    return; // rely on existing cache logic path via /holders cacheKey hit
  }
  // per-user rate
  const uid = ctx.from?.id;
  if (uid) {
    const arr = userHits.get(uid) || [];
    const recent = arr.filter(ts => now - ts < RATE_WINDOW_MS);
    if (recent.length >= RATE_PER_USER) {
      await ctx.reply('Rate limit: try again in a few seconds.');
      return;
    }
    recent.push(now);
    userHits.set(uid, recent);
  }
  // global concurrency
  if (inflight >= GLOBAL_CONCURRENCY_MAX) {
    cacheOnlyUntil = Date.now() + CACHE_ONLY_MS;
    await ctx.reply('System is busy — cache-only mode for 2 minutes.');
    return;
  }
  inflight++;
  try { await next(); } finally { inflight = Math.max(0, inflight - 1); }
}

bot.use(guard);

bot.command('start', ctx => ctx.reply(
  [
    '*RekTrace* — Cross-Chain Holder Footprint',
    '',
    'Commands:',
    '`/holders <symbol|contract|coingecko-url>`',
    '`/map <symbol>`',
    '`/status`',
    '`/advertise — crypto-paid ads (INK supported)`',
    '`/ad_terms — ad policy & refunds`',
    '`/pro — unlock alerts & batch`',
    '`/preflight — launch audit`'
  ].join('\n'),
  { parse_mode: 'Markdown' }
));

bot.command('status', ctx => {
  const lines = Object.entries(breakers).map(([k,b]) => `- ${k}: ${b.state()}`);
  ctx.reply(['*Status*', ...lines].join('\n'), { parse_mode: 'Markdown' });
});

bot.command('map', async ctx => {
  const q = ctx.match?.trim();
  if (!q) return ctx.reply('Usage: /map <symbol|contract|coingecko-url>');
  const cacheKey = `map:${q.toLowerCase()}`;
  const map = await cache.get<Record<string,string>>(cacheKey) ?? await (async () => {
    const m = await resolveContracts(q);
    await cache.set(cacheKey, m, 3600);
    return m;
  })();
  if (!map || Object.keys(map).length === 0) return ctx.reply('Could not resolve contracts.');
  const lines = Object.entries(map).map(([chain,addr]) => `• ${chain} → \`${addr}\``);
  return ctx.reply(['*Detected Contracts:*','',...lines].join('\n'), { parse_mode: 'Markdown' });
});

bot.command('holders', async ctx => {
  const q = ctx.match?.trim();
  if (!q) return ctx.reply('Usage: /holders <symbol|contract|coingecko-url>');
  await ctx.reply('Resolving contracts…');
  const contracts = await resolveContracts(q);
  if (!contracts || Object.keys(contracts).length===0) return ctx.reply('Could not resolve contracts.');

  const cacheKey = `holders:${JSON.stringify(contracts)}`;
  const cached = await cache.get<{rows:any[]; total:number; confidence:string}>(cacheKey);
  const approvedAd = await pickAd(Object.keys(contracts));
  const fallbackAd = nextAd(ADS, (Date.now()/1000)|0, Object.keys(contracts));
  const adText = approvedAd || fallbackAd;

  if (cached) {
    const message = renderHoldersCard({
      tokenLabel: q.toUpperCase(),
      chains: Object.keys(contracts),
      rows: cached.rows,
      total: cached.total,
      confidence: cached.confidence as 'green'|'amber'|'red',
      affiliateText: adText,
      proEnabled: true,
    });
    return ctx.reply(message, { parse_mode: 'Markdown' });
  }

  if (Date.now() < cacheOnlyUntil) {
    return ctx.reply('Cache-only mode: no fresh data available. Please retry in a minute.');
  }

  await ctx.reply('Fetching holders across chains…');
  const entries = Object.entries(contracts);
  const results = await Promise.all(entries.map(async ([chain, addr]) => {
    const r = await fetchHolders(chain, addr);
    return { chain, contract: addr, ...r };
  }));
  let total = 0; let missing = false; const used = new Set<string>();
  for (const r of results) { if (r.holders !== null) total += r.holders; else missing = true; if (r.source) used.add(r.source); }
  const confidence = (!missing && used.size>=1) ? 'green' : (missing ? 'red' : 'amber');
  const payload = { rows: results, total, confidence };
  await cache.set(cacheKey, payload);

  const message = renderHoldersCard({
    tokenLabel: q.toUpperCase(),
    chains: Object.keys(contracts),
    rows: results,
    total,
    confidence: confidence as 'green'|'amber'|'red',
    affiliateText: adText,
    proEnabled: true,
  });
  return ctx.reply(message, { parse_mode: 'Markdown' });
});

// Monetization (Stars)
bot.command('pro', async ctx => {
  const kb = new InlineKeyboard().text('Unlock Pro (Stars)', 'buy_pro');
  const perks = ['Alerts on holder deltas','Batch lookups','Faster freshness'];
  await ctx.reply(`*Pro (preview)*\n${perks.map(p=>`• ${p}`).join('\n')}\n\nTap to purchase with Stars.`, { parse_mode: 'Markdown', reply_markup: kb });
});

bot.callbackQuery('buy_pro', async ctx => {
  if (!providerToken) {
    await ctx.answerCallbackQuery({ text: 'Payments not configured yet.' });
    return;
  }
  await ctx.api.sendInvoice(
    ctx.chat!.id,
    'Pro Access',
    'Unlock alerts, batch, and faster freshness',
    'pro-01',
    providerToken,
    [{ label: 'Pro (lifetime)', amount: PRO_PRICE_XTR }],
    { need_name: false, need_email: false }
  );
  await ctx.answerCallbackQuery();
});

bot.on('message:successful_payment', async ctx => {
  const uid = ctx.from!.id;
  PRO_USERS.add(uid);
  await ctx.reply('✅ Pro unlocked! Use /alerts and /batch.');
});

bot.command('alerts', async ctx => {
  if (!PRO_USERS.has(ctx.from!.id)) return ctx.reply('Pro required. Use /pro to unlock.');
  return ctx.reply('Alerts coming soon: /alerts <contract> <+/-N>');
});

// --- Advertise Flow ---
bot.command('advertise', async (ctx) => {
  await ctx.reply(adFormHelp(), { parse_mode: 'Markdown' });
});

bot.command('ad_submit', async (ctx) => {
  const body = ctx.match?.trim();
  if (!body) return ctx.reply('Send your ad form in the message: /ad_submit <lines>');
  const parsed = parseAdForm(body);
  if (!parsed) return ctx.reply('Invalid format. Use /advertise for the 5-line template.');
  const ad = await createAd({ userId: ctx.from!.id, ...parsed, wallet: undefined });
  const payText = await requestPaymentText(ad);
  await ctx.reply(['Ad received as draft. Payment required to start vetting.','', payText].join('\n'), { parse_mode: 'Markdown' });
});

bot.command('paid', async (ctx) => {
  const m = ctx.match?.trim();
  if (!m) return ctx.reply('Usage: /paid <adId> <txHash|signature>');
  const [adId, tx] = m.split(/\s+/);
  const ad = await getAd(adId);
  if (!ad) return ctx.reply('Ad not found.');
  const ok = await handlePaid(ad, tx);
  if (!ok) return ctx.reply('Payment not verified. Check chain/amount/receiver and retry.');
  const res = await runVetting(ad);
  await ctx.reply(`Vetting complete — score ${res.score}. ${res.score>=70?'✅ Approved':'⏳ Manual/Rejected'}`);
});

// Ink-friendly ad policy
bot.command('ad_terms', (ctx) => ctx.reply(
  [
    'Paid placements are auto‑scanned; not endorsements.',
    'Domains must be HTTPS and ≥30 days old (or manual review).',
    'No shorteners, no guaranteed profit claims.',
    'Refunds: rejections refunded minus 10% review fee; removals for policy breaches are not refunded.',
    'INK payments supported (Kraken L2). Rekt currency support coming later this year.'
  ].join('\n')
));

bot.catch(err => console.error('Bot error', err));
startHealthServer();
bot.start().then(()=> console.log('RekTrace up.'));
