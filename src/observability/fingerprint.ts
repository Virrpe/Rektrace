import crypto from 'node:crypto';
import fs from 'node:fs';

function fileInfo(p: string) {
  try { const st = fs.statSync(p); return `${p}:${st.size}:${st.mtimeMs}`; } catch { return `${p}:missing`; }
}

export function configFingerprint() {
  const preset = process.env.PRESET || '';
  const rl = { window: Number(process.env.RL_WINDOW_MS ?? 10000), max: Number(process.env.RL_MAX ?? 20) };
  const strictCT = process.env.STRICT_CONTENT_TYPE === 'true';
  const headersOn = process.env.SECURITY_HEADERS !== 'false';
  const bits = [
    `PRESET=${preset}`,
    `RL_WINDOW_MS=${rl.window}`,
    `RL_MAX=${rl.max}`,
    `STRICT_CONTENT_TYPE=${strictCT}`,
    `SECURITY_HEADERS=${headersOn}`,
    fileInfo('ops/allowlist.txt'),
    fileInfo('ops/denylist.txt'),
  ].join('|');
  const sha = crypto.createHash('sha256').update(bits).digest('hex');
  return { fingerprint_sha256: sha, preset, rl, strictCT, headersOn };
}


