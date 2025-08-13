import { spawn } from "node:child_process";
import {
  createConnection,
  StreamMessageReader,
  StreamMessageWriter,
  RequestType,
} from "vscode-jsonrpc";

const env = {
  ...process.env,
  LOG_ROOT: "logs",
  AGENT_STATE_DIR: ".cache/rektrace-agent",
  AGENT_STATE_PATH: ".cache/rektrace-agent/state.json",
};

const Run = new RequestType<
  { cmd: string; cwd?: string; env?: Record<string, string>; shell?: string },
  { pid: number; logPath: string },
  void
>("process/run");

const Status = new RequestType<
  { pid?: number; logPath?: string },
  { running: boolean; exitCode?: number | null; lastLines: string; logPath: string },
  void
>("process/status");

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const sentinel = spawn(
    "node",
    ["node_modules/tsx/dist/cli.mjs", "mcp/process-sentinel/server.ts"],
    { env, stdio: ["pipe", "pipe", "inherit"] }
  );

  const connection = createConnection(
    new StreamMessageReader(sentinel.stdout!),
    new StreamMessageWriter(sentinel.stdin!)
  );
  connection.listen();

  const { pid, logPath } = await connection.sendRequest(Run, {
    cmd: "sleep 7 && echo done",
    shell: "sh",
  });
  // eslint-disable-next-line no-console
  console.log("RUN pid:", pid, "log:", logPath);

  while (true) {
    const s = await connection.sendRequest(Status, { pid });
    // eslint-disable-next-line no-console
    console.log(
      "STATUS running:",
      s.running,
      "exitCode:",
      s.exitCode,
      "log:",
      s.logPath
    );
    if (s.exitCode !== undefined && s.exitCode !== null) break;
    await sleep(1000);
  }

  try {
    sentinel.kill("SIGTERM");
  } catch {}
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});


