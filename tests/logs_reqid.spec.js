import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './utils.js';

test('JSON logs redact list and include X-Request-Id', async (t) => {
  const secret = 'supersecretvalue';
  const { baseUrl, child, stop } = await startServer({ DEMO_MODE: 'true', JSON_LOGS: 'true', LOG_REDACT_LIST: secret });
  t.after(async () => { await stop(); });
  const res = await fetch(`${baseUrl}/status`);
  const rid = res.headers.get('x-request-id');
  assert.ok(rid);
  const logs = await new Promise((resolve) => {
    let data = '';
    const onData = (chunk) => { data += chunk.toString(); };
    const onEnd = () => resolve(data);
    setTimeout(() => { child.stdout.off('data', onData); resolve(data); }, 150);
    child.stdout.on('data', onData);
    child.stdout.on('end', onEnd);
  });
  assert.ok(!String(logs).includes(secret));
  assert.ok(String(logs).includes(rid));
});


