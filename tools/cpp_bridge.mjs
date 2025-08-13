import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const BIN = {
  demo: "build/cpp_demo/rektrace_cpp_demo",
  bench: "build/cpp_demo/rektrace_cpp_bench",
  tests: "build/rektrace_cpp_tests",
};

function runBinary(binRelPath, args = []) {
  return new Promise((resolvePromise, rejectPromise) => {
    const bin = resolve(ROOT, binRelPath);
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) =>
      code === 0
        ? resolvePromise({ code, out: out.trim() })
        : rejectPromise(new Error(err || `exit ${code}`))
    );
  });
}

const target = process.argv[2] || "demo";
if (!BIN[target]) {
  console.error(`unknown target: ${target}`);
  process.exit(2);
}

runBinary(BIN[target])
  .then((r) => {
    console.log(`[cpp ${target}] OK\n${r.out}`);
  })
  .catch((e) => {
    console.error(`[cpp ${target}] FAIL: ${e.message}`);
    process.exit(1);
  });


