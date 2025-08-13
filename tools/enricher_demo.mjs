import { scoreWithCpp } from "../dist/src/utils/cppScore.js";

const chain = "eth";
const address = "0x0000000000000000000000000000000000000000";
const holders = 950;
const lp_locked = true;
const risk = 0.1;
const threshold = 0.75;

const r = await scoreWithCpp({ holders, lp_locked, risk });
const traceId = `rt-${Date.now()}`;
if (r.ok && r.score >= threshold) {
  const text = `ALERT\nchain:${chain}\naddr:${address}\nscore:${r.score.toFixed(2)}\nreason:${r.reason}\ntrace:${traceId}`;
  console.log(text);
} else {
  console.log(`NO ALERT score=${r.score.toFixed(2)} reason=${r.reason}`);
}


