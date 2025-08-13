import type { TradeTick } from '../schemas.js';
import { startInkDiscovery } from './ink_discovery.js';
import { bus } from '../../observability/events.js';
import { incrWsConnect, incrWsReconnect, incrWsError, setWsConnected, incrWsTicks, incrWsSkipped, observeWsComputeMs } from '../../observability/signals_metrics.js';

type Stopper = () => void;

function deriveWss(): string | null {
  const wss = process.env.QUICKNODE_WSS_URL || '';
  if (wss) return wss;
  const http = process.env.QUICKNODE_RPC_URL || '';
  if (http.startsWith('http://')) return 'ws://' + http.slice('http://'.length);
  if (http.startsWith('https://')) return 'wss://' + http.slice('https://'.length);
  return null;
}

export function startQuickNodeWS(opts: { onTick: (t: TradeTick)=>void; onInfo?: (msg:string)=>void }): Stopper {
  if (process.env.SIGNALS_WS_ENABLED !== 'true') return () => {};
  const DEMO = process.env.DEMO_MODE === 'true';
  if (DEMO) return startInkDiscovery(opts); // never ws in demo
  const url = deriveWss();
  if (!url) { opts.onInfo?.('ws_no_url'); return () => {}; }

  let WSImpl: any;
  try { WSImpl = (globalThis as any).WebSocket; } catch {}
  const lazyImport = async () => {
    if (!WSImpl) {
      try { WSImpl = (await import('ws')).WebSocket; } catch { /* optional */ }
    }
    return WSImpl;
  };

  let stopped = false;
  let connected = false;
  let inflight = 0;
  let failures: number[] = [];
  let disabled = false;
  let lastActivity = Date.now();
  const MAX_INFLIGHT = Math.max(1, Number(process.env.WS_MAX_INFLIGHT ?? 4));
  const HEARTBEAT_MS = Math.max(1000, Number(process.env.WS_HEARTBEAT_MS ?? 20000));
  const IDLE_TIMEOUT_MS = Math.max(2000, Number(process.env.WS_IDLE_TIMEOUT_MS ?? 45000));
  const BACKOFF_MS = Math.max(100, Number(process.env.WS_BACKOFF_MS ?? 500));
  const MAX_BACKOFF_MS = Math.max(BACKOFF_MS, Number(process.env.WS_MAX_BACKOFF_MS ?? 15000));
  const JITTER_PCT = Math.max(0, Number(process.env.WS_JITTER_PCT ?? 20));
  const MAX_RETRIES = Math.max(0, Number(process.env.WS_MAX_RETRIES ?? 0));
  const DEBOUNCE_MS = Math.max(0, Number(process.env.HEAD_DEBOUNCE_MS ?? 300));

  function jitter(ms: number) { const j = ms * (JITTER_PCT/100) * Math.random(); return Math.min(MAX_BACKOFF_MS, ms + j); }

  async function run() {
    const Impl = await lazyImport();
    if (!Impl) { opts.onInfo?.('ws_impl_missing_fallback'); disabled = true; startInkDiscovery(opts); return; }
    let ws: any;
    let lastHeadAt = 0;
    let retries = 0;
    const connect = () => {
      if (stopped || disabled) return;
      ws = new Impl(url);
      ws.onopen = () => {
        connected = true; setWsConnected(1); incrWsConnect(); bus.emit('signals:ws:connected'); lastActivity = Date.now(); retries = 0;
        // subscribe newHeads
        const sub = { id: 1, jsonrpc: '2.0', method: 'eth_subscribe', params: ['newHeads'] };
        ws.send(JSON.stringify(sub));
        // optional logs
        const topics = String(process.env.SIGNALS_WS_TOPICS || '').split(',').map(s=>s.trim()).filter(Boolean);
        if (topics.length) {
          const payload = { id: 2, jsonrpc: '2.0', method: 'eth_subscribe', params: ['logs', { address: topics }] };
          ws.send(JSON.stringify(payload));
        }
      };
      ws.onmessage = async (ev: any) => {
        lastActivity = Date.now();
        try {
          const data = typeof ev.data === 'string' ? ev.data : ev.data?.toString?.() || '';
          if (!data) return;
          const j = JSON.parse(data);
          // newHeads notifications carry method = eth_subscription
          if (j.method === 'eth_subscription') {
            const now = Date.now();
            if (now - lastHeadAt < DEBOUNCE_MS) return;
            lastHeadAt = now;
            if (inflight >= MAX_INFLIGHT) { incrWsSkipped(); return; }
            inflight++;
            const t0 = Date.now();
            try {
              incrWsTicks();
              // Delegate to poll discovery once per head to fetch pairs and emit ticks
              const stop = startInkDiscovery({ onTick: opts.onTick, onInfo: opts.onInfo });
              stop();
            } finally {
              inflight = Math.max(0, inflight - 1);
              observeWsComputeMs(Date.now() - t0);
            }
          }
        } catch { /* ignore parse */ }
      };
      ws.onerror = () => { incrWsError(); };
      ws.onclose = () => {
        connected = false; setWsConnected(0); bus.emit('signals:ws:disconnected');
        if (stopped) return;
        failures.push(Date.now()); failures = failures.filter(ts => Date.now() - ts < 60_000);
        if (failures.length >= 5) { disabled = true; opts.onInfo?.('ws:fallback_to_poll'); startInkDiscovery(opts); return; }
        const b = jitter(BACKOFF_MS * Math.pow(2, Math.min(10, retries++)));
        incrWsReconnect();
        if (MAX_RETRIES && retries > MAX_RETRIES) { disabled = true; opts.onInfo?.('ws:max_retries_fallback'); startInkDiscovery(opts); return; }
        setTimeout(connect, b);
      };
      // heartbeat
      const hb = setInterval(() => {
        try {
          if (!ws) return;
          if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) { try { ws.close(); } catch {} }
          else {
            try { ws.send(JSON.stringify({ id: 99, method: 'ping' })); } catch {}
            try { if (typeof ws.ping === 'function') ws.ping(); } catch {}
          }
        } catch {}
      }, HEARTBEAT_MS);
      const clear = ws.onclose; // already defined
      ws.onclose = (...args: any[]) => { try { clearInterval(hb); } catch {}; (clear as any)?.apply(ws, args); };
    };
    connect();
  }
  run().catch(()=>{ disabled = true; startInkDiscovery(opts); });
  return () => { stopped = true; setWsConnected(0); };
}


