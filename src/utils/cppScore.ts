import { spawn } from "node:child_process";
import { resolve } from "node:path";

export type ScoreInput = { holders: number; lp_locked: boolean; risk: number };
export type ScoreResult = { ok: boolean; score: number; reason: string };

export async function scoreWithCpp(input: ScoreInput): Promise<ScoreResult> {
  const bin = resolve(process.cwd(), "build/cpp_demo/rektrace_cpp_score");
  const args = [
    "--holders",
    String(input.holders),
    "--lp_locked",
    input.lp_locked ? "yes" : "no",
    "--risk",
    String(input.risk),
  ];
  return new Promise((res, rej) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => {
      if (code !== 0) return rej(new Error(err || `cpp score exit ${code}`));
      try {
        res(JSON.parse(out));
      } catch {
        rej(new Error("invalid JSON from cpp score: " + out));
      }
    });
  });
}


