import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './utils.js';

test('Breaker force-open returns deterministic stub passing invariants', async (t) => {
  const { baseUrl, stop } = await startServer({ BREAKER_FORCE_OPEN: 'true', DEMO_MODE: 'true' });
  t.after(async () => { await stop(); });
  let res = await fetch(`${baseUrl}/api/scan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'ink:pepe' }) });
  assert.equal(res.status, 200);
  const j1 = await res.json();
  assert.equal(j1.status, 'ok');
  assert.ok(Array.isArray(j1.items) && j1.items.length > 0);
  res = await fetch(`${baseUrl}/api/scan/ink/0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef`);
  assert.equal(res.status, 200);
  const j2 = await res.json();
  assert.equal(j2.status, 'ok');
});

test('Idempotency duplicate returns 409', async (t) => {
  const { baseUrl, stop } = await startServer({ DEMO_MODE: 'true', IDEMP_ENABLED: 'true' });
  t.after(async () => { await stop(); });
  const body = JSON.stringify({ token: 'ink:pepe' });
  const idem = 'idem-key-1';
  const h = { 'content-type': 'application/json', 'Idempotency-Key': idem };
  let res = await fetch(`${baseUrl}/api/scan`, { method: 'POST', headers: h, body });
  assert.equal(res.status, 200);
  res = await fetch(`${baseUrl}/api/scan`, { method: 'POST', headers: h, body });
  assert.equal(res.status, 409);
});


