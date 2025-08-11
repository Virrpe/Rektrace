// Simple module to record recent low scores without creating circular deps
const RECENT: { ts:number; chain:string; address:string; score:number }[] = [];

export default function trackRecent(chain: string, address: string, score: number) {
  RECENT.unshift({ ts: Date.now(), chain, address, score });
  if (RECENT.length > 500) RECENT.pop();
}

export function getRecent() { return RECENT.slice(); }


