#!/usr/bin/env node
// CommonJS (Node 20)
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.resolve('.env.prod');

/**
 * Merge defaults only for missing keys without changing existing values.
 * Preserve existing order; append missing keys at the end.
 */
const DEFAULTS = {
  DEMO_MODE: 'false',
  HTTP_ONLY: 'false',
  SIGNALS_ENABLED: 'false',
  SIGNALS_BROADCAST_ENABLED: 'false',
  SIGNALS_WS_ENABLED: 'false',
  STRICT_CONTENT_TYPE: 'true',
  RL_ENABLED: 'true',
  INVARIANTS_STRICT: 'true',
  IDEMP_ENABLED: 'false',
  JSON_LOGS: 'true',
  HEALTH_PORT: '8081',
  SNIPER_T_SECONDS: '120',
  SNIPER_MIN_USD: '200',
  SNIPER_TOP1_HI: '12',
  SNIPER_TOP3_HI: '25',
  BOT_BURST_TRADES: '15',
  BOT_BURST_WINDOW_S: '30',
  BOT_PINGPONG_MIN: '6',
  BOT_UNIFORM_COEF: '0.1',
  EXPLORER_FALLBACK_ENABLED: 'false',
};

const REQUIRED = ['TELEGRAM_BOT_TOKEN', 'ADMIN_IDS'];
const OPTIONAL = ['COVALENT_API_KEY', 'EXPLORER_FALLBACK_ENABLED', 'EXPLORER_BASE_URL_INK', 'HEALTH_PORT'];

function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function readEnvFile(file) {
  if (!fs.existsSync(file)) return { lines: [], map: {} };
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split(/\r?\n/);
  const map = {};
  for (const line of lines) {
    if (!line || /^\s*#/.test(line)) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const k = m[1];
    const v = m[2];
    map[k] = v;
  }
  return { lines, map };
}

function writeEnvFile(file, lines) {
  fs.writeFileSync(file, lines.join('\n'), { encoding: 'utf8' });
}

function mergeDefaults(existingLines, existingMap) {
  const outLines = existingLines.slice();
  const present = new Set(Object.keys(existingMap));
  const toAppend = [];
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (!present.has(k)) {
      toAppend.push(`${k}=${v}`);
    }
  }
  if (toAppend.length) {
    if (outLines.length && outLines[outLines.length - 1] !== '') outLines.push('');
    outLines.push('# --- Appended defaults (missing before) ---');
    outLines.push(...toAppend);
  }
  return outLines;
}

function summarize(map) {
  // Normalize ADMIN_IDS for presence only and trimming; do not change file values here
  const adminIds = (map.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const hasToken = !!(map.TELEGRAM_BOT_TOKEN);
  const hasAdmins = adminIds.length > 0;
  const opt = {
    COVALENT_API_KEY: map.COVALENT_API_KEY ? 'yes' : 'no',
    EXPLORER_FALLBACK_ENABLED: (map.EXPLORER_FALLBACK_ENABLED ?? DEFAULTS.EXPLORER_FALLBACK_ENABLED),
    EXPLORER_BASE_URL_INK: map.EXPLORER_BASE_URL_INK ? 'yes' : 'no',
    HEALTH_PORT: map.HEALTH_PORT || DEFAULTS.HEALTH_PORT,
  };
  return { hasToken, hasAdmins, opt };
}

function main() {
  const { lines, map } = readEnvFile(ENV_PATH);
  const beforeExists = fs.existsSync(ENV_PATH);
  const mergedLines = mergeDefaults(lines, map);
  const changed = mergedLines.join('\n') !== lines.join('\n');
  let backupCreated = false;
  try {
    if (beforeExists) {
      const bak = `${ENV_PATH}.bak.${ts()}`;
      fs.copyFileSync(ENV_PATH, bak);
      backupCreated = true;
    }
    writeEnvFile(ENV_PATH, mergedLines);
  } catch (e) {
    console.error('env: failed to write .env.prod');
    process.exit(1);
  }

  const after = readEnvFile(ENV_PATH).map;
  const { hasToken, hasAdmins, opt } = summarize(after);

  console.log(`env: .env.prod updated (backup created: ${backupCreated ? 'yes' : 'no'})`);
  console.log(`required keys present: TELEGRAM_BOT_TOKEN: ${hasToken ? 'yes' : 'no'}, ADMIN_IDS: ${hasAdmins ? 'yes' : 'no'}`);
  console.log(`optional: COVALENT_API_KEY: ${opt.COVALENT_API_KEY}, EXPLORER_FALLBACK_ENABLED: ${opt.EXPLORER_FALLBACK_ENABLED}, EXPLORER_BASE_URL_INK: ${opt.EXPLORER_BASE_URL_INK}, HEALTH_PORT: ${opt.HEALTH_PORT}`);

  if (!hasToken || !hasAdmins) {
    // Exit 2 as requested to let wrapper prompt the user
    process.exit(2);
  }

  process.exit(0);
}

try {
  main();
} catch {
  process.exit(1);
}


