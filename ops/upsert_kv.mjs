#!/usr/bin/env node
import fs from 'fs';

const [, , key, value] = process.argv;
if (!key || typeof value === 'undefined') {
  console.error('Usage: node ops/upsert_kv.mjs KEY VALUE');
  process.exit(2);
}

const envPath = '.env.prod';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let t = fs.readFileSync(envPath, 'utf8');
const re = new RegExp('^' + esc(key) + '=.*$', 'm');
t = re.test(t) ? t.replace(re, `${key}=${value}`) : (t + `\n${key}=${value}`);
fs.writeFileSync(envPath, t);
console.log(`upserted ${key}`);


