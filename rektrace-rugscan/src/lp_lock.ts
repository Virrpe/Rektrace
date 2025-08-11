export type LPLockInfo = { lockedPct?: number; burned?: boolean; unlockDays?: number; locker?: 'unicrypt'|'team'|'pink'|'unknown' };

export function parseLpFromDexScreenerPair(pick: any): LPLockInfo {
  const out: LPLockInfo = {};
  // attempt to parse lockers array
  const lockers = pick?.liquidity?.lockers || pick?.liquidity?.locked || pick?.liquidity?.locks;
  if (Array.isArray(lockers) && lockers.length) {
    let maxPct = 0; let soonestUnlock: number | undefined; let lockerName: string | undefined;
    for (const l of lockers) {
      const pct = Number(l.percent || l.pct || 0);
      if (pct > maxPct) maxPct = pct;
      const until = Number(l.unlockAt || l.unlock_at || l.unlockTime || 0);
      if (until && (!soonestUnlock || until < soonestUnlock)) soonestUnlock = until;
      const prov = String(l.locker || l.provider || l.platform || '').toLowerCase();
      if (prov) lockerName = prov;
    }
    if (maxPct > 0) out.lockedPct = maxPct;
    if (soonestUnlock) {
      const tsMs = soonestUnlock > 2_000_000_000 ? soonestUnlock : soonestUnlock * 1000;
      out.unlockDays = Math.max(0, Math.floor((tsMs - Date.now()) / 86_400_000));
    }
    if (lockerName) {
      if (lockerName.includes('unicrypt')) out.locker = 'unicrypt';
      else if (lockerName.includes('team')) out.locker = 'team';
      else if (lockerName.includes('pink')) out.locker = 'pink';
      else out.locker = 'unknown';
    }
  }
  const renounced = pick?.owner?.isRenounced || pick?.owner?.renounced;
  if (renounced) out.burned = true;
  return out;
}


