import Redis from 'ioredis';
import type { Signal } from './schemas.js';

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


