import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';

export async function getFreePort() {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1');
  await once(srv, 'listening');
  const addr = srv.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  await new Promise((r) => srv.close(r));
  return port;
}

export async function startServer(envOverrides = {}) {
  const port = envOverrides.HEALTH_PORT ?? await getFreePort();
  const child = spawn('node', ['dist/rektrace-rugscan/rektrace-rugscan/src/index.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HTTP_ONLY: 'true',
      DEMO_MODE: envOverrides.DEMO_MODE ?? 'true',
      HEALTH_PORT: String(port),
      JSON_LOGS: envOverrides.JSON_LOGS ?? 'false',
      LOG_REDACT_LIST: envOverrides.LOG_REDACT_LIST ?? '',
      MAINTENANCE_MODE: envOverrides.MAINTENANCE_MODE ?? 'false',
      BREAKER_FORCE_OPEN: envOverrides.BREAKER_FORCE_OPEN ?? 'false',
      READONLY_MODE: envOverrides.READONLY_MODE ?? 'false',
      IDEMP_ENABLED: envOverrides.IDEMP_ENABLED ?? 'false',
      SECURITY_HEADERS: envOverrides.SECURITY_HEADERS ?? 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // wait a moment for server to bind
  await new Promise((r) => setTimeout(r, 200));
  const baseUrl = `http://127.0.0.1:${port}`;
  const stop = async () => {
    try { child.kill('SIGTERM'); } catch {}
    await new Promise((r) => setTimeout(r, 50));
  };
  return { baseUrl, port, child, stop };
}


