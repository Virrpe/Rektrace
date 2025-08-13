#!/usr/bin/env node
import { spawn } from 'node:child_process';

function send(conn, obj) {
	const json = JSON.stringify(obj);
	const buf = Buffer.from(json, 'utf8');
	conn.stdin.write(`Content-Length: ${buf.length}\r\n\r\n`);
	conn.stdin.write(buf);
}

function readOne(conn, timeoutMs = 3000) {
	return new Promise((resolve, reject) => {
		let header = '';
		let needed = -1;
		let body = Buffer.alloc(0);
		const onData = (chunk) => {
			try {
				let buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
				while (buf.length) {
					if (needed < 0) {
						const str = buf.toString('utf8');
						header += str;
						const idx = header.indexOf('\r\n\r\n');
						if (idx >= 0) {
							const head = header.slice(0, idx);
							const m = head.match(/Content-Length:\s*(\d+)/i);
							if (!m) throw new Error('No Content-Length');
							needed = parseInt(m[1], 10);
							buf = Buffer.from(header.slice(idx + 4), 'utf8');
							header = '';
							body = Buffer.alloc(0);
						} else {
							buf = Buffer.alloc(0);
						}
					} else {
						const take = Math.min(needed - body.length, buf.length);
						body = Buffer.concat([body, buf.slice(0, take)]);
						buf = buf.slice(take);
						if (body.length >= needed) {
							conn.stdout.off('data', onData);
							clearTimeout(t);
							try { resolve(JSON.parse(body.toString('utf8'))); } catch (e) { reject(e); }
							return;
						}
					}
			}
			catch (e) {
				conn.stdout.off('data', onData);
				clearTimeout(t);
				reject(e);
			}
		};
		const t = setTimeout(() => { conn.stdout.off('data', onData); reject(new Error('timeout')); }, timeoutMs);
		conn.stdout.on('data', onData);
	});
}

async function probe(name, cmd, args, env) {
	process.stderr.write(`\n=== PROBE ${name} ===\n`);
	const child = spawn(cmd, args, { env: { ...process.env, ...(env||{}) }, stdio: ['pipe','pipe','pipe'] });
	child.stderr.on('data', d => process.stderr.write(String(d)));
	try {
		const initReq = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'probe', version: '0.0.1' } } };
		send(child, initReq);
		const initRes = await readOne(child, 3000);
		process.stderr.write(`initialize ← ${JSON.stringify(initRes)}\n`);
		const listReq = { jsonrpc: '2.0', id: 2, method: 'tools/list' };
		send(child, listReq);
		const listRes = await readOne(child, 3000);
		process.stderr.write(`tools/list ← ${JSON.stringify(listRes)}\n`);
	} catch (e) {
		process.stderr.write(`ERROR: ${String(e && e.message || e)}\n`);
	} finally {
		try { child.kill('SIGTERM'); } catch {}
	}
}

await probe('prom-metrics', 'node', ['./node_modules/tsx/dist/cli.mjs','mcp/prom-metrics/server.ts'], { PROM_URL: 'http://localhost:9090' });
await probe('postgres-ro', 'node', ['./node_modules/tsx/dist/cli.mjs','mcp/postgres-ro/server.ts'], { DATABASE_URL: 'postgres://rektrace:rektrace@localhost:5432/rektrace', PGREADONLY: 'true' });
await probe('tg-notify', 'node', ['./node_modules/tsx/dist/cli.mjs','mcp/tg-notify/server.ts'] , {});


