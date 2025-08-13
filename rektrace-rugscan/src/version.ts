import fs from 'node:fs';
import { configFingerprint } from '../../src/observability/fingerprint.js';

function readPackageVersion(): string {
  try {
    const txt = fs.readFileSync('package.json', 'utf8');
    const j = JSON.parse(txt);
    return String(j.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}

export function currentVersion() {
  const version = readPackageVersion();
  const git_commit = process.env.GIT_COMMIT || undefined;
  let fingerprint_sha256: string | undefined;
  try { fingerprint_sha256 = configFingerprint().fingerprint_sha256; } catch {}
  const built_at = process.env.BUILT_AT || new Date().toISOString();
  return { version, git_commit, fingerprint_sha256, built_at };
}


