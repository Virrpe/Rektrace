import fs from 'node:fs';
import path from 'node:path';
import { maybeMask } from './log_mask.js';

type Decision = 'allow'|'deny'|'neutral';

let allowSet = new Set<string>();
let denySet = new Set<string>();

function loadFile(p: string): string[] {
  try {
    const b = fs.readFileSync(p, 'utf8');
    return b.split(/\r?\n/).map(s=>s.trim()).filter(s=>s && !s.startsWith('#'));
  } catch { return []; }
}

function normalize(entry: string): string { return entry.toLowerCase(); }

function reload() {
  const a = loadFile(path.resolve('ops/allowlist.txt')).map(normalize);
  const d = loadFile(path.resolve('ops/denylist.txt')).map(normalize);
  allowSet = new Set(a);
  denySet = new Set(d);
}

export function startRulesReload() {
  if (process.env.RULES_ENABLED !== 'true') return () => {};
  reload();
  const ms = Math.max(0, Number(process.env.RULES_RELOAD_MS ?? 0));
  if (ms <= 0) return () => {};
  const id = setInterval(reload, ms);
  return () => clearInterval(id);
}

export function ruleDecision(input: { chain?: string; token?: string; symbol?: string }): Decision {
  if (process.env.RULES_ENABLED !== 'true') return 'neutral';
  const keyParts: string[] = [];
  if (input.chain && input.token) keyParts.push(`${input.chain}:${input.token}`.toLowerCase());
  if (input.chain && input.symbol) keyParts.push(`${input.chain}:${input.symbol}`.toLowerCase());
  for (const k of keyParts) {
    if (denySet.has(k)) { try { console.warn(`[rules] deny ${maybeMask(k)}`); } catch {}; return 'deny'; }
    if (allowSet.has(k)) { try { console.log(`[rules] allow ${maybeMask(k)}`); } catch {}; return 'allow'; }
  }
  return 'neutral';
}


