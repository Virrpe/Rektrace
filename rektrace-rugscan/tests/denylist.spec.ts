import { describe, it, expect } from 'vitest';
import { isShortener } from '../src/url.js';

describe('shortener denylist', () => {
  it('blocks known shorteners', () => {
    expect(isShortener('https://bit.ly/abc')).toBe(true);
    expect(isShortener('https://t.co/x')).toBe(true);
    expect(isShortener('https://linktr.ee/x')).toBe(true);
  });
  it('allows normal domains', () => {
    expect(isShortener('https://example.com/a')).toBe(false);
    expect(isShortener('not a url')).toBe(false);
  });
});


