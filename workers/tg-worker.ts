import { Worker, Processor, WorkerOptions } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAMES } from '../src/queues.js';
import { setupTracing } from '../src/tracing.js';
import { Counter, Registry } from 'prom-client';
import { trace } from '@opentelemetry/api';
import { setTimeout as sleep } from 'node:timers/promises';

const serviceName = 'tg-worker';
const stopTracing = await setupTracing(serviceName);

const REDIS_URL: string = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const TELEGRAM_BOT_TOKEN: string | undefined = process.env.TELEGRAM_BOT_TOKEN;

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// Metrics (exposed via webhook server; here we just register counters)
const registry = new Registry();
const alertsProcessed = new Counter({ name: 'rektrace_tg_alert_processed_total', help: 'Total processed alert jobs', registers: [registry] });
const alertsFailed = new Counter({ name: 'rektrace_tg_alert_failed_total', help: 'Total failed alert jobs', registers: [registry] });

type AlertJob = { chatId: string; text: string };

const processor: Processor = async (job) => {
  const data = job.data as AlertJob;
  const chatId = String(data.chatId);
  const text = String(data.text ?? '');

  if (!TELEGRAM_BOT_TOKEN) {
    // Dry run when token missing
    console.log(`[tg-worker] DRY RUN → would send to chatId=${chatId}: ${text.slice(0, 120)}`);
    alertsProcessed.inc();
    return { dryRun: true };
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const ok = resp.ok;
  if (!ok) {
    alertsFailed.inc();
    const body = await resp.text();
    throw new Error(`telegram send failed: ${resp.status} ${resp.statusText} — ${body}`);
  }
  alertsProcessed.inc();
  return { ok: true };
};

const workerOptions: WorkerOptions = {
  connection,
  concurrency: Number(process.env.TG_WORKER_CONCURRENCY || 4),
  // Ensure reasonable retry behavior even if queue defaults change
  settings: { backoffStrategy: (attemptsMade: number) => Math.min(10000, 2 ** attemptsMade * 250) },
};

const worker = new Worker(QUEUE_NAMES.ALERT_READY, processor, workerOptions);

worker.on('ready', () => console.log('[tg-worker] ready'));
worker.on('failed', (job, err) => console.error('[tg-worker] job failed', job?.id, err?.message));
worker.on('completed', (job) => console.log('[tg-worker] job completed', job?.id));

async function shutdown(code: number) {
  console.log('[tg-worker] shutting down');
  try { await worker.close(); } catch {}
  try { await connection.quit(); } catch {}
  try { await stopTracing(); } catch {}
  // small delay so logs flush
  await sleep(150);
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));


