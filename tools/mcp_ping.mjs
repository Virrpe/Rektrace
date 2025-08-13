#!/usr/bin/env node
import fs from "fs";
import { spawn } from "child_process";

const MCP_FILE = ".cursor/mcp.json";
const config = JSON.parse(fs.readFileSync(MCP_FILE, "utf8"));
const servers = config.servers || config.mcpServers || {};
const target = process.argv[2] || "ALL";
const callName = process.argv[3] || null; // optional specific tool to call
const callArgs = process.argv[4] ? JSON.parse(process.argv[4]) : {};

function frame(msg) {
  const s = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(s, "utf8")}\r\n\r\n${s}`;
}

async function runServer(name, cfg) {
  if (cfg.transport !== "stdio") return { name, skipped: true, reason: "not stdio" };
  console.log(`\n=== PROBE ${name} ===`);
  const env = { ...process.env, ...(cfg.env || {}) };
  const child = spawn(cfg.command, cfg.args || [], { env, stdio: ["pipe","pipe","pipe"] });

  let buf = Buffer.alloc(0);
  const messages = [];
  child.stdout.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      const hdrEnd = buf.indexOf("\r\n\r\n");
      if (hdrEnd === -1) break;
      const header = buf.slice(0, hdrEnd).toString("utf8");
      const m = header.match(/Content-Length:\s*(\d+)/i);
      if (!m) { buf = buf.slice(hdrEnd+4); continue; }
      const len = parseInt(m[1], 10);
      const start = hdrEnd + 4;
      if (buf.length < start + len) break;
      const body = buf.slice(start, start + len).toString("utf8");
      buf = buf.slice(start + len);
      try { messages.push(JSON.parse(body)); } catch {}
    }
  });
  child.stderr.on("data", (chunk) => {
    try { process.stderr.write(`[${name} stderr] ` + chunk.toString()); } catch {}
  });

  const send = (obj) => child.stdin.write(frame(obj));
  const waitFor = (pred, ms=4000) => new Promise((res) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (messages.some(pred)) { clearInterval(timer); res(); }
      if (Date.now() - start > ms) { clearInterval(timer); res(); }
    }, 50);
  });

  // initialize
  send({ jsonrpc:"2.0", id:1, method:"initialize", params:{ protocolVersion:"2024-11-05", capabilities:{} }});
  await waitFor(m => m.id === 1);

  // tools/list
  send({ jsonrpc:"2.0", id:2, method:"tools/list", params:{} });
  await waitFor(m => m.id === 2);
  const list = messages.find(m => m.id === 2)?.result?.tools || [];
  console.log("tools:", list.map(t => t.name));

  // choose a safe default call
  let chosen = callName || (list.find(t => t.name === "ping")?.name) || (list.find(t => t.name === "prom_query")?.name) || (list.find(t => t.name === "sql_query")?.name) || (list.find(t => t.name === "tg_send")?.name) || null;
  const defaultArgs = (tool) => {
    if (tool === "prom_query") return { ql: "up" };
    if (tool === "sql_query") return { text: "select now();" };
    if (tool === "tg_send") return { chatId: "1234", text: "hi from probe", dryRun: true };
    return {};
  };
  if (chosen) {
    const args = (callArgs && Object.keys(callArgs).length > 0) ? callArgs : defaultArgs(chosen);
    send({ jsonrpc:"2.0", id:3, method:"tools/call", params:{ name: chosen, arguments: args }});
    await waitFor(m => m.id === 3);
    const r = messages.find(m => m.id === 3);
    console.log("call result:", r?.result || r?.error || r);
  }

  // shutdown
  try { send({ jsonrpc:"2.0", id:99, method:"shutdown" }); } catch {}
  setTimeout(() => { try { child.kill(); } catch {} }, 200);
  return { name, tools: list.map(t=>t.name), called: chosen || null };
}

const entries = Object.entries(servers).filter(([k,v]) => v.transport === "stdio");
const targets = target === "ALL" ? entries : entries.filter(([k]) => k === target);
(async () => {
  const results = [];
  for (const [name, cfg] of targets) {
    try { results.push(await runServer(name, cfg)); }
    catch (e) { results.push({ name, error: String(e) }); }
  }
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(results, null, 2));
})();


