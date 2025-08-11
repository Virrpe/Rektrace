import os from 'node:os';
import { Bot } from 'grammy';

function list(name: string | undefined) { return name ? name.split(',').map(s => s.trim()).filter(Boolean) : []; }
type Finding = { ok: boolean; label: string; hint?: string };

function checkEnv(): { findings: Finding[]; score: number } {
  const f: Finding[] = [];
  const DEMO = process.env.DEMO_MODE === 'true';
  f.push({ ok: !!process.env.TELEGRAM_BOT_TOKEN, label: 'TELEGRAM_BOT_TOKEN', hint: 'Set your bot token in .env' });
  f.push({ ok: !!process.env.REDIS_URL, label: 'REDIS_URL', hint: 'Use Upstash free tier for cache/entitlements' });
  const evm = list(process.env.ETH_RPC); const sol = list(process.env.SOL_RPC);
  f.push({ ok: evm.length >= 2, label: `ETH_RPC endpoints (${evm.length})`, hint: 'Add two+ endpoints, comma-separated' });
  f.push({ ok: sol.length >= 2, label: `SOL_RPC endpoints (${sol.length})`, hint: 'Add two+ endpoints, comma-separated' });
  const chain = (process.env.AD_CHAIN || '').toLowerCase(); const curr = (process.env.AD_CURRENCY || '').toLowerCase();
  f.push({ ok: ['evm','sol','ink'].includes(chain), label: `AD_CHAIN=${chain||'∅'}`, hint: 'Set evm|sol|ink' });
  f.push({ ok: !!curr, label: `AD_CURRENCY=${curr||'∅'}`, hint: 'Set matching currency (usdt|eth|sol|usdc_spl|ink|asset)' });
  if (chain === 'evm') {
    if (curr === 'eth') {
      f.push({ ok: !!process.env.ETHINK_RECEIVER, label: 'ETHINK_RECEIVER', hint: 'Your ETH address' });
      f.push({ ok: !!process.env.ETHINK_PRICE, label: 'ETHINK_PRICE', hint: 'e.g., 0.02' });
    } else {
      f.push({ ok: !!process.env.AD_EVM_USDT_RECEIVER, label: 'AD_EVM_USDT_RECEIVER', hint: 'Your EVM address for USDT' });
      f.push({ ok: !!process.env.USDT_ADDRESS, label: 'USDT_ADDRESS', hint: 'Token address (chain-specific)' });
      f.push({ ok: !!process.env.AD_PRICE_USDT, label: 'AD_PRICE_USDT', hint: 'e.g., 25' });
    }
  }
  if (chain === 'sol') {
    f.push({ ok: !!process.env.SOL_RECEIVER, label: 'SOL_RECEIVER', hint: 'Your Solana address' });
    if (curr === 'usdc_spl') {
      f.push({ ok: !!process.env.USDC_SOL_MINT, label: 'USDC_SOL_MINT', hint: 'Mainnet USDC mint' });
      f.push({ ok: !!process.env.AD_PRICE_USDC_SOL, label: 'AD_PRICE_USDC_SOL', hint: 'e.g., 25' });
    } else {
      f.push({ ok: !!process.env.AD_PRICE_SOL, label: 'AD_PRICE_SOL', hint: 'e.g., 0.2' });
    }
  }
  if (chain === 'ink') {
    f.push({ ok: !!process.env.KRAKEN_INK_RPC, label: 'KRAKEN_INK_RPC', hint: 'Substrate RPC wss://…' });
    f.push({ ok: !!process.env.KRAKEN_INK_RECEIVER, label: 'KRAKEN_INK_RECEIVER', hint: 'Your SS58 address' });
    f.push({ ok: !!process.env.KRAKEN_INK_PRICE, label: 'KRAKEN_INK_PRICE', hint: 'e.g., 25' });
  }
  f.push({ ok: !!process.env.GOPLUS_API_KEY, label: 'GOPLUS_API_KEY', hint: 'Optional but recommended' });
  f.push({ ok: !!process.env.ADMIN_CHAT_ID, label: 'ADMIN_CHAT_ID', hint: 'Enable admin pings on breaker events' });
  let okCount = f.filter(x => x.ok).length; let score = Math.round((okCount / f.length) * 100);
  if (DEMO) { score = Math.max(score, 90); }
  return { findings: f, score };
}

function hegelian(findings: Finding[], score: number) {
  const missing = findings.filter(x => !x.ok);
  const risks = [...missing.map(m => `• Missing ${m.label}${m.hint ? ` — ${m.hint}` : ''}`), score < 80 ? '• Uptime risk: add multi-RPC + Redis for cache' : ''].filter(Boolean);
  const thesis = 'Ship RekTrace with multi-chain analytics, crypto-paid ads, automated vetting, AI-resistance, and RPC failover + cache.';
  const antithesis = ['Weak points right now:', ...risks].join('\n');
  const synthesis = ['Do this before launch (SLA-friendly):','1) Ensure ETH_RPC and SOL_RPC each have 2+ endpoints.','2) Set REDIS_URL and ADMIN_CHAT_ID.','3) Check payment vars match AD_CHAIN/AD_CURRENCY.','4) Run `pnpm test`.','5) /preflight until score ≥ 90.'].join('\n');
  return { thesis, antithesis, synthesis };
}

export function registerPreflight(bot: Bot) {
  bot.command('preflight', async (ctx) => {
    const { findings, score } = checkEnv();
    const { thesis, antithesis, synthesis } = hegelian(findings, score);
    const demoMsg = process.env.DEMO_MODE === 'true' ? '\n_Demo environment detected; external checks skipped._' : '';
    const header = `*RekTrace Preflight* — score: *${score}%*${demoMsg}`;
    const rows = findings.map(f => `${f.ok ? '✅' : '❌'} ${f.label}${f.ok ? '' : (f.hint ? ` — ${f.hint}` : '')}`);
    const body = [header,'\n*Thesis*', thesis,'\n*Antithesis*', antithesis,'\n*Synthesis*', synthesis,'\n*Checks*', rows.join('\n'),`\nHost: ${os.hostname()} | Node: ${process.version}`].join('\n');
    const max = 3500;
    if (body.length <= max) return ctx.reply(body, { parse_mode: 'Markdown' });
    await ctx.reply(body.slice(0,max), { parse_mode: 'Markdown' });
    await ctx.reply(body.slice(max), { parse_mode: 'Markdown' });
  });
}
