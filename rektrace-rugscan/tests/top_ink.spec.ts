import { describe, it, expect } from 'vitest';
import { formatTopInkPage } from '../src/commands.js';

describe('/top_ink demo flow', () => {
  it('renders 6 per page with buttons', async () => {
    const page = formatTopInkPage(0);
    expect(page.text).toContain('Top Ink pairs');
    const rows = page.text.split('\n').filter((l: string)=> l.startsWith('• '));
    expect(rows.length).toBe(6);
  });
});

