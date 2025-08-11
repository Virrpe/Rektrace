import Redis from 'ioredis';
import type { Signal } from './schemas.js';

function getRedis(): Redis | null { const url = process.env.REDIS_URL || ''; return url ? new Redis(url) : null as any; }

function maskSymbol(s?: string): string { if (!s) return '****'; return s.replace(/.(?=.{2})/g, '•'); }

type ApiLike = { sendMessage: (chatId: number, text: string) => Promise<any> };

export async function maybePostSignals(api: ApiLike, chatId: number, signals: Signal[]) {
  if (process.env.SIGNALS_BROADCAST_ENABLED !== 'true') return;
  const r = getRedis();
  for (const s of signals) {
    const key = `signals:posted:${s.id}`;
    let posted = false;
    if (r) { posted = !!(await r.exists(key)); }
    if (posted) continue;
    const lines = [
      `📡 Signal: ${maskSymbol(s.pair.symbol || s.pair.address.slice(0,6))} — score ${s.score}`,
      `vol5m=${Math.round(s.metrics.vol5m)}  price15m=${s.metrics.price15m.toFixed(2)}%  maker5m=${s.metrics.maker5m.toFixed(3)}`,
      `attestationId=${s.attestationId}`,
    ];
    try { await api.sendMessage(chatId, lines.join('\n')); } catch {}
    if (r) { try { await r.set(key, '1', 'EX', 600); } catch {} }
  }
}


