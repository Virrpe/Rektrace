import { describe, it, expect } from 'vitest';
import { formatCompactCard } from '../src/commands.js';

describe('inline share compact card', () => {
  it('renders compact card with explorer link', () => {
    const s = formatCompactCard({ chain: 'ink', address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', score: 80, holders: 1234 });
    expect(s).toContain('Explorer');
    expect(s).toContain('score');
  });
});

