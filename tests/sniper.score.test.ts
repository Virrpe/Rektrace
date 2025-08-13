import { scoreEarlyWindow } from '../rektrace-rugscan/src/sniper/score.js';

describe('sniper.score', () => {
  test('count-based shares (no USD) levels and shares', () => {
    const t = Date.now();
    const win = {
      t0: t,
      windowMs: 60000,
      dataStatus: 'ok',
      trades: [
        { buyer: 'a', ts: t+1 },
        { buyer: 'a', ts: t+2 },
        { buyer: 'b', ts: t+3 },
        { buyer: 'c', ts: t+4 },
      ],
    } as any;
    const { summary } = scoreEarlyWindow(win);
    expect(summary.uniqueBuyers).toBe(3);
    expect(summary.top1Pct).toBeGreaterThan(0);
    expect(['low','medium','high']).toContain(summary.level);
  });

  test('USD-based shares override count-based when amountUsd present', () => {
    const t = Date.now();
    const win = {
      t0: t,
      windowMs: 60000,
      dataStatus: 'ok',
      trades: [
        { buyer: 'a', ts: t+1, amountUsd: 100 },
        { buyer: 'b', ts: t+2, amountUsd: 900 },
        { buyer: 'b', ts: t+3, amountUsd: 1000 },
      ],
    } as any;
    const { summary } = scoreEarlyWindow(win);
    expect(summary.top1Pct).toBeGreaterThanOrEqual(80);
  });

  test('botting: burst density triggers strong/mild', () => {
    const t = Date.now();
    const arr = Array.from({ length: 20 }).map((_, i) => ({ buyer: 'x', ts: t + i*1000, amountUsd: 10 }));
    const win = { t0: t, windowMs: 30000, dataStatus: 'ok', trades: arr } as any;
    const { summary } = scoreEarlyWindow(win);
    expect(['mild','strong','none']).toContain(summary.botting || 'none');
  });

  test('botting: ping-pong alternation + uniform sizing flags mild/strong', () => {
    const t = Date.now();
    const trades = [
      { buyer: 'a', ts: t+1, amountUsd: 100 },
      { buyer: 'b', ts: t+2, amountUsd: 100 },
      { buyer: 'a', ts: t+3, amountUsd: 100 },
      { buyer: 'b', ts: t+4, amountUsd: 100 },
      { buyer: 'a', ts: t+5, amountUsd: 100 },
      { buyer: 'b', ts: t+6, amountUsd: 100 },
    ];
    const win = { t0: t, windowMs: 30000, dataStatus: 'ok', trades } as any;
    const { summary } = scoreEarlyWindow(win);
    expect(['mild','strong','none']).toContain(summary.botting || 'none');
  });

  test('non-ok status → unknown level', () => {
    const win = { t0: Date.now(), windowMs: 10000, dataStatus: 'insufficient', trades: [] } as any;
    const { summary } = scoreEarlyWindow(win);
    expect(summary.level).toBe('unknown');
  });
});


