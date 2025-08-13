import { describe, it, expect } from 'vitest';
import { escapeMD } from '../../src/ui.js';

describe('markdown escaping', () => {
  it('escapes special characters', () => {
    const s = '_*[]()~`>#+-=|{}.!';
    const e = escapeMD(s);
    expect(e).toBe('\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!');
  });
});


