#!/usr/bin/env node
// Generate a .env file from ops/secrets.local.json
import fs from 'node:fs';
import path from 'node:path';

function normalizeValue(key, value) {
  if (value == null) return '';
  let v = String(value).trim();
  // Fix accidental embedded key assignment like "INK_RPC=..." inside the value
  if (key === 'INK_RPC' && /^INK_RPC=/.test(v)) v = v.replace(/^INK_RPC=/, '').trim();
  return v;
}

function buildEnv(envObj) {
  const lines = [];
  const keys = Object.keys(envObj || {});
  for (const k of keys.sort()) {
    const v = normalizeValue(k, envObj[k]);
    if (v === '') continue;
    lines.push(`${k}=${v}`);
  }
  return lines.join('\n') + '\n';
}

function main() {
  const src = process.argv[2] || path.join('ops', 'secrets.local.json');
  const dst = process.argv[3] || '.env.prod';
  if (!fs.existsSync(src)) {
    console.error(`Source not found: ${src}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(src, 'utf8');
  let j;
  try { j = JSON.parse(raw); } catch (e) {
    console.error('Invalid JSON in', src, e?.message || e);
    process.exit(1);
  }
  const env = { ...(j.env || {}) };
  // Enforce live-mode defaults unless explicitly overridden
  if (!('NODE_ENV' in env)) env.NODE_ENV = 'production';
  if (!('DEMO_MODE' in env)) env.DEMO_MODE = 'false';
  if (!('HTTP_ONLY' in env)) env.HTTP_ONLY = 'false';
  if (!('HEALTH_PORT' in env)) env.HEALTH_PORT = '3000';

  // Overlay preset if requested (no secrets added; only defaults)
  const preset = String(process.env.PRESET || '').toLowerCase();
  if (preset === 'live') {
    env.SECURITY_HEADERS = env.SECURITY_HEADERS ?? 'true';
    env.STRICT_CONTENT_TYPE = env.STRICT_CONTENT_TYPE ?? 'true';
    env.MAX_BODY_BYTES = env.MAX_BODY_BYTES ?? '65536';
    env.RL_ENABLED = env.RL_ENABLED ?? 'true';
    env.RL_WINDOW_MS = env.RL_WINDOW_MS ?? '10000';
    env.RL_MAX = env.RL_MAX ?? '20';
    env.DEMO_MODE = env.DEMO_MODE ?? 'false';
    env.HTTP_ONLY = env.HTTP_ONLY ?? 'false';
  } else if (preset === 'demo') {
    env.SECURITY_HEADERS = env.SECURITY_HEADERS ?? 'true';
    env.STRICT_CONTENT_TYPE = env.STRICT_CONTENT_TYPE ?? 'false';
    env.MAX_BODY_BYTES = env.MAX_BODY_BYTES ?? '65536';
    env.RL_ENABLED = env.RL_ENABLED ?? 'false';
    env.DEMO_MODE = env.DEMO_MODE ?? 'true';
    env.HTTP_ONLY = env.HTTP_ONLY ?? 'true';
  }

  // Normalize known values
  if (env.INK_RPC) env.INK_RPC = normalizeValue('INK_RPC', env.INK_RPC);

  const body = buildEnv(env);
  fs.writeFileSync(dst, body);
  console.log(`Wrote ${dst} with ${Object.keys(env).length} keys.`);
}

main();


