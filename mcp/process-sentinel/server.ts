import { spawn } from "node:child_process";
import { createMessageConnection, StreamMessageReader, StreamMessageWriter, RequestType, NotificationType } from "vscode-jsonrpc/node";
import { createWriteStream, mkdirSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EOL } from "node:os";
import os from "node:os";

const LOG_ROOT = process.env.LOG_ROOT || "logs";
const NO_PROGRESS_TIMEOUT_S = parseInt(process.env.NO_PROGRESS_TIMEOUT_S || "300", 10);
if (!existsSync(LOG_ROOT)) mkdirSync(LOG_ROOT, { recursive: true });

const STATE_DIR = process.env.AGENT_STATE_DIR || `${os.homedir()}/.cache/rektrace-agent`;
const STATE_FILE = process.env.AGENT_STATE_PATH || `${STATE_DIR}/state.json`;
function writeState(running: boolean) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    const payload = { running, ts: Math.floor(Date.now()/1000) };
    writeFileSync(STATE_FILE, JSON.stringify(payload));
  } catch {}
}

type Rec = { proc: ReturnType<typeof spawn>, logPath: string, lastSize: number, hb?: NodeJS.Timeout, watchdog?: NodeJS.Timeout, exitCode?: number | null };
const procs = new Map<number, Rec>();

const connection = createMessageConnection(new StreamMessageReader(process.stdin), new StreamMessageWriter(process.stdout));
function tail(path: string, n = 120): string { try { return readFileSync(path, "utf8").split(/\r?\n/).slice(-n).join("\n"); } catch { return ""; } }

const Run    = new RequestType<{ cmd: string, cwd?: string, env?: Record<string,string>, shell?: string | boolean }, { pid: number, logPath: string }, void>("process/run");
const Status = new RequestType<{ pid?: number, logPath?: string }, { running: boolean, exitCode?: number | null, lastLines: string, logPath: string }, void>("process/status");
const Cancel = new RequestType<{ pid: number }, { ok: boolean }, void>("process/cancel");
const Progress = new NotificationType<{ pid: number, logPath: string, note: string }>("process/progress");

connection.onRequest(Run, async ({ cmd, cwd, env, shell }: { cmd: string; cwd?: string; env?: Record<string,string>; shell?: string | boolean }) => {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safe = cmd.replace(/[^a-zA-Z0-9_\-\.]+/g, "_").slice(0, 80);
  const logPath = join(LOG_ROOT, `${ts}-${safe}.log`);
  const out = createWriteStream(logPath, { flags: "a" });

  const proc = spawn(cmd, { cwd: cwd || process.cwd(), env: { ...process.env, ...(env || {}) }, shell: shell ?? true });
  proc.stdout?.on("data", d => out.write(d));
  proc.stderr?.on("data", d => out.write(d));

  const rec: Rec = { proc, logPath, lastSize: 0, exitCode: undefined };
  procs.set(proc.pid!, rec);

  // heartbeats + agent state
  rec.hb = setInterval(() => {
    out.write(`[${new Date().toLocaleTimeString()}] heartbeat${EOL}`);
    writeState(true);
    connection.sendNotification(Progress, { pid: proc.pid!, logPath, note: "heartbeat" });
  }, 5000);
  writeState(true);

  // no-progress watchdog
  const touch = () => { try { rec.lastSize = statSync(logPath).size; } catch { rec.lastSize = 0; } };
  touch();
  rec.watchdog = setInterval(() => {
    let size = 0; try { size = statSync(logPath).size; } catch {}
    if (size > rec.lastSize) { rec.lastSize = size; connection.sendNotification(Progress, { pid: proc.pid!, logPath, note: "progress" }); return; }
    // countdown in 5s ticks
    // @ts-ignore
    if (!rec["_remain"]) rec["_remain"] = NO_PROGRESS_TIMEOUT_S;
    // @ts-ignore
    rec["_remain"] -= 5;
    // @ts-ignore
    if (rec["_remain"] <= 0) {
      try { proc.kill("SIGTERM"); setTimeout(() => proc.kill("SIGKILL"), 3000); } catch {}
      clearInterval(rec.watchdog!);
      connection.sendNotification(Progress, { pid: proc.pid!, logPath, note: "auto-cancel (no progress)" });
    }
  }, 5000);

  proc.on("exit", (code, signal) => {
    out.write(`--- exit_code: ${code ?? -1} signal: ${signal ?? "none"}${EOL}`);
    out.end();
    if (rec.hb) clearInterval(rec.hb);
    if (rec.watchdog) clearInterval(rec.watchdog);
    rec.exitCode = code ?? -1;
    writeState(false);
  });

  return { pid: proc.pid!, logPath };
});

connection.onRequest(Status, async ({ pid, logPath }: { pid?: number; logPath?: string }) => {
  let rec: Rec | undefined;
  if (pid && procs.has(pid)) rec = procs.get(pid)!;
  else if (logPath) rec = [...procs.values()].find(r => r.logPath === logPath);
  const running = !!(rec && rec.proc.exitCode === null && rec.exitCode === undefined);
  const exitCode = rec?.exitCode ?? rec?.proc.exitCode ?? undefined;
  const lp = rec?.logPath || logPath || "";
  return { running, exitCode, lastLines: lp ? tail(lp) : "", logPath: lp };
});

connection.onRequest(Cancel, async ({ pid }: { pid: number }) => {
  const rec = procs.get(pid);
  if (!rec) return { ok: false };
  try { rec.proc.kill("SIGTERM"); setTimeout(() => rec.proc.kill("SIGKILL"), 3000); return { ok: true }; } catch { return { ok: false }; }
});

// Background state heartbeat to ensure state.json exists and stays fresh
function anyRunning(): boolean {
  for (const r of procs.values()) {
    const stillRunning = r.exitCode === undefined && r.proc.exitCode === null;
    if (stillRunning) return true;
  }
  return false;
}

try { writeState(anyRunning()); } catch {}
setInterval(() => { try { writeState(anyRunning()); } catch {} }, 5000);

connection.listen();
