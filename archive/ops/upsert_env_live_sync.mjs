// Archived copy of ops/upsert_env_live_sync.mjs (see archive/README.md)
import fs from 'fs';
const p = '.env.prod';
let t = fs.readFileSync(p,'utf8');
const upsert = (k,v) => {
  const re = new RegExp('^'+k.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')+'=.*$','m');
  t = re.test(t) ? t.replace(re, `${k}=${v}`) : (t + `\n${k}=${v}`);
};
upsert('HTTP_ONLY','true');
upsert('DEMO_MODE','false');
upsert('STRICT_CONTENT_TYPE','true');
upsert('RL_ENABLED','true');
upsert('IDEMP_ENABLED','true');
upsert('INVARIANTS_STRICT','true');
upsert('JSON_LOGS','true');
upsert('HEALTH_PORT','8081');
upsert('SIGNALS_ENABLED','true');
upsert('SIGNALS_BROADCAST_ENABLED','false');
upsert('SIGNALS_SOURCE','poll');
upsert('SIGNALS_POLL_MS','5000');
upsert('SIGNALS_CHAINS','ink');
upsert('SIGNALS_WS_ENABLED','false');
fs.writeFileSync(p, t);

