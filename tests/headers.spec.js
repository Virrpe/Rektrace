import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './utils.js';

test('Security headers present when enabled', async (t) => {
  const { baseUrl, stop } = await startServer({ SECURITY_HEADERS: 'true', DEMO_MODE: 'true' });
  t.after(async () => { await stop(); });
  const res = await fetch(`${baseUrl}/status`);
  assert.equal(res.status, 200);
  const h = res.headers;
  const expectHeaders = [
    'x-content-type-options',
    'x-frame-options',
    'referrer-policy',
    'permissions-policy',
    'cross-origin-resource-policy',
    'cross-origin-opener-policy',
    'x-permitted-cross-domain-policies',
  ];
  for (const k of expectHeaders) {
    assert.ok(h.get(k), `missing header ${k}`);
  }
});


