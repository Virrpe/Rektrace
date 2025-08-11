const SHORTENER_SET = new Set([
  'bit.ly','t.co','tinyurl.com','goo.gl','ow.ly','is.gd','cutt.ly','linktr.ee'
]);

export function isShortener(u: string): boolean {
  try { return SHORTENER_SET.has(new URL(u).hostname.toLowerCase()); }
  catch { return false; }
}

export function isProbablyUrl(s: string): boolean {
  try { new URL(s); return true; } catch { return false; }
}


