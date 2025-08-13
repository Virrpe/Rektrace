import Fastify from 'fastify';
import { Registry, collectDefaultMetrics } from 'prom-client';
import { trace } from '@opentelemetry/api';
import { enqueueAlertReady } from '../src/queues.js';
import { setupTracing } from '../src/tracing.js';

process.on('uncaughtException', (e) => {
  try { console.error('[webhook] uncaughtException', (e as any)?.stack || e); } catch {}
});
process.on('unhandledRejection', (e) => {
  try { console.error('[webhook] unhandledRejection', e); } catch {}
});

const serviceName = 'webhook';
const stopTracing = await setupTracing(serviceName);

const app = Fastify({ logger: true });
const registry = new Registry();
collectDefaultMetrics({ register: registry });

app.get('/health', async () => ({ ok: true, service: serviceName }));

app.get('/metrics', async (_req, reply) => {
  reply.header('Content-Type', registry.contentType);
  return reply.send(await registry.metrics());
});

app.get('/-/ready', async () => ({ ready: true }));

app.post('/test/alert', async (req, reply) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const chatId = String(body.chatId ?? '');
  const text = String(body.text ?? '');
  try { trace.getTracer('webhook').startSpan('test_alert').end(); } catch {}
  if (!chatId || !text) {
    return reply.code(400).send({ ok: false, error: 'chatId and text required' });
  }
  await enqueueAlertReady({ chatId, text });
  return reply.send({ ok: true });
});

// Avoid collision with Grafana (3000). Use 3100 by default.
const PORT = Number(process.env.PORT || process.env.WEB_PORT || 3100);
const HOST = process.env.HOST || '0.0.0.0';

app.addHook('onClose', async () => {
  await stopTracing();
});

console.log('[webhook] booting');
try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`[webhook] listening on http://${HOST}:${PORT}`);
} catch (e) {
  try { console.error('[webhook] failed to start', (e as any)?.stack || e); } catch {}
  process.exit(1);
}


