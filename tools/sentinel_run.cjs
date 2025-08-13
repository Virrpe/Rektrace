const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ENV = {
  ...process.env,
  LOG_ROOT: 'logs',
  AGENT_STATE_DIR: '.cache/rektrace-agent',
  AGENT_STATE_PATH: '.cache/rektrace-agent/state.json',
};

function writeRequest(stream, req) {
  const body = Buffer.from(JSON.stringify(req), 'utf8');
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8');
  stream.write(header);
  stream.write(body);
}

function createReader(stream, onMessage) {
  let buf = Buffer.alloc(0);
  stream.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      const headerEnd = buf.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      const header = buf.slice(0, headerEnd).toString('utf8');
      const m = header.match(/Content-Length:\s*(\d+)/i);
      if (!m) { buf = buf.slice(headerEnd + 4); continue; }
      const len = parseInt(m[1], 10);
      const start = headerEnd + 4;
      if (buf.length < start + len) break;
      const body = buf.slice(start, start + len).toString('utf8');
      buf = buf.slice(start + len);
      try { onMessage(JSON.parse(body)); } catch {}
    }
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  fs.mkdirSync('.cache/rektrace-agent', { recursive: true });
  fs.mkdirSync('logs', { recursive: true });

  const child = spawn('node', ['node_modules/tsx/dist/cli.mjs', 'mcp/process-sentinel/server.ts'], {
    env: ENV,
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  let nextId = 1;
  const pending = new Map();

  createReader(child.stdout, (msg) => {
    if (msg.id && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg.result);
    }
  });

  function request(method, params) {
    const id = nextId++;
    const p = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    writeRequest(child.stdin, { jsonrpc: '2.0', id, method, params });
    return p;
  }

  const runRes = await request('process/run', { cmd: 'sh -lc "sleep 7 && echo done"' });
  console.log('RUN', runRes);

  while (true) {
    const st = await request('process/status', { pid: runRes.pid });
    console.log('STATUS', st.running, st.exitCode, path.basename(st.logPath));
    if (typeof st.exitCode === 'number') break;
    await sleep(1000);
  }

  // Give time for heartbeat/state writes
  await sleep(2000);
  try { child.kill('SIGTERM'); } catch {}
}

main().catch((e) => { console.error(e); process.exit(1); });


