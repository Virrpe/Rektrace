// Lightweight, dependency-free validators for RugScan outputs

export type InvariantResult = { ok: boolean; errs: string[] };

const CHAIN_SET = new Set([
  'ethereum','binance-smart-chain','polygon-pos','arbitrum-one','optimistic-ethereum','avalanche','fantom','base','solana','ink'
]);

export function validateScanResponse(obj: any): InvariantResult {
  const errs: string[] = [];
  const st = obj?.status;
  if (!['ok','ambiguous','not_found','error'].includes(st)) errs.push('status.invalid');
  if (st === 'ok') {
    if (!Array.isArray(obj.items) || obj.items.length === 0) errs.push('items.missing');
    for (let i=0;i<(obj.items?.length||0);i++) {
      const it = obj.items[i];
      if (!CHAIN_SET.has(String(it?.chain))) errs.push(`items[${i}].chain.invalid`);
      if (typeof it?.address !== 'string' || !it.address) errs.push(`items[${i}].address.invalid`);
      if (!Number.isFinite(Number(it?.score)) || it.score < 0 || it.score > 100) errs.push(`items[${i}].score.range`);
      if (!Array.isArray(it?.flags)) errs.push(`items[${i}].flags.invalid`);
      if (!Array.isArray(it?.sources) || (it.sources.some((s:any)=> typeof s !== 'string' || !s))) errs.push(`items[${i}].sources.invalid`);
    }
  }
  if (st === 'ambiguous') {
    if (!Array.isArray(obj.suggestions) || obj.suggestions.length === 0) errs.push('suggestions.missing');
    else {
      for (let i=0;i<obj.suggestions.length;i++) {
        const s = obj.suggestions[i];
        if (typeof s?.label !== 'string' || !s.label) errs.push(`suggestions[${i}].label.invalid`);
        if (typeof s?.chain !== 'string' || !s.chain) errs.push(`suggestions[${i}].chain.invalid`);
        if (typeof s?.address !== 'string' || !s.address) errs.push(`suggestions[${i}].address.invalid`);
      }
    }
  }
  if (st === 'error') {
    if (typeof obj?.message !== 'string' || !obj.message) errs.push('message.missing');
  }

  // Soft checks (non-fatal): lowercase hex for EVM addresses
  if (st === 'ok') {
    for (let i=0;i<(obj.items?.length||0);i++) {
      const it = obj.items[i];
      if (it?.chain !== 'solana' && typeof it?.address === 'string') {
        const a = it.address;
        if (/^0x/i.test(a)) {
          if (!/^0x[a-f0-9]{40}$/.test(a)) errs.push(`items[${i}].address.format`);
        }
      }
    }
  }

  return { ok: errs.length === 0, errs };
}

export function maskInvariantErrors(errs: string[]): string {
  // Provide a compact, non-PII summary
  const uniq = Array.from(new Set(errs)).slice(0, 10);
  return uniq.join(', ');
}


