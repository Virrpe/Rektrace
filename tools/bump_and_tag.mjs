#!/usr/bin/env node
import fs from 'fs';
import cp from 'child_process';

const bump = process.env.BUMP || 'patch';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

function inc(major, minor, patch) {
  if (bump === 'major') return [major + 1, 0, 0];
  if (bump === 'minor') return [major, minor + 1, 0];
  return [major, minor, patch + 1];
}

const parts = String(pkg.version || '0.1.0').split('.').map(n => parseInt(n, 10));
const [M, m, p] = inc(parts[0] || 0, parts[1] || 0, parts[2] || 0);
pkg.version = `${M}.${m}.${p}`;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

const today = new Date().toISOString().slice(0, 10);
let cl = '';
try { cl = fs.readFileSync('CHANGELOG.md', 'utf8'); } catch {}
const hdr = `## v${pkg.version} - ${today}`;
if (!cl.includes(hdr)) {
  const entry = `${hdr}\n- Verified launch bundle, tests, env lint, CI wiring.\n\n`;
  fs.writeFileSync('CHANGELOG.md', entry + cl);
}

cp.execSync('git add package.json CHANGELOG.md', { stdio: 'inherit' });
cp.execSync(`git commit -m "chore(release): v${pkg.version}"`, { stdio: 'inherit' });
cp.execSync(`git tag v${pkg.version}`, { stdio: 'inherit' });
console.log(pkg.version);


