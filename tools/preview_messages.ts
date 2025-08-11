import fs from 'node:fs';
import path from 'node:path';
import { renderHoldersCard, Divider } from '../src/ui.js';

function htmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function mdBlock(title: string, md: string) {
  return `<section style="margin:16px 0;padding:12px;border:1px solid #ddd;border-radius:8px;">
<h3 style="margin-top:0;font-family:ui-sans-serif,system-ui;">${htmlEscape(title)}</h3>
<pre style="white-space:pre-wrap;word-wrap:break-word;background:#fafafa;padding:12px;border-radius:6px;">${htmlEscape(md)}</pre>
</section>`;
}

function renderDemoCards() {
  process.env.DEMO_MODE = 'true';
  const base = renderHoldersCard({
    tokenLabel: 'PEPE',
    chains: ['ethereum','binance-smart-chain','polygon-pos','solana'],
    rows: [
      { chain: 'ethereum', contract: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', holders: 12345, source: 'demo' },
      { chain: 'binance-smart-chain', contract: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', holders: 8901, source: 'demo' },
      { chain: 'polygon-pos', contract: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', holders: 7777, source: 'demo' },
      { chain: 'solana', contract: 'So11111111111111111111111111111111111111112', holders: 6543, source: 'demo' },
    ],
    total: 12345 + 8901 + 7777 + 6543,
    confidence: 'green',
    affiliateText: 'Trade on ExampleX — https://example.com/ref',
    proEnabled: true,
  });

  const plus = [
    `🧪 Rug Scan+ for *PEPE* (demo)`,
    `ETH — score *78* — holders: 12,345`,
    `  trades: 🟢 $1,200  🔴 $800`,
    Divider,
    `Consensus: *75* → APPROVED`,
  ].join('\n');
  return { base, plus };
}

function main() {
  const { base, plus } = renderDemoCards();
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Telegram Messages Preview</title></head>
<body style="max-width:900px;margin:24px auto;padding:0 16px;font-family:ui-sans-serif,system-ui;">
<h1 style="font-size:20px;">Telegram MarkdownV2 Messages Preview</h1>
<p>These are raw Markdown messages as sent to Telegram. Verify headings, flags, LP lock/burn/unlockDays, holders confidence, and button labels.</p>
${mdBlock('Scan Card', base)}
${mdBlock('Scan Plus', plus)}
</body></html>`;
  const out = path.join('preview', 'messages.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf8');
  console.log('Wrote', out);
}

main();


