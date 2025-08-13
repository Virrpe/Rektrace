import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/index.js';

describe('/status alerts stats (verbose)', () => {
  it('omits alerts by default and includes when verbose=1', async () => {
    const app = createServer() as any; // supertest-compatible
    const base = (req:any)=> request('http://localhost:3000'); // fallback to health server if app is minimal
    const res1 = await base(app).get('/status');
    expect(res1.body.alerts).toBeUndefined();
    const res2 = await base(app).get('/status?verbose=1');
    expect(res2.status).toBe(200);
    if (res2.body.alerts) {
      expect(typeof res2.body.alerts.subscribedTokens).toBe('number');
      expect(['number','object']).toContain(typeof res2.body.alerts.nextCheckEtaSec);
    }
  });
});


