#!/usr/bin/env node
const crypto = require('crypto');

const secret = process.env.HMAC_API_SECRET || '';
if (!secret) { console.error('HMAC_API_SECRET required in env'); process.exit(1); }

const method = process.argv[2] || 'GET';
const body = process.argv[3] || '';
const ts = String(Date.now());
const sig = crypto.createHash('sha256').update(ts + body).digest('hex');

console.log('X-Timestamp: ' + ts);
console.log('X-Signature: ' + sig);
console.log('# Example:');
console.log(`curl -fsS -H "X-Timestamp: ${ts}" -H "X-Signature: ${sig}" -X ${method} "$BASE/signals"`);


