// Archived copy of ops/upsert_chains_both.mjs (see archive/README.md)
import fs from 'fs';
const p = '.env.prod';
let t = fs.readFileSync(p,'utf8');
const upsert = (k,v)=>{ const re=new RegExp('^'+k.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')+'=.*$','m'); t = re.test(t) ? t.replace(re, `${k}=${v}`) : (t + `\n${k}=${v}`); };
upsert('SIGNALS_ENABLED','true');
upsert('SIGNALS_BROADCAST_ENABLED','false');
upsert('SIGNALS_SOURCE','poll');
upsert('SIGNALS_POLL_MS','5000');
upsert('SIGNALS_CHAINS','ink,ethereum');
upsert('SIGNALS_WS_ENABLED','false');
fs.writeFileSync(p, t);

