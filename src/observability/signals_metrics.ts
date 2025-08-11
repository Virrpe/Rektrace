// Minimal internal metrics for signals

let ticks = 0;
let windowsBuilt = 0;
let emitted = 0;
let attestations = 0;
let wsConnects = 0;
let wsReconnects = 0;
let wsErrors = 0;
let wsSkipped = 0;
let wsTicks = 0;
let wsConnected = 0; // gauge

const computeLat: number[] = [];
const wsComputeLat: number[] = [];

export function incrTicksTotal() { ticks++; }
export function incrWindowsBuilt() { windowsBuilt++; }
export function incrEmittedTotal() { emitted++; }
export function incrAttestationsTotal() { attestations++; }

export function observeComputeMs(ms: number) { computeLat.push(ms); if (computeLat.length > 256) computeLat.shift(); }

export function incrWsConnect() { wsConnects++; }
export function incrWsReconnect() { wsReconnects++; }
export function incrWsError() { wsErrors++; }
export function incrWsTicks() { wsTicks++; }
export function incrWsSkipped() { wsSkipped++; }
export function setWsConnected(v: 0|1) { wsConnected = v; }
export function observeWsComputeMs(ms: number) { wsComputeLat.push(ms); if (wsComputeLat.length > 256) wsComputeLat.shift(); }

function summary(arr: number[]): { p50: number; p95: number } {
  if (!arr.length) return { p50: 0, p95: 0 };
  const a = [...arr].sort((x,y)=>x-y);
  const p50 = a[Math.floor(0.50 * (a.length-1))] ?? 0;
  const p95 = a[Math.floor(0.95 * (a.length-1))] ?? 0;
  return { p50, p95 };
}

export function snapshotSignalsMetrics() {
  const s1 = summary(computeLat);
  const s2 = summary(wsComputeLat);
  return {
    signals_ticks_total: ticks,
    signals_windows_built_total: windowsBuilt,
    signals_emitted_total: emitted,
    signals_attestations_total: attestations,
    signals_compute_ms_p50: s1.p50,
    signals_compute_ms_p95: s1.p95,
    signals_ws_connects_total: wsConnects,
    signals_ws_reconnects_total: wsReconnects,
    signals_ws_errors_total: wsErrors,
    signals_ws_ticks_total: wsTicks,
    signals_ws_skipped_triggers_total: wsSkipped,
    signals_ws_connected: wsConnected,
    signals_ws_compute_ms_p50: s2.p50,
    signals_ws_compute_ms_p95: s2.p95,
  };
}


