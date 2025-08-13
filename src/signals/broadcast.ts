import Redis from 'ioredis';
import type { Signal } from './schemas.js';
import { shouldPost } from './posting_budget.js';
import { notePostDecision, noteQuietMuteAllowlist } from '../observability/signals_metrics.js';
import { whyQuiet, shouldAllowByPartnerList } from './quiet_hours.js';

function getRedis(): Redis | null { const url = process.env.REDIS_URL || ''; return url ? new Redis(url) : null as any; }
const memPosted = new Map<string, number>();

function maskSymbol(s?: string): string { if (!s) return '****'; return s.replace(/.(?=.{2})/g, '•'); }

type ApiLike = { sendMessage: (chatId: number, text: string, opts?: any) => Promise<any> };
type Sender = (s: Signal) => Promise<void>;

export async function maybePostSignals(api: ApiLike, chatId: number, signals: Signal[], sender?: Sender) {
  if (process.env.SIGNALS_BROADCAST_ENABLED !== 'true') return;
  const r = getRedis();
  for (const s of signals) {
    const key = `signals:posted:${s.id}`;
    let posted = false;
    if (r) { posted = !!(await r.exists(key)); }
    if (!posted) {
      const ts = memPosted.get(key) || 0;
      if (Date.now() - ts < 10 * 60 * 1000) posted = true;
    }
    if (posted) continue;
    // quiet hours / emergency mute gate
    const isAdmin = false; // broadcast path is not user-initiated; admin override applies only to commands
    const q = whyQuiet(new Date(), { admin: isAdmin });
    if (q) {
      noteQuietMuteAllowlist(q === 'muted' ? 'muted' : 'quiet_hours');
      try { console.log(JSON.stringify({ at: 'signals.post.denied', reason: q, attestationId: s.attestationId })); } catch {}
      continue;
    }

    // partner allow-list gate
    try {
      const { allow, reason } = await shouldAllowByPartnerList(s.pair.symbol, s.pair.address);
      if (!allow) {
        noteQuietMuteAllowlist('allowlist_block');
        try { console.log(JSON.stringify({ at: 'signals.post.denied', reason: reason || 'allowlist_block', attestationId: s.attestationId })); } catch {}
        continue;
      }
    } catch {}

    // posting budget gate (env-gated; default disabled → allow)
    const dec = await shouldPost(Date.now(), { admin: isAdmin });
    notePostDecision(dec);
    if (!dec.allow) {
      try { console.log(JSON.stringify({ at: 'signals.post.denied', reason: dec.reason, hour_used: dec.hour_used, day_used: dec.day_used, wait_ms: dec.wait_ms, attestationId: s.attestationId })); } catch {}
      continue;
    }
    if (sender) {
      try { await sender(s); } catch {}
    } else {
      const lines = [
        `📡 Signal: ${maskSymbol(s.pair.symbol || s.pair.address.slice(0,6))} — score ${s.score}`,
        `vol5m=${Math.round(s.metrics.vol5m)}  price15m=${s.metrics.price15m.toFixed(2)}%  maker5m=${s.metrics.maker5m.toFixed(3)}`,
        `attestationId=${s.attestationId}`,
      ];
      try { await api.sendMessage(chatId, lines.join('\n')); } catch {}
    }
    if (r) { try { await r.set(key, '1', 'EX', 600); } catch {} } else { memPosted.set(key, Date.now()); }
  }
}


