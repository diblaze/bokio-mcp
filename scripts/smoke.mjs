// MCP handshake smoke test: spawn the built server over stdio, initialize,
// list tools, assert a sane count. No Bokio token or network needed
// (tokens are only read when a tool actually runs).
import { spawn } from "node:child_process";
import { once } from "node:events";

const child = spawn("node", ["dist/index.js"], {
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, BOKIO_ALLOW_WRITES: "" },
});

let buf = "";
const pending = new Map();

child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  for (;;) {
    const nl = buf.indexOf("\n");
    if (nl < 0) break;
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

function send(id, method, params) {
  return new Promise((resolve) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

function fail(msg) {
  console.error("SMOKE FAIL:", msg);
  child.kill();
  process.exit(1);
}

const timeout = setTimeout(() => fail("timed out"), 15000);

try {
  const init = await send(1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0" },
  });
  if (!init.result) fail("no initialize result");
  notify("notifications/initialized", {});

  const list = await send(2, "tools/list", {});
  const tools = list.result?.tools ?? [];
  const names = tools.map((t) => t.name);
  const required = [
    "bokio_company_info",
    "bokio_list_journal_entries",
    "bokio_create_journal_entry",
    "bokio_download_sie",
    "bokio_upload_file",
  ];
  const missing = required.filter((n) => !names.includes(n));
  if (missing.length) fail(`missing tools: ${missing.join(", ")}`);

  clearTimeout(timeout);
  console.log(`SMOKE OK: ${tools.length} tools registered`);
  child.kill();
  process.exit(0);
} catch (err) {
  fail(err?.message ?? String(err));
}

await once(child, "exit");
