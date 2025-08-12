import http from 'node:http';
import { getProviderMetrics, getGoldrushUsage, getBotMetrics } from './metrics.js';
import { snapshotSignalsMetrics } from './observability/signals_metrics.js';

export function startHealthServer(port = Number(process.env.HEALTH_PORT ?? process.env.PORT ?? 3000), routes?: (req: http.IncomingMessage, res: http.ServerResponse) => boolean | Promise<boolean>) {
  const started = Date.now();
  const srv = http.createServer((req, res) => {
    try {
      if (!req.url) return;
      if (routes) {
        const maybe = routes(req, res);
        if (maybe instanceof Promise) {
          maybe.then((handled) => {
            if (!handled) {
              // fall through
              defaultHandler(req, res);
            }
          }).catch(() => defaultHandler(req, res));
          return;
        }
        if (maybe) return; // already handled
      }
      defaultHandler(req, res);
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('error');
    }
  });
  function defaultHandler(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!req.url) return;
      if (req.url.startsWith('/live')) {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
        return;
      }
      if (req.url.startsWith('/ready')) {
        // Default readiness: without custom routes, rely on uptime only
        const ready = process.env.MAINTENANCE_MODE !== 'true' && process.env.BREAKER_FORCE_OPEN !== 'true';
        if (ready) {
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('ready');
        } else {
          res.writeHead(503, { 'content-type': 'text/plain', 'Retry-After': '30' });
          res.end('not ready');
        }
        return;
      }
      if (req.url.startsWith('/healthz')) {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
        return;
      }
      if (req.url.startsWith('/metrics')) {
        const mem = process.memoryUsage();
        const payload = {
          uptimeSec: Math.round((Date.now() - started)/1000),
          rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal,
          platform: process.platform, node: process.version,
          providers: getProviderMetrics(),
          goldrushUsage: getGoldrushUsage(),
          signals: (()=>{ try { return snapshotSignalsMetrics(); } catch { return undefined; } })(),
          bot: (()=>{ try { return getBotMetrics(); } catch { return undefined; } })(),
        };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
        try {
          // dynamic import without await to avoid TS1308 in non-async function
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          import('./observability/slo.js').then(m => { try { m.recordRoute('/_metrics', 0, false); } catch {} }).catch(()=>{});
        } catch {}
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
  }
  srv.listen(port, () => console.log(`[health] listening on :${port}`));
  return srv;
}
