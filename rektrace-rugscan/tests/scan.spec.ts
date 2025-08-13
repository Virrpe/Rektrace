import { describe, it, expect } from 'vitest';
import { scanToken } from '../src/scan.js';

describe('rugscan demo mode', () => {
  it('returns demo results in DEMO_MODE', async () => {
    process.env.DEMO_MODE = 'true';
    const res = await scanToken('demo-token');
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.items.length).toBeGreaterThan(0);
      expect(res.items[0].score).toBeGreaterThan(0);
    }
  });
});


