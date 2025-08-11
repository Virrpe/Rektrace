import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';

const W = 1200, H = 630, PAD = 64;
function arg(name: string, def = '') { const i = process.argv.indexOf(`--${name}`); return i > -1 ? (process.argv[i + 1] || def) : def; }

const title = arg('title', 'RekTrace x Ink');
const metric = arg('metric', 'Trace any token across chains.');
const cta = arg('cta', 'Open in Telegram');
const out = arg('out', 'banner.png');
const logoPath = arg('logo', 'assets/ink/logo.svg');
const fontPath = arg('font', 'assets/ink/fonts/Ink-Headline.otf');

try { if (fs.existsSync(fontPath)) GlobalFonts.registerFromPath(fontPath, 'InkHeadline'); } catch {}
const FONT_HEAD = GlobalFonts.has('InkHeadline') ? 'InkHeadline' : 'Inter';
const FONT_BODY = 'Inter';

function drawGradient(ctx: any) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#6A00FF');
  g.addColorStop(1, '#00C6AE');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const v = ctx.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, 'rgba(0,0,0,0.15)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

function drawText(ctx: any) {
  ctx.fillStyle = '#FFFFFF'; ctx.font = `700 72px ${FONT_HEAD}`; ctx.textBaseline = 'top';
  ctx.fillText(title, PAD, PAD, W - PAD * 2);
  ctx.font = `600 44px ${FONT_BODY}`; ctx.fillStyle = '#E8EEFF';
  ctx.fillText(metric, PAD, PAD + 120, W - PAD * 2);
  const pillW = 520, pillH = 72; const x = PAD, y = H - PAD - pillH; const r = 18;
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + pillW, y, x + pillW, y + pillH, r);
  ctx.arcTo(x + pillW, y + pillH, x, y + pillH, r);
  ctx.arcTo(x, y + pillH, x, y, r);
  ctx.arcTo(x, y, x + pillW, y, r); ctx.closePath();
  ctx.fillStyle = '#0A0F2C'; ctx.fill();
  ctx.font = `700 32px ${FONT_BODY}`; ctx.fillStyle = '#39FF88';
  ctx.fillText(cta, x + 28, y + 20);
}

async function drawLogo(ctx: any) {
  try { if (!logoPath || !fs.existsSync(logoPath)) return;
    const img = await loadImage(logoPath as any);
    const w = 120, h = 120; ctx.globalAlpha = 0.9; ctx.drawImage(img as any, W - PAD - w, PAD, w, h); ctx.globalAlpha = 1;
  } catch {}
}

async function main() {
  const canvas = createCanvas(W, H); const ctx = canvas.getContext('2d');
  drawGradient(ctx); drawText(ctx); await drawLogo(ctx);
  const buf = await canvas.encode('png'); const dir = path.dirname(out);
  if (dir && dir !== '.' && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(out, buf);
  console.log(`Banner written: ${out}`);
}
main();
