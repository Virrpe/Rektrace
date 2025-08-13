import fs from 'fs';

// Load env from .env.prod without printing values
const envText = fs.readFileSync('.env.prod', 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]])
);

const url = env.QUICKNODE_RPC_URL || env.INK_RPC;
if (!url || !url.startsWith('https://')) {
  console.log('RPC: ❌ no HTTPS RPC set');
  process.exit(2);
}

const req = { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] };

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const txt = await res.text();
  const ok = res.ok;
  const len = txt.length;
  const hasNumber = /"number"\s*:\s*"/.test(txt);
  console.log(`RPC: ${ok ? '✅' : '❌'} status=${res.status} body_len=${len} hasNumber=${hasNumber}`);
  process.exit(ok ? 0 : 3);
} catch (e) {
  console.log('RPC: ❌ exception');
  process.exit(4);
}
