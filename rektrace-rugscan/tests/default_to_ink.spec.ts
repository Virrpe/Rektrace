import { describe, it, expect, beforeEach } from 'vitest';
import { scanToken } from '../src/scan.js';
import { normalizeToInk } from '../src/commands.js';

describe('default-to-ink parsing', () => {
  beforeEach(()=> { process.env.DEMO_MODE = 'true'; });
  it('prefixes ink: when missing', async () => {
    expect(normalizeToInk('pepe')).toBe('ink:pepe');
    expect(normalizeToInk('ink:pepe')).toBe('ink:pepe');
    expect(normalizeToInk('eth:pepe')).toBe('eth:pepe');
  });
  it('scan works with normalized query (ok or ambiguous in demo)', async () => {
    const res = await scanToken(normalizeToInk('pepe'));
    expect(['ok','ambiguous']).toContain(res.status);
  });
});

