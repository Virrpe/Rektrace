import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BIN = resolve(ROOT, "build/cpp_demo/rektrace_cpp_score");

function run(args = []) {
  return new Promise((res, rej) => {
    const p = spawn(BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", d => (out += d.toString()));
    p.stderr.on("data", d => (err += d.toString()));
    p.on("close", code => (code === 0 ? res(out.trim()) : rej(new Error(err || `exit ${code}`))));
  });
}

const args = process.argv.slice(2).length ? process.argv.slice(2) :
  ["--holders","750","--lp_locked","yes","--risk","0.12"];

try {
  const txt = await run(args);
  console.log(txt);
} catch (e) {
  console.error(e.message || String(e));
  process.exit(1);
}


