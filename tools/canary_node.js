// tools/canary_node.js
// Node-only canary harness: starts server (optional), warms, bursts, evaluates gates, writes JSON reports.
// Cross-platform (Windows-friendly). Requires Node 18+ (global fetch).
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const env = process.env;
const START_SERVER = (env.START_SERVER ?? "true").toLowerCase() !== "false";
const HTTP_ONLY = (env.HTTP_ONLY ?? "true").toLowerCase() !== "false"; // default true for canary
const DEMO_MODE = (env.DEMO_MODE ?? "false").toLowerCase() === "true";
const CHAIN = env.CHAIN || "ink";
const TOKEN = env.TOKEN || "pepe";
const API_KEY = env.API_KEY || "demo_key";
const HEALTH_PORT = Number(env.HEALTH_PORT || (3000 + Math.floor(Math.random() * 1000)));
const HOST = env.HOST || "127.0.0.1";
const BASE = `http://${HOST}:${HEALTH_PORT}`;
const BUILD_CMD = env.BUILD_CMD || "pnpm run rugscan:build";
const ENTRY = env.ENTRY || "dist/rektrace-rugscan/rektrace-rugscan/src/index.js";
const WARM_REQUESTS = Number(env.WARM_REQUESTS || 10);
const BURST_REQUESTS = Number(env.BURST_REQUESTS || 12);

const GATES = {
  httpP90Ms: 2500,    // HTTP p90 <= 2.5s
  tgP90Ms: 3000,      // not measured here (HTTP-only)
  providerP90Ms: 2200,// FYI from /metrics rollups
  providerErrPct: 5,  // <=5%
  availErrPct: 0.1,   // ~99.9% proxy in window
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function pQuantile(arr, p) {
  if (!arr.length) return null;
  const a = [...arr].sort((x,y)=>x-y);
  const idx = Math.floor((p/100) * (a.length - 1));
  return a[idx];
}

async function httpGet(url, headers = {}) {
  const t0 = performance.now();
  const res = await fetch(url, { headers });
  const t1 = performance.now();
  const txt = await res.text();
  let json = null;
  try { json = JSON.parse(txt); } catch {}
  return { ok: res.ok, status: res.status, ms: t1 - t0, json, txt };
}

async function httpPost(url, body, headers = {}) {
  const t0 = performance.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const t1 = performance.now();
  const txt = await res.text();
  let json = null;
  try { json = JSON.parse(txt); } catch {}
  return { ok: res.ok, status: res.status, ms: t1 - t0, json, txt };
}

async function waitForServerReady(maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await httpGet(`${BASE}/status`);
      if (r.ok) return true;
    } catch {}
    await sleep(300);
  }
  return false;
}

async function run() {
  const report = {
    startedAt: new Date().toISOString(),
    base: BASE,
    env: { START_SERVER, HTTP_ONLY, DEMO_MODE, CHAIN, HEALTH_PORT },
    warmLatMs: [],
    burstLatMs: [],
    codes: {},
    status: null,
    metrics: null,
    gates: { ...GATES },
    gateResults: {},
  };

  let child = null;

  try {
    if (START_SERVER) {
      // Build if dist is missing
      const entryPath = path.resolve(process.cwd(), ENTRY);
      if (!fs.existsSync(entryPath)) {
        console.log("Building dist…");
        await new Promise((res, rej) => {
          const p = spawn(BUILD_CMD.split(" ")[0], BUILD_CMD.split(" ").slice(1), { stdio: "inherit", shell: true });
          p.on("exit", (code) => code === 0 ? res() : rej(new Error(`Build failed (${code})`)));
        });
      }

      console.log(`Starting server on ${BASE} (HTTP_ONLY=${HTTP_ONLY}, DEMO_MODE=${DEMO_MODE})…`);
      const serverEnv = {
        ...process.env,
        PORT: String(HEALTH_PORT),
        HEALTH_PORT: String(HEALTH_PORT),
        HTTP_ONLY: HTTP_ONLY ? "true" : "false",
        DEMO_MODE: DEMO_MODE ? "true" : "false",
        TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN || "TEST_TOKEN",
        API_KEY,
      };
      child = spawn("node", [ENTRY], { env: serverEnv, stdio: "inherit", shell: true });
      const ok = await waitForServerReady();
      if (!ok) throw new Error("Server did not become ready in time");
    }

    console.log("Pulling /status and /metrics…");
    const st = await httpGet(`${BASE}/status`);
    const mt = await httpGet(`${BASE}/metrics`);
    report.status = st.json || st.txt;
    report.metrics = mt.json || mt.txt;

    console.log(`Warm (${WARM_REQUESTS})…`);
    for (let i = 0; i < WARM_REQUESTS; i++) {
      const r = await httpPost(`${BASE}/api/scan?enrich=true`, { token: TOKEN, chain: CHAIN, enrich: true }, { "X-API-Key": API_KEY });
      report.warmLatMs.push(r.ms);
      report.codes[r.status] = (report.codes[r.status] || 0) + 1;
      await sleep(50);
    }

    console.log(`Burst (${BURST_REQUESTS})…`);
    // Small concurrency
    const burstBatch = [];
    for (let i = 0; i < BURST_REQUESTS; i++) {
      burstBatch.push(httpPost(`${BASE}/api/scan`, { token: TOKEN, chain: CHAIN }, { "X-API-Key": API_KEY }).then(r => {
        report.burstLatMs.push(r.ms);
        report.codes[r.status] = (report.codes[r.status] || 0) + 1;
      }));
    }
    await Promise.all(burstBatch);

    // Gate evaluation
    const allLat = report.warmLatMs.concat(report.burstLatMs);
    const httpP90 = pQuantile(allLat, 90);
    const total = Object.entries(report.codes).reduce((s, [k, v]) => s + (Number(v) || 0), 0);
    const bad = Object.entries(report.codes).filter(([k]) => !/^2\d\d$/.test(k)).reduce((s, [, v]) => s + (Number(v) || 0), 0);
    const availErrPct = total ? (100 * bad / total) : 0;

    report.gateResults.httpP90 = { value: Math.round(httpP90 || 0), pass: (httpP90 || Infinity) <= GATES.httpP90Ms };
    report.gateResults.availability = { value: +(availErrPct.toFixed(2)), pass: availErrPct <= GATES.availErrPct };

    // Provider rollups (best-effort)
    try {
      const rollups = report.metrics?.rollups || {};
      const provs = Object.keys(rollups);
      const offenders = [];
      for (const k of provs) {
        const o = rollups[k];
        if (o?.p90 != null && o?.errorPct != null) {
          if (o.p90 > GATES.providerP90Ms || o.errorPct > GATES.providerErrPct) offenders.push({ k, p90: o.p90, err: o.errorPct });
        }
      }
      report.gateResults.providers = { offenders, pass: offenders.length === 0 };
    } catch {
      report.gateResults.providers = { offenders: "unknown", pass: true };
    }

    // Write artifacts
    const outDir = path.resolve(process.cwd());
    fs.writeFileSync(path.join(outDir, "canary_status.json"), JSON.stringify(report.status, null, 2));
    fs.writeFileSync(path.join(outDir, "canary_metrics.json"), JSON.stringify(report.metrics, null, 2));
    fs.writeFileSync(path.join(outDir, "canary_report.json"), JSON.stringify({
      base: BASE,
      env: report.env,
      codes: report.codes,
      warmP50: Math.round(pQuantile(report.warmLatMs, 50) || 0),
      warmP90: Math.round(pQuantile(report.warmLatMs, 90) || 0),
      burstP50: Math.round(pQuantile(report.burstLatMs, 50) || 0),
      burstP90: Math.round(pQuantile(report.burstLatMs, 90) || 0),
      httpP90: report.gateResults.httpP90,
      availability: report.gateResults.availability,
      providers: report.gateResults.providers,
      startedAt: report.startedAt
    }, null, 2));

    console.log("\n=== Canary summary ===");
    console.log(`Base: ${BASE}`);
    console.log(`Codes:`, report.codes);
    console.log(`HTTP p90(ms):`, report.gateResults.httpP90.value, `→`, report.gateResults.httpP90.pass ? "PASS" : "FAIL");
    console.log(`Availability err%(proxy):`, report.gateResults.availability.value, `→`, report.gateResults.availability.pass ? "PASS" : "FAIL");
    console.log(`Provider rollups:`, report.gateResults.providers.pass ? "PASS" : "CHECK canary_metrics.json");
    console.log(`Artifacts: canary_status.json, canary_metrics.json, canary_report.json`);
  } catch (e) {
    console.error("Canary error:", e?.message || e);
    process.exitCode = 1;
  } finally {
    if (child) {
      try { if (process.platform === "win32") child.kill(); else process.kill(child.pid); } catch {}
    }
  }
}

run();


