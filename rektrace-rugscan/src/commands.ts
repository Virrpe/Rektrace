import { Bot } from 'grammy';
import { escapeMD } from '../../src/ui.js';
import { scanToken, scanTokenExact } from './scan.js';
import { InlineKeyboard } from 'grammy';
import { enrichToken } from './enrich.js';
import { estimateSwapGuard, formatGuardAdviceMessage } from './guard.js';
import { getRecentApprovals } from './approvals.js';
import { isShortener, isProbablyUrl } from './url.js';
import { listSubs, unsubscribe } from './alerts_sub.js';
import { putCb, getCb } from './cbmap.js';
import { maybeMask } from '../../src/security/log_mask.js';
import { requireAdmin } from '../../src/security/admin_gate.js';
import { computeTopSignals } from '../../src/signals/compute.js';
import { maybePostSignals } from '../../src/signals/broadcast.js';
import { shouldPost } from '../../src/signals/posting_budget.js';
import { notePostDecision } from '../../src/observability/signals_metrics.js';
import { whyQuiet, shouldAllowByPartnerList } from '../../src/signals/quiet_hours.js';
import { fetchEarlyWindow } from './sniper/collector.js';
import { scoreEarlyWindow } from './sniper/score.js';
import { recordSniperEvent, getSniperProfile } from './sniper/profiles.js';

function badge(score: number) { return score>=80?'🟢':score>=60?'🟡':'🔴'; }
function fmtFlags(flags: string[]) { return flags.slice(0,5).map(f=>`• ${escapeMD(f)}`).join('\n'); }

export function registerRugScan(bot: Bot) {
  // --- UX: /start and /help (SV default, /help en for English)
  bot.command('start', async (ctx) => {
    try { const { botMetrics } = await import('../../src/metrics.js'); botMetrics.bot_requests_total++; } catch {}
    const text = [
      'Hej! 👋 Jag skannar nya tokens och visar risk‑signaler.',
      'Snabbstart:',
      '• /scan ink:<token> — snabb koll',
      '• /scan_plus ink:<token> — extra data + snipers‑rad',
      '• /snipers ink:<token> — tidiga köpare (120s), Top1/Top3, bedömning',
      '• /sniper <adress> — enkel sniper‑profil',
      '• /watch ink:<token> — lägg till bevakning, /my_watchlist — se dina',
      'Obs: Det här är signaler, inte garantier. Handla ansvarsfullt.',
      'Skriv /help en för engelska.',
    ].join('\n');
    return ctx.reply(text);
  });

  bot.command('help', async ctx => {
    try { const { botMetrics } = await import('../../src/metrics.js'); botMetrics.bot_requests_total++; } catch {}
    const lang = (ctx.match || '').trim().toLowerCase();
    const sv = [
      'Kommandon:',
      '/scan ink:<token> — snabb riskbild',
      '/scan_plus ink:<token> — mer data + “Snipers: …”',
      '/snipers ink:<token> — fönster 120s: unika köpare, Top1/Top3, nivå',
      '/sniper <adress> — senaste early‑window‑träffar',
      '/watch ink:<token>, /unwatch ink:<token>, /my_watchlist',
      'Tips: Om resultat saknas visas “insufficient data”.',
      'Ansvarsfriskrivning: Detta är signaler, inte råd.',
    ].join('\n');
    const en = [
      'Commands:',
      '/scan ink:<token> — quick risk view',
      '/scan_plus ink:<token> — extra data + “Snipers: …”',
      '/snipers ink:<token> — first 120s buyers, Top1/Top3, level',
      '/sniper <address> — simple sniper profile',
      '/watch ink:<token>, /unwatch ink:<token>, /my_watchlist',
      'Note: Results are signals, not guarantees. Trade responsibly.',
    ].join('\n');
    const text = lang === 'en' ? en : sv + '\n(Skriv /help en för engelska.)';
    return ctx.reply(text);
  });

  // /signals_now — admin only; computes and posts top 5, env-gated
  bot.command('signals_now', async (ctx) => {
    const enabled = process.env.SIGNALS_BROADCAST_ENABLED === 'true';
    if (!enabled) return ctx.reply('Signals broadcast disabled.');
    const adminId = Number(process.env.ADMIN_CHAT_ID || '');
    if (!adminId || ctx.from?.id !== adminId) return ctx.reply('Unauthorized.');
      try {
        const sigs = await computeTopSignals(5);
        if (!Array.isArray(sigs) || sigs.length === 0) {
          await ctx.reply('No signals right now.');
          return;
        }
        const first = sigs[0]?.attestationId || '';
        await maybePostSignals({ sendMessage: (chatId, text, opts) => ctx.api.sendMessage(chatId, text, opts) }, ctx.chat!.id, sigs, async (s) => {
        const q = whyQuiet(new Date(), { admin: true });
        if (q) {
          await ctx.reply(q === 'muted' ? 'Broadcast muted.' : 'Quiet hours active.');
          return;
        }
        try {
          const { allow } = await shouldAllowByPartnerList(s.pair.symbol, s.pair.address);
          if (!allow) return;
        } catch {}
        const dec = await shouldPost(Date.now(), { admin: true });
        notePostDecision(dec);
        if (!dec.allow) {
          try { console.log(JSON.stringify({ at: 'signals.post.denied', cmd: '/signals_now', reason: dec.reason, hour_used: dec.hour_used, day_used: dec.day_used, wait_ms: dec.wait_ms, attestationId: s.attestationId })); } catch {}
          return;
        }
        const scanCb = await putCb(`full|${s.pair.chain}|${s.pair.address}`);
        const watchCb = await putCb(`alert|${s.pair.chain}|${s.pair.address}`);
        const shareCb = await putCb(`share|${s.pair.chain}|${s.pair.address}`);
          const vol5m = Math.round(Number((s as any)?.metrics?.vol5m ?? 0));
          const price15mPct = Number((s as any)?.metrics?.price15m ?? 0);
          const maker5m = Number((s as any)?.metrics?.maker5m ?? 0);
          const body = [
            `📡 Signal: ${escapeMD((s as any)?.pair?.symbol || (s as any)?.pair?.address?.slice(0,6)+'…')} — score ${(s as any)?.score ?? 0}`,
            `vol5m=${isFinite(vol5m)?vol5m:0}  price15m=${isFinite(price15mPct)?price15mPct.toFixed(2):'0.00'}%  maker5m=${isFinite(maker5m)?maker5m.toFixed(3):'0.000'}`,
            `attestationId=${(s as any)?.attestationId || ''}`,
          ].join('\n');
        const kb = new InlineKeyboard().text('🔍 Scan', scanCb).text('🔔 Watch', watchCb).text('📰 Share', shareCb);
        await ctx.api.sendMessage(ctx.chat!.id, body, { parse_mode: 'Markdown', reply_markup: kb });
      });
      try { const { getOrCreateRequestId, logHttpJson } = await import('../../src/observability/request_id.js'); const rid = getOrCreateRequestId({} as any, {} as any); logHttpJson({ reqId: rid, method: 'BOT', route: '/signals_now', status: 200, ms: 0 }); } catch {}
      await ctx.reply(`Posted ${sigs.length} signals.`);
    } catch { await ctx.reply('Error.'); }
  });

  // /signals_auto — admin toggle in-memory; optional Redis later
  const autoState = { on: false, id: 0 as any };
  bot.command('signals_auto', async (ctx) => {
    const enabled = process.env.SIGNALS_BROADCAST_ENABLED === 'true';
    if (!enabled) return ctx.reply('Signals broadcast disabled.');
    const adminId = Number(process.env.ADMIN_CHAT_ID || '');
    if (!adminId || ctx.from?.id !== adminId) return ctx.reply('Unauthorized.');
    const ms = Math.max(1000, Number(process.env.SIGNALS_POLL_MS ?? 5000)) * 3;
    if (autoState.on) { clearInterval(autoState.id); autoState.on = false; return ctx.reply('Signals auto: OFF'); }
    autoState.on = true;
    autoState.id = setInterval(async () => {
      try {
        const sigs = await computeTopSignals(5);
        await maybePostSignals({ sendMessage: (chatId, text) => ctx.api.sendMessage(chatId, text) }, ctx.chat!.id, sigs);
      } catch {}
    }, ms);
    return ctx.reply('Signals auto: ON');
  });

  bot.command('scan', async ctx => {
    const q = ctx.match?.trim();
    if (!q) return ctx.reply('Usage: /scan <token|contract>');
    // Shortener denylist for URLs in chat
    if (isProbablyUrl(q) && isShortener(q)) {
      return ctx.reply('For safety, URL shorteners are blocked. Please paste the final destination URL.');
    }
    // default-to-ink when no chain prefix
    const hasPrefix = /^(eth|ink|bsc|arb|op|base|avax|ftm|sol):/i.test(q);
    const qNorm = hasPrefix ? q : `ink:${q}`;
    const res = await scanToken(qNorm);
    if (res.status === 'error') return ctx.reply(`Error: ${escapeMD(res.message)}`);
    if (res.status === 'not_found') return ctx.reply('No results. Try a full contract address.');
    if (res.status === 'ambiguous') {
      const kb = new InlineKeyboard();
      for (const s of res.suggestions) {
        kb.text(`${s.label}`, `pick:${s.chain}:${s.address}`).row();
      }
      return ctx.reply(['Multiple matches found:', res.hint].join('\n'), { reply_markup: kb });
    }
    const demo = process.env.DEMO_MODE === 'true' ? ' _(demo)_':'';
    const head = `🧪 Rug Scan for *${escapeMD(maybeMask(res.query) || '')}*${demo}`;
    const rows = res.items.map(it => `${badge(it.score)} *${escapeMD(it.chain)}* — score *${it.score}* — holders: ${it.holders??'—'}\n${fmtFlags(it.flags)}`).join('\n\n');
    const cons = res.consensus ? `\n\nConsensus: *${res.consensus.score}* → ${res.consensus.decision.toUpperCase()}\n${fmtFlags(res.consensus.notes)}` : '';
    const body = [head, rows, cons].filter(Boolean).join('\n');
    // Inline quick-actions
    const chain0 = res.items[0]?.chain;
    const addr0 = res.items[0]?.address;
    const fullCb = await putCb(`full|${chain0}|${addr0}`);
    const traceCb = await putCb(`trace|${chain0}|${addr0}|`);
    const alertCb = await putCb(`alert|${chain0}|${addr0}`);
    const guardCb = await putCb(`guard|${chain0}|${addr0}`);
    const kb = new InlineKeyboard()
      .text('📊 Full report', fullCb)
      .text('🧭 Trace deployer', traceCb)
      .text('🔔 Alert me', alertCb)
      .row()
      .text('🛡️ Swap (guarded)', guardCb)
      .text('📰 Share', await putCb(`share|${chain0}|${addr0}`));
    return ctx.reply(body, { parse_mode: 'Markdown', reply_markup: kb });
  });

  // List and unsubscribe
  bot.command('my_alerts', async (ctx) => {
    const subs = await listSubs(ctx.chat!.id);
    if (!subs.length) return ctx.reply('You have no active alerts.');
    const kb = new InlineKeyboard();
    for (const s of subs) kb.text(`🔕 ${s.chain}:${s.token}`, `unsub:${s.chain}:${s.token}`).row();
    return ctx.reply('Your alerts:', { reply_markup: kb });
  });

  // Enriched scan variant
  bot.command('scan_plus', async ctx => {
    const q = ctx.match?.trim();
    if (!q) return ctx.reply('Usage: /scan_plus <token|contract>');
    const res = await scanToken(q);
    if (res.status !== 'ok') return ctx.reply('Not found or ambiguous. Try /scan first.');
    const demo = process.env.DEMO_MODE === 'true' ? ' _(demo)_':'';
    const bits: string[] = [];
    bits.push(`🧪 Rug Scan+ for *${escapeMD(res.query)}*${demo}`);
    for (const it of res.items.slice(0,3)) {
      const enr = await enrichToken(it.chain, it.address);
      const price = enr.price?.change24h!=null ? `, 24h ${enr.price.change24h>=0?'+' : ''}${enr.price.change24h}%` : '';
      const meta = enr.contract?.createdAt ? ` — created ${new Date(enr.contract.createdAt).toISOString().slice(0,10)} by ${(enr.contract.deployer||'—').slice(0,10)}…` : '';
      bits.push(`${badge(it.score)} *${escapeMD(it.chain)}* — score *${it.score}* — holders: ${it.holders??'—'}${price}${meta}`);
      const topTrades = (enr.trades||[]).slice(0,3).map(t=>`${t.side==='buy'?'🟢':'🔴'} $${(t.amountUsd??0).toLocaleString()}`).join('  ');
      if (topTrades) bits.push(`  trades: ${topTrades}`);
      bits.push(fmtFlags(it.flags));
      // Inject Snipers line (graceful degradation)
      try {
        const win = await fetchEarlyWindow(it.chain, it.address, enr.price?.pair);
        if (win.dataStatus === 'ok') {
          const { summary } = scoreEarlyWindow(win);
          bits.push(`Snipers: ${summary.level} • Top1=${summary.top1Pct}% | Top3=${summary.top3Pct}%`);
        } else {
          bits.push(`Snipers: unknown (insufficient data)`);
        }
      } catch {
        bits.push(`Snipers: unknown (insufficient data)`);
      }
    }
    if (res.consensus) bits.push(`\nConsensus: *${res.consensus.score}* → ${res.consensus.decision.toUpperCase()}\n${fmtFlags(res.consensus.notes)}`);
    return ctx.reply(bits.join('\n'), { parse_mode: 'Markdown' });
  });

  // Rate limiting for sniper commands is applied via global guard in index.ts

  // /snipers <tokenOrAddress>
  bot.command('snipers', async (ctx) => {
    try { const { botMetrics } = await import('../../src/metrics.js'); botMetrics.bot_requests_total++; botMetrics.snipers_requests_total++; } catch {}
    const q = ctx.match?.trim();
    if (!q) return ctx.reply('Usage: /snipers <token|contract>');
    // default-to-ink when no chain prefix
    const hasPrefix = /^(eth|ink|bsc|arb|op|base|avax|ftm|sol):/i.test(q);
    const qNorm = hasPrefix ? q : `ink:${q}`;
    const res = await scanToken(qNorm);
    if (res.status !== 'ok' || !res.items.length) return ctx.reply('Not found or ambiguous. Try /scan first.');
    const it = res.items[0];
    try {
      const win = await fetchEarlyWindow(it.chain, it.address, undefined);
      const windowSec = Math.round(win.windowMs / 1000);
      if (win.dataStatus !== 'ok') {
        try { const { botMetrics } = await import('../../src/metrics.js'); botMetrics.snipers_insufficient_total++; } catch {}
        return ctx.reply([`Early Sniper Check (${windowSec}s)`, 'Data: insufficient (no early trades or T0)'].join('\n'));
      }
      const { summary, events } = scoreEarlyWindow(win);
      // Optional: record top participants
      for (const e of events.slice(0, 5)) {
        try { await recordSniperEvent(e.buyer, it.address, Date.now()); } catch {}
      }
      const lines: string[] = [];
      lines.push(`Early Sniper Check (${windowSec}s)`);
      lines.push(`• Unique buyers: ${summary.uniqueBuyers}`);
      lines.push(`• Top1: ${summary.top1Pct}% | Top3: ${summary.top3Pct}%`);
      lines.push(`• Assessment: ${summary.level.toUpperCase()}`);
      if (summary.botting) lines.push(`Botting: ${summary.botting.toUpperCase()}`);
      return ctx.reply(lines.join('\n'));
    } catch {
      const windowSec = Math.round((Number(process.env.SNIPER_T_SECONDS ?? 120)));
      try { const { botMetrics } = await import('../../src/metrics.js'); botMetrics.snipers_insufficient_total++; } catch {}
      return ctx.reply([`Early Sniper Check (${windowSec}s)`, 'Data: insufficient (no early trades or T0)'].join('\n'));
    }
  });

  // /sniper <address>
  bot.command('sniper', async (ctx) => {
    try { const { botMetrics } = await import('../../src/metrics.js'); botMetrics.bot_requests_total++; botMetrics.sniper_profile_requests_total++; } catch {}
    const addr = (ctx.match || '').trim();
    if (!addr) return ctx.reply('Usage: /sniper <address>');
    const p = await getSniperProfile(addr);
    if (!p) return ctx.reply('No sniper activity recorded yet (v1)');
    const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : '—');
    const recent = p.recentTokens.slice(-3).map(r => r.token).join(', ');
    const lines = [
      `Sniper Profile ${addr}`,
      `• Snipes (30d): ${p.snipes30d}`,
      `• Recent: ${recent || '—'}`,
      `• First seen: ${iso(p.firstSeen)} | Last seen: ${iso(p.lastSeen)}`,
    ];
    return ctx.reply(lines.join('\n'));
  });

  bot.inlineQuery(/.*/, async (ctx) => {
    const q = ctx.inlineQuery.query.trim();
    const offsetStr = ctx.inlineQuery.offset || '0';
    const offset = Number(offsetStr) || 0;
    if (!q) return ctx.answerInlineQuery([], { cache_time: 1 });
    const res = await scanToken(q);
    if (res.status !== 'ok') return ctx.answerInlineQuery([], { cache_time: 1 });
    const pageSize = 6;
    const page = res.items.slice(offset, offset + pageSize);
    const md = [
      `🧪 Rug Scan: *${escapeMD(res.query)}*`,
      ...page.map(i=>`${badge(i.score)} ${escapeMD(i.chain)} — score *${i.score}* — holders: ${i.holders??'—'}`)
    ].join('\n');
    const results: any[] = [
      {
        type: 'article',
        id: `scan-${offset}`,
        title: `Rug Scan: ${res.query} (${offset+1}-${Math.min(offset+pageSize, res.items.length)}/${res.items.length})`,
        description: page.map(i=>`${i.chain}:${i.score}`).join('  '),
        input_message_content: { message_text: md, parse_mode: 'Markdown' }
      }
    ];
    const next = offset + pageSize < res.items.length ? String(offset + pageSize) : '';
    return ctx.answerInlineQuery(results, { cache_time: 3, next_offset: next });
  });

  // Callback: user picked a specific chain/address
  bot.callbackQuery(/^pick:/, async (ctx) => {
    try {
      const data = ctx.callbackQuery.data || '';
      const [, chain, address] = data.split(':');
      const q = `${address}`;
      const res = await scanTokenExact(q, { chain, address });
      if (res.status !== 'ok') {
        await ctx.answerCallbackQuery({ text: 'Not found or error.' });
        return;
      }
      const demo = process.env.DEMO_MODE === 'true' ? ' _(demo)_':'';
      const head = `🧪 Rug Scan for *${escapeMD(address)}* on *${escapeMD(chain)}*${demo}`;
      const rows = res.items.map(it => `${badge(it.score)} *${escapeMD(it.chain)}* — score *${it.score}* — holders: ${it.holders??'—'}\n${fmtFlags(it.flags)}`).join('\n\n');
      const cons = res.consensus ? `\n\nConsensus: *${res.consensus.score}* → ${res.consensus.decision.toUpperCase()}\n${fmtFlags(res.consensus.notes)}` : '';
      const body = [head, rows, cons].filter(Boolean).join('\n');
      const chain0 = res.items[0]?.chain;
      const addr0 = res.items[0]?.address;
      const fullCb = await putCb(`full|${chain0}|${addr0}`);
      const traceCb = await putCb(`trace|${chain0}|${addr0}|`);
      const alertCb = await putCb(`alert|${chain0}|${addr0}`);
      const guardCb = await putCb(`guard|${chain0}|${addr0}`);
      const kb = new InlineKeyboard()
        .text('📊 Full report', fullCb)
        .text('🧭 Trace deployer', traceCb)
        .text('🔔 Alert me', alertCb)
        .row()
        .text('🛡️ Swap (guarded)', guardCb)
        .text('📰 Share', await putCb(`share|${chain0}|${addr0}`));
      await ctx.editMessageText(body, { parse_mode: 'Markdown', reply_markup: kb });
      await ctx.answerCallbackQuery();
    } catch {
      await ctx.answerCallbackQuery({ text: 'Error.' });
    }
  });

  // Quick-action handlers
  bot.on('callback_query:data', async (ctx) => {
    try {
      const raw = await getCb(ctx.callbackQuery.data || '');
      if (!raw) { await ctx.answerCallbackQuery({ text: 'Expired. Please retry.' }); return; }
      const [kind, chain, token, extra] = raw.split('|');
      const chatId = ctx.chat!.id;
      if (kind === 'full') {
        const { scanTokenExact } = await import('./scan.js');
        const res = await scanTokenExact(token, { chain, address: token });
        if (res.status !== 'ok') return ctx.answerCallbackQuery({ text: 'Not found.' });
        const head = `🧪 Rug Scan+ for ${token} on ${chain}`;
        const rows = res.items.map(it => `${it.chain} — score ${it.score} — holders: ${it.holders??'—'}`).join('\n');
        await ctx.api.sendMessage(chatId, [head, rows].join('\n'));
        return ctx.answerCallbackQuery();
      }
      if (kind === 'trace') {
        const dep = extra || '';
        if (!dep) return ctx.answerCallbackQuery({ text: 'Deployer unknown.' });
        await ctx.api.sendMessage(chatId, `Tracing ${dep}…`);
        return ctx.answerCallbackQuery();
      }
      if (kind === 'alert') {
        const { subscribe } = await import('./alerts_sub.js');
        try {
          await subscribe(chatId, { chain, token });
          await ctx.answerCallbackQuery({ text: 'Subscribed. I’ll DM you on significant risk changes.' });
        } catch {
          await ctx.answerCallbackQuery({ text: 'Subscription failed (no Redis?)' });
        }
        return;
      }
      if (kind === 'unsub') {
        await unsubscribe(chatId, { chain, token });
        await ctx.answerCallbackQuery({ text: 'Unsubscribed.' });
        return;
      }
      if (kind === 'share') {
        const { scanTokenExact } = await import('./scan.js');
        const res = await scanTokenExact(token, { chain, address: token });
        if (res.status !== 'ok' || !res.items.length) return ctx.answerCallbackQuery({ text: 'Not found.' });
        const it = res.items[0];
        const msg = formatCompactCard({ chain: it.chain, address: it.address, score: it.score, holders: it.holders ?? null });
        await ctx.api.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        return ctx.answerCallbackQuery();
      }
      if (kind === 'guard') {
        const advice = await estimateSwapGuard(chain, token, {});
        const msg = formatGuardAdviceMessage(advice);
        await ctx.api.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        return ctx.answerCallbackQuery();
      }
    } catch {}
  });

  // Pagination for ambiguity keyboard (when > 6 matches)
  bot.callbackQuery(/^ambig:/, async (ctx) => {
    try {
      const data = ctx.callbackQuery.data || '';
      // ambig:<query>:<page>
      const [, qRaw, pRaw] = data.split(':');
      const query = qRaw;
      const page = Number(pRaw) || 0;
      const res = await scanToken(query);
      if (res.status !== 'ambiguous') {
        await ctx.answerCallbackQuery({ text: 'Resolved/changed.' });
        return;
      }
      const pageSize = 6;
      const start = page * pageSize;
      const sug = res.suggestions.slice(start, start + pageSize);
      const kb = new InlineKeyboard();
      for (const s of sug) kb.text(`${s.label}`, `pick:${s.chain}:${s.address}`).row();
      const totalPages = Math.ceil(res.suggestions.length / pageSize);
      const prev = page > 0 ? page - 1 : null;
      const next = page + 1 < totalPages ? page + 1 : null;
      if (prev !== null) kb.text('⬅️ Prev', `ambig:${query}:${prev}`);
      if (next !== null) kb.text('Next ➡️', `ambig:${query}:${next}`);
      await ctx.editMessageText(['Multiple matches found:', res.hint].join('\n'), { reply_markup: kb });
      await ctx.answerCallbackQuery();
    } catch {
      await ctx.answerCallbackQuery({ text: 'Error.' });
    }
  });

  // Placeholder for wallet tracing and recent rugs; implemented in index wiring
  // /revoke_last <wallet>
  bot.command('revoke_last', async (ctx) => {
    const w = ctx.match?.trim();
    if (!w) return ctx.reply('Usage: /revoke_last <wallet>');
    const approvals = await getRecentApprovals('ink', w, 5);
    const text = formatRevokeList('ink', w, approvals);
    return ctx.reply(text, { parse_mode: 'Markdown' });
  });

  // /top_ink — list top Ink pairs with quick buttons
  bot.command('top_ink', async ctx => {
    const page = Math.max(0, Number((ctx.match||'').trim()) || 0);
    const pageSize = 6;
    const pairs = getTopInkDemoPairs();
    const start = page*pageSize;
    const pagePairs = pairs.slice(start, start+pageSize);
    const lines = [`🏆 Top Ink pairs (demo) — ${start+1}-${start+pagePairs.length}/${pairs.length}`];
    const kb = new InlineKeyboard();
    for (const p of pagePairs) {
      const scanCb = await putCb(`full|ink|${p.address}`);
      const watchCb = await putCb(`alert|ink|${p.address}`);
      lines.push(`• ${p.symbol} — 24h ${p.change24h>=0?'+':''}${p.change24h}% — vol $${p.vol24h.toLocaleString()}`);
      kb.text('🔍 Scan', scanCb).text('🔔 Watch', watchCb).row();
    }
    const prev = page>0 ? page-1 : null;
    const next = start+pageSize < pairs.length ? page+1 : null;
    if (prev!==null) kb.text('⬅️ Prev', `topink:${prev}`);
    if (next!==null) kb.text('Next ➡️', `topink:${next}`);
    return ctx.reply(lines.join('\n'), { reply_markup: kb });
  });

  // Pagination handler for /top_ink
  bot.callbackQuery(/^topink:/, async (ctx) => {
    const pRaw = (ctx.callbackQuery.data||'').split(':')[1] || '0';
    const page = Math.max(0, Number(pRaw) || 0);
    ctx.match = String(page) as any;
    await bot.handleUpdate({ ...ctx.update, message: { ...(ctx.msg as any), text: `/top_ink ${page}` } } as any);
    await ctx.answerCallbackQuery();
  });
}

// Exported for tests
export function normalizeToInk(q: string): string {
  const hasPrefix = /^(eth|ink|bsc|arb|op|base|avax|ftm|sol):/i.test(q);
  return hasPrefix ? q : `ink:${q}`;
}

export type TopInkPair = { symbol: string; address: string; change24h: number; vol24h: number };
export function getTopInkDemoPairs(): TopInkPair[] {
  // Offline-safe deterministic demo list of pairs
  return Array.from({ length: 18 }).map((_,i)=>({
    symbol: `INK${i+1}/USDC`,
    address: `0xdeadbeefdeadbeefdeadbeefdeadbeef${(i+1).toString(16).padStart(2,'0')}`,
    change24h: ((i*7)%40) - 20,
    vol24h: 10000 + i*1337,
  }));
}

export function formatTopInkPage(page: number): { text: string; count: number } {
  const pageSize = 6;
  const pairs = getTopInkDemoPairs();
  const start = Math.max(0, page|0) * pageSize;
  const pagePairs = pairs.slice(start, start + pageSize);
  const lines = [`🏆 Top Ink pairs (demo) — ${start+1}-${start+pagePairs.length}/${pairs.length}`];
  for (const p of pagePairs) {
    lines.push(`• ${p.symbol} — 24h ${p.change24h>=0?'+':''}${p.change24h}% — vol $${p.vol24h.toLocaleString()}`);
  }
  return { text: lines.join('\n'), count: pagePairs.length };
}

export function formatCompactCard(o: { chain: string; address: string; score: number; holders: number|null }): string {
  const { chain, address, score, holders } = o;
  const head = `🔗 ${escapeMD(chain)} — score *${score}* — holders ${holders??'—'}`;
  const body = `
${address.slice(0,8)}…  •  [Explorer](${buildExplorerLink(chain, address)})`;
  return head + body;
}

export function formatRevokeList(chain: string, wallet: string, items: Array<{ token: string; spender: string; allowance: string; tx?: string }>): string {
  const head = `🔏 Recent approvals (${chain==='ink'?'Ink':chain})`;
  const lines = items.map((it, idx) => `${idx+1}) ${it.token} → ${it.spender}  • allowance: ${it.allowance}  • [Explorer](${buildExplorerLink(chain, it.tx||it.spender)})`);
  const why = `Why revoke? Reduces risk if a spender is compromised or malicious.\nTip: Revoke only what you recognize; small gas fees apply.`;
  return [head, ...lines, why].join('\n');
}

function buildExplorerLink(chain: string, ref: string): string {
  if (chain==='ink') return `https://explorer.inkonchain.com/address/${encodeURIComponent(ref)}`;
  return `https://example.com/${encodeURIComponent(ref)}`;
}


// Minimal handler factories for tests (no business logic changes). Production uses bot.command above.
export function createSnipersHandler(deps: {
  scanToken: (q: string) => Promise<any>;
  fetchEarlyWindow: (chain: string, token: string, pair?: string) => Promise<any>;
  scoreEarlyWindow: (win: any) => { summary: { level: string; uniqueBuyers: number; top1Pct: number; top3Pct: number; botting?: string } };
  rlAllow?: () => boolean;
}) {
  const { scanToken, fetchEarlyWindow, scoreEarlyWindow, rlAllow } = deps;
  return async function handle(ctx: any) {
    if (rlAllow && !rlAllow()) return; // simulate RL wrapper
    const q = ctx.match?.trim();
    if (!q) return ctx.reply('Usage: /snipers <token|contract>');
    const hasPrefix = /^(eth|ink|bsc|arb|op|base|avax|ftm|sol):/i.test(q);
    const qNorm = hasPrefix ? q : `ink:${q}`;
    const res = await scanToken(qNorm);
    if (res.status !== 'ok' || !res.items.length) return ctx.reply('Not found or ambiguous. Try /scan first.');
    const it = res.items[0];
    try {
      const win = await fetchEarlyWindow(it.chain, it.address, undefined);
      const windowSec = Math.round(win.windowMs / 1000);
      if (win.dataStatus !== 'ok') {
        return ctx.reply([`Early Sniper Check (${windowSec}s)`, 'Data: insufficient (no early trades or T0)'].join('\n'));
      }
      const { summary, events } = scoreEarlyWindow(win) as any;
      const lines: string[] = [];
      lines.push(`Early Sniper Check (${windowSec}s)`);
      lines.push(`• Unique buyers: ${summary.uniqueBuyers}`);
      lines.push(`• Top1: ${summary.top1Pct}% | Top3: ${summary.top3Pct}%`);
      lines.push(`• Assessment: ${String(summary.level).toUpperCase()}`);
      if (summary.botting) lines.push(`Botting: ${String(summary.botting).toUpperCase()}`);
      return ctx.reply(lines.join('\n'));
    } catch {
      const windowSec = Math.round((Number(process.env.SNIPER_T_SECONDS ?? 120)));
      return ctx.reply([`Early Sniper Check (${windowSec}s)`, 'Data: insufficient (no early trades or T0)'].join('\n'));
    }
  };
}

export function createSniperHandler(deps: {
  getSniperProfile: (addr: string) => Promise<any | undefined>;
  rlAllow?: () => boolean;
}) {
  const { getSniperProfile, rlAllow } = deps;
  return async function handle(ctx: any) {
    if (rlAllow && !rlAllow()) return;
    const addr = (ctx.match || '').trim();
    if (!addr) return ctx.reply('Usage: /sniper <address>');
    const p = await getSniperProfile(addr);
    if (!p) return ctx.reply('No sniper activity recorded yet (v1)');
    const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : '—');
    const recent = (p.recentTokens || []).slice(-3).map((r: any) => r.token).join(', ');
    const lines = [
      `Sniper Profile ${addr}`,
      `• Snipes (30d): ${p.snipes30d}`,
      `• Recent: ${recent || '—'}`,
      `• First seen: ${iso(p.firstSeen)} | Last seen: ${iso(p.lastSeen)}`,
    ];
    return ctx.reply(lines.join('\n'));
  };
}

