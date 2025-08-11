import { request as rq } from 'undici';

export async function domainAgeDays(urlStr: string): Promise<number | null> {
  try {
    const u = new URL(urlStr);
    const host = u.hostname;
    const r = await rq(`https://rdap.org/domain/${host}`);
    if (r.statusCode === 200) {
      const j: any = await r.body.json();
      const events = j.events || [];
      const reg = events.find((e:any)=> e.eventAction==='registration' || e.eventAction==='registered');
      const date = reg?.eventDate || j.events?.[0]?.eventDate;
      if (date) {
        const d = new Date(date).getTime();
        return Math.floor((Date.now() - d) / 86400000);
      }
    }
  } catch {}
  return null;
}

export async function isMatureDomain(urlStr: string, minDays = 30): Promise<{ok:boolean, days:number|null}> {
  const days = await domainAgeDays(urlStr);
  return { ok: days !== null ? days >= minDays : false, days };
}
