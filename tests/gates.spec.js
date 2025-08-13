import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './utils.js';

test('MAINTENANCE_MODE=true: status/metrics allowed, scan 503 with Retry-After', async (t) => {
  const { baseUrl, stop } = await startServer({ MAINTENANCE_MODE: 'true', DEMO_MODE: 'true' });
  t.after(async () => { await stop(); });
  let res = await fetch(`${baseUrl}/status`);
  assert.equal(res.status, 200);
  res = await fetch(`${baseUrl}/metrics`);
  assert.equal(res.status, 200);
  res = await fetch(`${baseUrl}/api/scan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'ink:pepe' }) });
  assert.equal(res.status, 503);
  assert.ok(res.headers.get('retry-after'));
});

test('READONLY_MODE=true: state-changing routes blocked; scan allowed', async (t) => {
  const { baseUrl, stop } = await startServer({ READONLY_MODE: 'true', DEMO_MODE: 'true' });
  t.after(async () => { await stop(); });
  // Simulate a state-changing unknown route
  const resBlock = await fetch(`${baseUrl}/admin/toggle`, { method: 'POST' });
  assert.equal(resBlock.status, 403);
  const resScan = await fetch(`${baseUrl}/api/scan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'ink:pepe' }) });
  assert.equal(resScan.status, 200);
});


