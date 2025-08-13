#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

const required = [
  'docs/AUDIT.md', 'PRELAUNCH.md', 'OPERATIONS.md', 'API.md', 'CONFIG.md', 'SECURITY.md', 'TELEGRAM.md', 'CHANGELOG.md', 'CONTRIBUTING.md',
  '.github/ISSUE_TEMPLATE/bug_report.md', '.github/PULL_REQUEST_TEMPLATE.md',
  'docs/architecture.mmd', 'docs/flow_alerts.mmd', 'docs/TODO-LAUNCH.md'
];

function fail(msg: string) { console.error(msg); process.exitCode = 1; }

// presence
for (const f of required) {
  if (!fs.existsSync(f)) fail(`Missing required doc: ${f}`);
}

// simple relative link resolution inside top-level md files
const mdFiles = ['API.md', 'OPERATIONS.md', 'CONFIG.md', 'SECURITY.md', 'TELEGRAM.md', 'PRELAUNCH.md', 'docs/AUDIT.md'];
const linkRe = /\]\(([^)]+)\)/g;
for (const f of mdFiles) {
  const body = fs.readFileSync(f, 'utf8');
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(body))) {
    const href = m[1];
    if (href.startsWith('http') || href.startsWith('#')) continue;
    const p = path.resolve(path.dirname(f), href);
    if (!fs.existsSync(p)) fail(`Broken link in ${f}: ${href}`);
  }
}

// env.prod.sample keys vs CONFIG required list
const envPath = fs.existsSync('.env.prod.sample') ? '.env.prod.sample' : (fs.existsSync('env.prod.sample') ? 'env.prod.sample' : '');
if (envPath) {
  const envKeys = new Set(fs.readFileSync(envPath, 'utf8').split(/\r?\n/).map(l=>l.split('=')[0]).filter(k=>k && !k.startsWith('#')));
  const requiredKeys = ['TELEGRAM_BOT_TOKEN','API_KEY','GLOBAL_QPS','ALERT_THROTTLE_MIN','ALERTS_CHECK_INTERVAL_MS','ALERT_SCORE_DROP','COVALENT_API_KEY'];
  for (const k of requiredKeys) if (!envKeys.has(k)) fail(`Missing key in ${envPath}: ${k}`);
}

console.log('Docs check completed');


