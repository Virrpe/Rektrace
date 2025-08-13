// Node 18+ (global fetch)
const url = "https://api.ipify.org?format=json";
try {
  const r = await fetch(url, { headers: { "accept": "application/json" }});
  const j = await r.json();
  const ip = j?.ip || "";
  if (!ip) throw new Error("No IP in response");
  console.log(ip);
  await (await import('node:fs/promises')).writeFile("public_ip.txt", ip + "\n");
} catch (e) {
  console.error("Failed to detect public IP:", e?.message || e);
  process.exit(1);
}

