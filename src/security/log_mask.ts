export const mask = (s: string, keep = 6) => (s && s.length > keep * 2 ? s.slice(0, keep) + '…' + s.slice(-keep) : s);
export const maskAddr = (s?: string) => (s ? mask(s.toLowerCase(), 6) : s);
export const maskHash = (s?: string) => (s ? mask(s.toLowerCase(), 8) : s);
export const maskText = (s?: string) => (s ? s.replace(/0x[a-f0-9]{40,64}/gi, (m) => mask(m, 8)) : s);
export const maybeMask = <T extends string | undefined>(s: T, enabled = process.env.PII_MASK !== 'false') => (enabled ? (maskText(s as any) as T) : s);


