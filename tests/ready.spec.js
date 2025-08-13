import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './utils.js';

test('GET /live returns 200 with X-Request-Id', async (t) => {
  const { baseUrl, stop } = await startServer({ DEMO_MODE: 'true' });
  t.after(async () => { await stop(); });
  const res = await fetch(`${baseUrl}/live`);
  assert.equal(res.status, 200);
  assert.ok(res.headers.get('x-request-id'));
});

test('GET /ready maintenance → 503', async (t) => {
  const { baseUrl, stop } = await startServer({ DEMO_MODE: 'true', MAINTENANCE_MODE: 'true' });
  t.after(async () => { await stop(); });
  const res = await fetch(`${baseUrl}/ready`);
  assert.equal(res.status, 503);
});

test('GET /ready breaker force-open → 503', async (t) => {
  const { baseUrl, stop } = await startServer({ DEMO_MODE: 'true', BREAKER_FORCE_OPEN: 'true' });
  t.after(async () => { await stop(); });
  const res = await fetch(`${baseUrl}/ready`);
  assert.equal(res.status, 503);
});

test('GET /ready normal demo → 200', async (t) => {
  const { baseUrl, stop } = await startServer({ DEMO_MODE: 'true' });
  t.after(async () => { await stop(); });
  const res = await fetch(`${baseUrl}/ready`);
  assert.equal(res.status, 200);
});


