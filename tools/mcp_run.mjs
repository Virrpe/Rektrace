import { spawn } from 'node:child_process';
import jsonrpc from 'vscode-jsonrpc';
const { createConnection, StreamMessageReader, StreamMessageWriter, RequestType } = jsonrpc;

const LOG_ROOT = 'logs';
const env = { ...process.env, LOG_ROOT, AGENT_STATE_DIR: '.cache/rektrace-agent', AGENT_STATE_PATH: '.cache/rektrace-agent/state.json' };

const Run = new RequestType('process/run');
const Status = new RequestType('process/status');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const sentinel = spawn('node', ['node_modules/tsx/dist/cli.mjs', 'mcp/process-sentinel/server.ts'], { env, stdio: ['pipe','pipe','inherit'] });

  const connection = createConnection(new StreamMessageReader(sentinel.stdout), new StreamMessageWriter(sentinel.stdin));
  connection.listen();

  // kick a 7s job
  const { pid, logPath } = await connection.sendRequest(Run, { cmd: 'sh -lc "sleep 7 && echo done"' });
  console.log('RUN pid:', pid, 'log:', logPath);

  // poll status until finished
  let finished = false;
  while (!finished) {
    const s = await connection.sendRequest(Status, { pid });
    console.log('STATUS running:', s.running, 'exitCode:', s.exitCode, 'log:', s.logPath);
    if (s.exitCode !== undefined && s.exitCode !== null) finished = true;
    else await sleep(1000);
  }

  // small delay to flush state
  await sleep(1000);
  try { sentinel.kill('SIGTERM'); } catch {}
}

main().catch(err => { console.error(err); process.exit(1); });


