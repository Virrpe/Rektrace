import { Queue, JobsOptions } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL: string = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Single shared Redis connection for BullMQ
const redisConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// In-process cache of queues to avoid duplicate instances
const nameToQueue: Map<string, Queue> = new Map();

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 500 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 },
};

export const QUEUE_NAMES = {
  SCAN_INCOMING: 'scan.incoming',
  ALERT_READY: 'alert.ready',
} as const;

export function getQueue(queueName: string): Queue {
  let q = nameToQueue.get(queueName);
  if (!q) {
    q = new Queue(queueName, { connection: redisConnection, defaultJobOptions });
    nameToQueue.set(queueName, q);
  }
  return q;
}

export async function enqueueScanIncoming(payload: unknown, jobId?: string) {
  const q = getQueue(QUEUE_NAMES.SCAN_INCOMING);
  await q.add('scan', payload as Record<string, unknown>, { jobId });
}

export async function enqueueAlertReady(payload: { chatId: string; text: string }, jobId?: string) {
  const q = getQueue(QUEUE_NAMES.ALERT_READY);
  await q.add('alert', payload, { jobId });
}

export function getRedis(): IORedis {
  return redisConnection;
}


