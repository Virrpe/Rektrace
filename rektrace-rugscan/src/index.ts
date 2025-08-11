import fs from 'node:fs';
import dotenv from 'dotenv';
if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' }); else dotenv.config();
import { Bot } from 'grammy';
import { registerRugScan } from './commands.js';
import { registerPreflight } from '../../src/preflight.js';
// SLO breaker hits are recorded at provider layer via metrics/breakers
import { startHealthServer } from '../../src/health.js';
import { adFormHelp, createAd, requestPaymentText, getAd, handlePaid, runVetting, parseAdForm } from '../../src/ads.js';
import type { Context, NextFunction } from 'grammy';
import { bumpScanCacheVersion } from './scan.js';
import { breakers } from '../../src/providers.js';
import { getProviderMetrics } from '../../src/metrics.js';
import { buildStatusBody } from './status_util.js';
import { enrichToken } from './enrich.js';
import { getRecent } from './track_recent.js';
import { AlertThrottler } from './alerts/throttler.js';
import { startHealthServer as startBaseHealth } from '../../src/health.js';
import { bootstrapSignalsCompute, computeTopSignals } from '../../src/signals/compute.js';
import { startSignalsPoller } from '../../src/signals/poller.js';
import { fetchAttestation } from '../../src/signals/attest.js';
import { withHmacGate } from '../../src/security/hmac_gate.js';
import { globalBucket } from './rate_limit.js';
import { isShortener } from './url.js';
import { runAlertsPass, getAlertsStats } from './alerts/checker.js';
import { withSecurityHeaders, withJsonOnly, withValidatedScan, withRateLimit } from '../../src/security/wrap.js';
import { applySecurityHeaders } from '../../src/security/guardrails.js';
import { checkIdempotency } from '../../src/security/idempotency.js';
import { validateScanResponse, maskInvariantErrors } from '../../src/contracts/invariants.js';
import { recordLatency, recordError, snapshotSLO, recordRoute, snapshotRoutes } from '../../src/observability/slo.js';
import { configFingerprint } from '../../src/observability/fingerprint.js';
import { startAlertLoop } from '../../src/observability/alerts.js';
import { startAutoGuard, autoGuardState, maybeDenyHeavyScan, maybeForceStub } from '../../src/security/auto_guard.js';
import { startBudgetGuard } from '../../src/observability/budget_guard.js';
import { startRulesReload, ruleDecision } from '../../src/security/rules.js';
import { maybeMask } from '../../src/security/log_mask.js';
import { getPref, setPref, listSubs, subscribe, unsubscribe } from './alerts_sub.js';
import { allowAction } from '../../src/security/cooldown.js';
import { currentVersion } from './version.js';

const IS_TEST = !!process.env.VITEST_WORKER_ID || process.env.NODE_ENV === 'test';
let token = process.env.TELEGRAM_BOT_TOKEN || '';
if (!token && (IS_TEST || process.env.HTTP_ONLY === 'true')) token = 'TEST_TOKEN';
if (!token && process.env.HTTP_ONLY !== 'true') throw new Error('Missing TELEGRAM_BOT_TOKEN');

const bot = new Bot(token);
registerPreflight(bot);
registerRugScan(bot);

// --- Wallet tracing: /trace <wallet>
import { traceWallet } from './wallet_trace.js';

bot.command('trace', async (ctx) => {
  const key = `trace:${ctx.chat?.id}:${ctx.from?.id}`;
  if (!allowAction(key)) { await ctx.reply('Please slow down a bit.'); return; }
  if (!globalBucket.tryRemove()) {
    await ctx.reply('I’m a bit busy right now. Please try again in a few seconds. (global rate limit)');
    return;
  }
  const w = ctx.match?.trim();
  if (!w) return ctx.reply('Usage: /trace <wallet>');
  const tr = await traceWallet(w);
  const demo = process.env.DEMO_MODE === 'true' ? ' _(demo)_':'';
  const lines: string[] = [`🧭 Wallet Trace for ${tr.wallet} on ${tr.chain}${demo}`];
  if (tr.related.length) {
    lines.push('Related wallets:');
    lines.push(...tr.related.slice(0,5).map(r=>`• ${r.address.slice(0,8)}… ×${r.count}`));
  } else {
    lines.push('Related wallets: —');
  }
  if (tr.lpEvents && tr.lpEvents > 0) lines.push(`LP events: ${tr.lpEvents}`);
  return ctx.reply(lines.join('\n'));
});

// --- Recent rugs: /recent_rugs (pull last 20 low-score tokens observed)
bot.command('recent_rugs', async (ctx) => {
  const key = `recent:${ctx.chat?.id}:${ctx.from?.id}`;
  if (!allowAction(key)) { await ctx.reply('Please slow down a bit.'); return; }
  if (!globalBucket.tryRemove()) {
    await ctx.reply('I’m a bit busy right now. Please try again in a few seconds. (global rate limit)');
    return;
  }
  const items = getRecent().filter(x=>x.score < 40).slice(0,20);
  if (!items.length) return ctx.reply('No recent rugs observed.');
  const body = ['🧨 Recent rugs (last 20 low scores):', ...items.map(i=>`${i.chain}:${i.address.slice(0,8)}… — score ${i.score}`)].join('\n');
  return ctx.reply(body);
});

// Preserve ad module commands
bot.command('advertise', async (ctx) => {
  const key = `advertise:${ctx.chat?.id}:${ctx.from?.id}`;
  if (!allowAction(key)) { await ctx.reply('Please slow down a bit.'); return; }
  if (!globalBucket.tryRemove()) { await ctx.reply('I’m a bit busy right now. Please try again in a few seconds. (global rate limit)'); return; }
  await ctx.reply(adFormHelp(), { parse_mode: 'Markdown' });
});

bot.command('ad_submit', async (ctx) => {
  const key = `ad_submit:${ctx.chat?.id}:${ctx.from?.id}`;
  if (!allowAction(key)) { await ctx.reply('Please slow down a bit.'); return; }
  if (!globalBucket.tryRemove()) { await ctx.reply('I’m a bit busy right now. Please try again in a few seconds. (global rate limit)'); return; }
  const body = ctx.match?.trim();
  if (!body) return ctx.reply('Send your ad form in the message: /ad_submit <lines>');
  const parsed = parseAdForm(body);
  if (!parsed) return ctx.reply('Invalid format. Use /advertise for the 5-line template.');
  const ad = await createAd({ userId: ctx.from!.id, ...parsed, wallet: undefined });
  const payText = await requestPaymentText(ad);
  await ctx.reply(['Ad received as draft. Payment required to start vetting.','', payText].join('\n'), { parse_mode: 'Markdown' });
});

bot.command('paid', async (ctx) => {
  const key = `paid:${ctx.chat?.id}:${ctx.from?.id}`;
  if (!allowAction(key)) { await ctx.reply('Please slow down a bit.'); return; }
  if (!globalBucket.tryRemove()) { await ctx.reply('I’m a bit busy right now. Please try again in a few seconds. (global rate limit)'); return; }
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

bot.command('ad_terms', (ctx) => ctx.reply(
  [
    'Paid placements are auto‑scanned; not endorsements.',
    'Domains must be HTTPS and ≥30 days old (or manual review).',
    'No shorteners, no guaranteed profit claims.',
    'Refunds: rejections refunded minus 10% review fee; removals for policy breaches are not refunded.',
    'INK payments supported (Kraken L2). Rekt currency support coming later this year.'
  ].join('\n')
));

// --- Simple per-user rate limiting for /scan ---
const RATE_WINDOW_MS = 10_000;
const RATE_PER_USER = 5;
const userHits = new Map<number, number[]>();
async function scanGuard(ctx: Context, next: NextFunction) {
  if (ctx.msg?.text?.startsWith('/scan')) {
    const uid = ctx.from?.id;
    if (uid) {
      const now = Date.now();
      const arr = userHits.get(uid) || [];
      const recent = arr.filter(ts => now - ts < RATE_WINDOW_MS);
      if (recent.length >= RATE_PER_USER) {
        await ctx.reply('Rate limit: try again in a few seconds.');
        return;
      }
      recent.push(now);
      userHits.set(uid, recent);
    }
  }
  await next();
}
bot.use(scanGuard);

// --- Admin cache-buster ---
bot.command('scan_cache_bust', async (ctx) => {
  const adminId = Number(process.env.ADMIN_CHAT_ID || '');
  if (!adminId || ctx.from?.id !== adminId) return ctx.reply('Unauthorized.');
  const v = await bumpScanCacheVersion();
  return ctx.reply(`RugScan cache version bumped to ${v}.`);
});

// --- Status command (breaker states) ---
bot.command('status', (ctx) => {
  const body = buildStatusBody();
  ctx.reply(body, { parse_mode: 'Markdown' });
});

// --- Admin alerts toggle ---
const adminAlerts = new Set<number>();
bot.command('alerts', (ctx) => {
  const adminId = Number(process.env.ADMIN_CHAT_ID || '');
  if (!adminId || ctx.from?.id !== adminId) return ctx.reply('Unauthorized.');
  if (adminAlerts.has(adminId)) { adminAlerts.delete(adminId); ctx.reply('Alerts: OFF'); }
  else { adminAlerts.add(adminId); ctx.reply('Alerts: ON'); }
});

// --- Optional: alert admin on breaker open events with throttle ---
const ADMIN_ID = Number(process.env.ADMIN_CHAT_ID || '');
const ALERT_THROTTLE_MIN = Math.max(1, Number(process.env.ALERT_THROTTLE_MIN || 10));
const ALERT_INTERVAL_MS = (!!process.env.VITEST_WORKER_ID || process.env.NODE_ENV === 'test') ? 50 : 15000;
const adminThrottle = new AlertThrottler(() => ALERT_THROTTLE_MIN * 60_000);
if (ADMIN_ID) {
  const lastState = new Map<string,string>();
  setInterval(async () => {
    const now = Date.now();
    for (const [name, br] of Object.entries(breakers)) {
      const state = br.state();
      const prev = lastState.get(name);
      const shouldAlert = adminAlerts.has(ADMIN_ID) && prev && prev !== state && state === 'open' && adminThrottle.shouldNotify(name, now);
      if (shouldAlert) {
        try { await bot.api.sendMessage(ADMIN_ID, `Breaker opened: ${name}`); } catch {}
      }
      lastState.set(name, state);
    }
  }, ALERT_INTERVAL_MS);
}

// Extend health server with webhook route
try {
  const portArg: any = IS_TEST ? Number(process.env.HEALTH_PORT || 0) : (undefined as any as number);
  startHealthServer(portArg, async (req, res) => {
  try {
    if (!req.url) return false;
    // API key auth (optional)
    const needAuth = (process.env.API_KEY || '').length > 0;
    const url = new URL(req.url, 'http://localhost');
    const apiKey = req.headers['x-api-key'] || url.searchParams.get('api_key') || '';
    let okKey = !needAuth;
    if (needAuth) {
      try {
        const { ctEqual } = await import('../../src/security/ct_compare.js');
        okKey = ctEqual(String(apiKey), String(process.env.API_KEY || ''));
      } catch {
        okKey = String(apiKey) === String(process.env.API_KEY || '');
      }
    }

    // Apply security headers globally (additive) if enabled
    if (process.env.SECURITY_HEADERS !== 'false') {
      try { applySecurityHeaders(res); } catch {}
    }

    // Global maintenance gate with allowlist
    const path = url.pathname;
    const exemptPaths = new Set<string>(['/health','/healthz','/status','/metrics','/live','/ready']);
    if (process.env.MAINTENANCE_MODE === 'true' && !exemptPaths.has(path)) {
      try { res.writeHead(503, { 'content-type': 'application/json', 'Retry-After': '30' }); res.end(JSON.stringify({ error: 'maintenance' })); } catch {}
      return true;
    }

    // Read-only mode: block state-changing HTTP methods except scan endpoints
    if (process.env.READONLY_MODE === 'true') {
      const method = String(req.method || 'GET').toUpperCase();
      const isStateChanging = ['POST','PUT','PATCH','DELETE'].includes(method);
      const allowed = (path === '/api/scan' && method === 'POST') || (path.startsWith('/api/scan/') && method === 'GET') || exemptPaths.has(path);
      if (isStateChanging && !allowed) {
        try {
          const { getOrCreateRequestId, logHttpJson } = await import('../../src/observability/request_id.js');
          const rid = getOrCreateRequestId(req, res);
          logHttpJson({ reqId: rid, method, route: path, status: 403, ms: 0, outcome: 'readonly_denied' });
        } catch {}
        try { res.writeHead(403, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'read_only_mode', note: 'state changes are temporarily disabled' })); } catch {}
        return true;
      }
    }

    // Liveness endpoint
    if (req.method === 'GET' && url.pathname === '/live') {
      try { const { getOrCreateRequestId } = await import('../../src/observability/request_id.js'); getOrCreateRequestId(req, res); } catch {}
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return true;
    }

    // Readiness endpoint (no external calls)
    if (req.method === 'GET' && url.pathname === '/ready') {
      try {
        const { getOrCreateRequestId, logHttpJson } = await import('../../src/observability/request_id.js');
        const rid = getOrCreateRequestId(req, res);
        let ready = process.env.MAINTENANCE_MODE !== 'true' && process.env.BREAKER_FORCE_OPEN !== 'true';
        try {
          for (const b of Object.values(breakers)) { if (b.state() === 'open') { ready = false; break; } }
        } catch {}
        if (ready) {
          logHttpJson({ reqId: rid, method: 'GET', route: '/ready', status: 200, ms: 0 });
          res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ready');
        } else {
          logHttpJson({ reqId: rid, method: 'GET', route: '/ready', status: 503, ms: 0, outcome: 'not_ready' });
          res.writeHead(503, { 'content-type': 'text/plain', 'Retry-After': '30' }); res.end('not ready');
        }
      } catch {
        try { res.writeHead(503, { 'content-type': 'text/plain', 'Retry-After': '30' }); res.end('not ready'); } catch {}
      }
      return true;
    }

    // GET /status — JSON status; alerts included only with ?verbose=1; include SLO snapshot and request id
    if (req.method === 'GET' && url.pathname === '/status') {
      try { const { getOrCreateRequestId, logHttpJson } = await import('../../src/observability/request_id.js'); const rid = getOrCreateRequestId(req, res); logHttpJson({ reqId: rid, method: 'GET', route: '/status', status: 200, ms: 0 }); } catch {}
      const budgets = {
        providerTimeoutMs: Number(process.env.PROVIDER_TIMEOUT_MS ?? 2500),
        providerRetry: Number(process.env.PROVIDER_RETRY ?? 1),
        scanTtlSec: Number(process.env.SCAN_TTL_SECONDS ?? 120),
        lpTtlSec: Number(process.env.LP_TTL_SECONDS ?? 600),
      };
      const br = Object.fromEntries(Object.entries(breakers).map(([k,b]) => [k, {
        state: b.state(),
        lastTransitionSecAgo: Math.round((Date.now() - b.lastTransitionAt())/1000)
      }]));
      const body: any = { budgets, breakers: br };
      if (url.searchParams.get('verbose') === '1') {
        try { body.slo = snapshotSLO(); } catch {}
        try { body.routes = snapshotRoutes(); } catch {}
        try { body.config = configFingerprint(); } catch {}
        if (process.env.AUTO_GUARD_ENABLED === 'true') { try { body.autoGuard = autoGuardState(); } catch {} }
        const s = getAlertsStats();
        body.alerts = {
          subscribedTokens: s.totalSubscribedTokens,
          nextCheckEtaSec: s.nextRunAt ? Math.max(0, Math.floor((s.nextRunAt - Date.now())/1000)) : null,
        };
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
      try { recordRoute('/status', 0, false); } catch {}
      return true;
    }

    // GET /status/public — additive redacted status + top signals
    if (req.method === 'GET' && url.pathname === '/status/public') {
      const slo = (()=>{ try { return snapshotSLO(); } catch { return null; } })();
      const cfg = (()=>{ try { return configFingerprint(); } catch { return null; } })();
      const sigs = process.env.SIGNALS_ENABLED === 'true' ? await computeTopSignals(5) : [];
      const redacted = sigs.map(s=> ({ symbol: s.pair.symbol || s.pair.address.slice(0,6)+'…', score: s.score, vol_5m: Math.round(s.metrics.vol5m), price_15m: Number(s.metrics.price15m.toFixed(2)), attestationId: s.attestationId }));
      const body = { slo, routesSummary: (()=>{ try { return snapshotRoutes(); } catch { return undefined; } })(), config: cfg, signals: redacted };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
      try { recordRoute('/status', 0, false); } catch {}
      return true;
    }

    // GET /signals/:id/attestation — additive read-only
    if (req.method === 'GET' && url.pathname.startsWith('/signals/') && url.pathname.endsWith('/attestation')) {
      const parts = url.pathname.split('/').filter(Boolean); // [signals, :id, attestation]
      const id = parts[1];
      const a = await fetchAttestation(id);
      if (!a) { res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'not_found' })); return true; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: a.id, sha256: a.sha256, generated_at: a.generated_at }));
      return true;
    }

    // GET /signals — optional partner API, HMAC-gated; full list (not just top 5)
    if (req.method === 'GET' && url.pathname === '/signals') {
      const handler = async (_req: any, _res: any): Promise<boolean> => {
        const sigs = process.env.SIGNALS_ENABLED === 'true' ? await computeTopSignals(50) : [];
        const body = sigs.map(s=> ({ symbol: s.pair.symbol || s.pair.address.slice(0,6)+'…', score: s.score, vol_5m: Math.round(s.metrics.vol5m), price_15m: Number(s.metrics.price15m.toFixed(2)), attestationId: s.attestationId }));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ signals: body }));
        return true;
      };
      const wrapped = withHmacGate(handler);
      return await wrapped(req, res);
    }

    // GET /version — version & provenance
    if (req.method === 'GET' && url.pathname === '/version') {
      try { const { getOrCreateRequestId, logHttpJson } = await import('../../src/observability/request_id.js'); const rid = getOrCreateRequestId(req, res); logHttpJson({ reqId: rid, method: 'GET', route: '/version', status: 200, ms: 0 }); } catch {}
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(currentVersion()));
      return true;
    }

    // GET /.well-known/security.txt — security contact
    if (req.method === 'GET' && url.pathname === '/.well-known/security.txt') {
      const days = 365;
      const exp = new Date(Date.now() + days*24*3600*1000).toISOString().slice(0,10);
      const lines = [
        'Contact: mailto:security@staticmind.xyz',
        'Policy: /SECURITY.md',
        `Expires: ${exp}`,
      ].join('\n');
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(lines);
      return true;
    }

    // POST /api/scan (existing) with security wrappers (env-gated) + optional idempotency + invariants
    if (req.method === 'POST' && url.pathname.startsWith('/api/scan')) {
      const secured = withSecurityHeaders(withRateLimit(withJsonOnly(withValidatedScan(async (_req, res, json) => {
        if (!globalBucket.tryRemove()) { res.writeHead(429, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Rate limit exceeded. Please retry shortly.' })); return true; }
        if (!okKey) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unauthorized' })); return true; }
        // Idempotency (env-gated)
        try {
          const bodyRaw = typeof json === 'object' ? JSON.stringify(json) : '';
          const idem = await checkIdempotency(req.headers['idempotency-key'], bodyRaw);
          if (!idem.ok) { res.writeHead(idem.status, { 'content-type': 'application/json' }); res.end(JSON.stringify(idem.body)); return true; }
        } catch {}
        const token = String(json.token || json.query || '').trim();
        const chain = json.chain ? String(json.chain).toLowerCase() : undefined;
        if (token && isShortener(token)) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Please paste the final destination URL (shorteners are blocked for safety).' })); return true; }
        if (!token) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'token required' })); return true; }
        const q = chain ? `${chain}:${token}` : token;
        // Forced stub path (breaker or budget clamp stub)
        if (maybeForceStub()) {
          const c = (chain || 'ink');
          const stub: any = { status: 'ok', query: q, items: [
            { chain: c, address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', holders: 0, flags: ['breaker:forced_open','stub'], score: 50, sources: ['stub'] }
          ] };
          // Invariants for stub
          try {
            const inv = validateScanResponse(stub);
            if (!inv.ok && process.env.INVARIANTS_STRICT === 'true') {
              res.writeHead(500, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ error: 'invariants_failed', note: maskInvariantErrors(inv.errs) }));
              return true;
            }
          } catch {}
          try {
            const { getOrCreateRequestId, logHttpJson } = await import('../../src/observability/request_id.js');
            const rid = getOrCreateRequestId(req, res);
            logHttpJson({ reqId: rid, method: 'POST', route: '/api/scan', status: 200, ms: 0, outcome: 'breaker_force_open' });
          } catch {}
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(stub));
          return true;
        }
        const { scanToken } = await import('./scan.js');
        const start = Date.now();
        // Rules decision (optional)
        if (process.env.RULES_ENABLED === 'true') {
          const d = ruleDecision({ chain, token, symbol: token });
          if (d === 'deny') { res.writeHead(403, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'forbidden' })); return true; }
          if (d === 'allow') { /* bypass globalBucket */ }
        }
        // Auto-guard heavy deny (optional)
        const mg = maybeDenyHeavyScan();
        if (mg.deny) { res.writeHead(503, { 'content-type': 'application/json', 'Retry-After': String(mg.retryAfter ?? 30) }); res.end(JSON.stringify({ error: 'temporarily unavailable' })); return true; }
        const result = await scanToken(q);
        const dt = Date.now()-start;
        try { recordLatency(dt); } catch {}
        try { recordRoute('/api/scan:POST', dt, (result as any)?.status === 'error'); } catch {}
        try {
          const { getOrCreateRequestId, logHttpJson } = await import('../../src/observability/request_id.js');
          const rid = getOrCreateRequestId(req, res);
          logHttpJson({ reqId: rid, method: 'POST', route: '/api/scan', status: 200, ms: dt, maskedToken: maybeMask(token) });
          if (process.env.JSON_LOGS !== 'true') console.log(`[api] POST /api/scan ${dt}ms token=${maybeMask(token)}`);
        } catch {}
        // Invariants (env-gated strict)
        try {
          const inv = validateScanResponse(result);
          if (!inv.ok) {
            const strict = process.env.INVARIANTS_STRICT === 'true';
            const masked = maskInvariantErrors(inv.errs);
            if (strict) {
              res.writeHead(500, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ error: 'invariants_failed', note: masked }));
              return true;
            } else {
              console.warn(`[invariants] scan POST failed: ${masked}`);
            }
          }
        } catch {}
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
        return true;
      }))));
      return await secured(req, res);
    }

    // GET /api/scan/:chain/:token with optional enrich
    if (req.method === 'GET' && url.pathname.startsWith('/api/scan/')) {
      if (!globalBucket.tryRemove()) { res.writeHead(429, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Rate limit exceeded. Please retry shortly.' })); return true; }
      if (!okKey) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unauthorized' })); return true; }
      const parts = url.pathname.split('/').filter(Boolean); // [api, scan, :chain, :token]
      if (parts.length < 4) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'bad path' })); return true; }
      const chain = decodeURIComponent(parts[2]);
      const token = decodeURIComponent(parts.slice(3).join('/'));
      if (token && isShortener(token)) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Please paste the final destination URL (shorteners are blocked for safety).' })); return true; }
       // Forced stub path (breaker or budget clamp stub)
       if (maybeForceStub()) {
        const stub: any = { status: 'ok', query: token, items: [
          { chain, address: token, holders: 0, flags: ['breaker:forced_open','stub'], score: 50, sources: ['stub'] }
        ] };
        // Invariants for stub
        try {
          const inv = validateScanResponse(stub);
          if (!inv.ok && process.env.INVARIANTS_STRICT === 'true') {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'invariants_failed', note: maskInvariantErrors(inv.errs) }));
            return true;
          }
        } catch {}
        try {
          const { getOrCreateRequestId, logHttpJson } = await import('../../src/observability/request_id.js');
          const rid = getOrCreateRequestId(req, res);
          logHttpJson({ reqId: rid, method: 'GET', route: `/api/scan/${chain}/:token`, status: 200, ms: 0, outcome: 'breaker_force_open' });
        } catch {}
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(stub));
        return true;
      }
      const { scanTokenExact } = await import('./scan.js');
      const start = Date.now();
      // Rules decision (optional)
      if (process.env.RULES_ENABLED === 'true') {
        const d = ruleDecision({ chain, token, symbol: token });
        if (d === 'deny') { res.writeHead(403, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'forbidden' })); return true; }
      }
      const result = await scanTokenExact(token, { chain, address: token });
      const enrichParam = url.searchParams.get('enrich');
      if (enrichParam === 'true' && result.status === 'ok' && result.items.length) {
        try {
          const enr = await enrichToken(result.items[0].chain, result.items[0].address);
          (result as any).enrichment = enr;
        } catch {}
      }
      // log response time
      try {
        const ms = Date.now()-start;
        recordLatency(ms);
        recordRoute('/api/scan:GET', ms, (result as any)?.status === 'error');
        const { getOrCreateRequestId, logHttpJson } = await import('../../src/observability/request_id.js');
        const rid = getOrCreateRequestId(req, res);
        logHttpJson({ reqId: rid, method: 'GET', route: `/api/scan/${chain}/:token`, status: 200, ms, maskedAddr: maybeMask(token) });
        if (process.env.JSON_LOGS !== 'true') console.log(`[api] GET /api/scan/${chain}/${token} ${ms}ms`);
      } catch {}
      // Invariants (env-gated strict)
      try {
        const inv = validateScanResponse(result);
        if (!inv.ok) {
          const strict = process.env.INVARIANTS_STRICT === 'true';
          const masked = maskInvariantErrors(inv.errs);
          if (strict) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'invariants_failed', note: masked })); return true; }
          else console.warn(`[invariants] scan GET failed: ${masked}`);
        }
      } catch {}
      if ((result as any)?.status === 'error') { try { recordError(); } catch {} }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }
    return false;
  } catch {
    try { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'internal' })); } catch {}
    return true;
  }
  });
} catch {}
if (!IS_TEST && process.env.HTTP_ONLY !== 'true') {
  bot.start().then(()=> console.log('RekTrace RugScanner up.'));
}

export const createServer = () => ({
  listen: () => {},
  // Minimal supertest-compatible handler
  close: () => {},
});

// Background alerts checker
const ALERTS_CHECK_INTERVAL_MS = Number(process.env.ALERTS_CHECK_INTERVAL_MS ?? 600_000);
setInterval(async () => {
  if (process.env.DEMO_MODE === 'true') return; // keep demo mode offline
  try {
    await runAlertsPass(async (chatId, text) => { await bot.api.sendMessage(chatId, text); });
  } catch {}
}, ALERTS_CHECK_INTERVAL_MS);

// --- M2 Watchlist v1 commands ---
bot.command('watch', async (ctx) => {
  const q = ctx.match?.trim();
  if (!q) return ctx.reply('Usage: /watch <chain:token|token> [drop unlockDays]');
  const [tokenPart, dropStr, unlockStr] = q.split(/\s+/);
  const token = tokenPart.includes(':') ? tokenPart.split(':')[1] : tokenPart;
  const chain = tokenPart.includes(':') ? tokenPart.split(':')[0] : 'ink';
  await subscribe(ctx.chat!.id, { chain, token });
  const drop = dropStr ? Number(dropStr) : undefined;
  const unlockDays = unlockStr ? Number(unlockStr) : undefined;
  if (drop != null || unlockDays != null) await setPref(ctx.chat!.id, { chain, token }, { drop, unlockDays } as any);
  const pref = await getPref(ctx.chat!.id, { chain, token });
  return ctx.reply(`Watching ${chain}:${token} — drop ≥ ${pref.drop}, unlock ≤ ${pref.unlockDays}d`);
});

bot.command('unwatch', async (ctx) => {
  const q = ctx.match?.trim();
  if (!q) return ctx.reply('Usage: /unwatch <chain:token|token>');
  const token = q.includes(':') ? q.split(':')[1] : q;
  const chain = q.includes(':') ? q.split(':')[0] : 'ink';
  await unsubscribe(ctx.chat!.id, { chain, token });
  return ctx.reply(`Unwatched ${chain}:${token}.`);
});

bot.command('my_watchlist', async (ctx) => {
  const subs = await listSubs(ctx.chat!.id);
  if (!subs.length) return ctx.reply('Your watchlist is empty. Use /watch <token>');
  const lines = ['👀 Your watchlist:'];
  for (const s of subs.slice(0,5)) {
    const pref = await getPref(ctx.chat!.id, s);
    lines.push(`• ${s.chain}:${s.token} — drop ≥ ${pref.drop}, unlock ≤ ${pref.unlockDays}d`);
  }
  return ctx.reply(lines.join('\n'));
});

// --- Bootstrap guards ---
try { startAutoGuard(); } catch {}
// --- Bootstrap Signals (env-gated) ---
try {
  const stopCompute = bootstrapSignalsCompute();
  const stopPoll = startSignalsPoller();
  void stopCompute; void stopPoll;
} catch {}
try {
  const { getGoldrushUsage } = await import('../../src/metrics.js');
  const stop = startBudgetGuard(() => {
    const u = getGoldrushUsage();
    // Treat estCredits as used, limit driven via env BUDGET_CREDITS_DAILY when enabled
    const limit = Number(process.env.BUDGET_CREDITS_DAILY || 0);
    if (!limit) return null;
    return { used: Number(u.estCredits || 0), limit };
  });
  void stop; // keep reference to satisfy linter if needed
} catch {}


