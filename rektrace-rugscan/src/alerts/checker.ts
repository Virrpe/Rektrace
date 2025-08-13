import { subscribers, listAllTokenSubs, getMeta, setMeta, type SubKey, getPref } from '../alerts_sub.js';
import { scanTokenExact } from '../scan.js';
import { AlertThrottler } from '../alerts/throttler.js';
import { dmCap } from './dm_cap.js';

const ALERT_SCORE_DROP = Number(process.env.ALERT_SCORE_DROP ?? 10);
const throttle = new AlertThrottler(() => Math.max(1, Number(process.env.ALERT_THROTTLE_MIN ?? 10)) * 60_000);

let nextRunAt: number | null = null;
let totalSubscribedTokens = 0;

export function getAlertsStats() {
  return { nextRunAt, totalSubscribedTokens };
}

export async function runAlertsPass(sender: (chatId: number, text: string) => Promise<void>) {
  const start = Date.now();
  const list: SubKey[] = await listAllTokenSubs();
  totalSubscribedTokens = list.length;
  nextRunAt = start + Number(process.env.ALERTS_CHECK_INTERVAL_MS ?? 600_000);
  for (const sub of list) {
    try {
      const res = await scanTokenExact(sub.token, { chain: sub.chain, address: sub.token });
      if (res.status !== 'ok' || !res.items.length) continue;
      const item = res.items[0];
      const meta = await getMeta(sub);

      const exampleChat = (await subscribers(sub))[0] || 0; // use any subscriber to fetch pref
      const pref = await getPref(exampleChat, sub);
      const dropThresh = Number.isFinite(pref.drop) ? pref.drop : ALERT_SCORE_DROP;
      const unlockDays = Number.isFinite(pref.unlockDays) ? pref.unlockDays : 7;
      const notifyScoreDrop = meta.lastScore != null && item.score <= meta.lastScore - dropThresh;
      const lpUnlockFlag = (item.flags || []).some(f => {
        if (!/^lp_unlock_<\d+d$/.test(f)) return false;
        const m = f.match(/<(\d+)d/);
        const val = m && m[1] ? Number(m[1]) : 999;
        return val <= unlockDays;
      });
      const notifyUnlock = lpUnlockFlag && !meta.lpUnlock7dNotified;

      if (notifyScoreDrop || notifyUnlock) {
        const key = `${sub.chain}:${sub.token}`;
        if (throttle.shouldNotify(key)) {
          const chats = await subscribers(sub);
          const msg = notifyScoreDrop
            ? `⚠️ Risk signals changed for ${sub.chain}:${sub.token}. Score dropped to ${item.score}.`
            : `⚠️ LP unlock < 7d detected for ${sub.chain}:${sub.token}.`;
          for (const chatId of chats) {
            if (!dmCap.allow(chatId)) continue;
            try { await sender(chatId, msg); } catch {}
          }
          // allow re-alert after throttle window even if score unchanged
          await setMeta(sub, { lpUnlock7dNotified: lpUnlockFlag || meta.lpUnlock7dNotified });
        }
      } else {
        await setMeta(sub, { lastScore: item.score });
      }
    } catch {}
  }
}


