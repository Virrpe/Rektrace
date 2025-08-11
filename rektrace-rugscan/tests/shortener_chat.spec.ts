import { describe, it, expect } from 'vitest';
import { isShortener, isProbablyUrl } from '../src/url.js';

describe('shortener guard', () => {
  it('detects common shorteners', () => {
    expect(isProbablyUrl('https://t.co/abc')).toBe(true);
    expect(isShortener('https://t.co/abc')).toBe(true);
    expect(isShortener('https://bit.ly/abc')).toBe(true);
    expect(isShortener('https://uniswap.org')).toBe(false);
  });
});


