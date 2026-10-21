// MCP handshake smoke test: spawn the built server over stdio, initialize,
// list tools, assert the read-only surface. No Bokio token or network needed
// (tokens are only read when a tool actually runs).
// Runs twice: the entry file itself (proves the exec bit + shebang) and a
// symlink to it, the way npm installs bins into node_modules/.bin.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const entry = resolve("dist/index.js");
const dir = mkdtempSync(join(tmpdir(), "bokio-mcp-smoke-"));
const link = join(dir, "bokio-mcp");
symlinkSync(entry, link);

function fail(msg) {
    console.error("SMOKE FAIL:", msg);
    rmSync(dir, { recursive: true, force: true });
    process.exit(1);
}

async function check(cmd) {
    const child = spawn(cmd, [], {
        stdio: ["pipe", "pipe", "inherit"],
        env: { ...process.env, BOKIO_ALLOW_WRITES: "" },
    });
    child.on("error", (err) => fail(`${cmd}: ${err.message}`));

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

    const send = (id, method, params) =>
        new Promise((resolve) => {
            pending.set(id, resolve);
            child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
        });
    const notify = (method, params) =>
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);

    const timeout = setTimeout(() => fail(`${cmd}: timed out`), 15000);
    const init = await send(1, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "smoke", version: "0" },
    });
    if (!init.result) fail(`${cmd}: no initialize result`);
    notify("notifications/initialized", {});

    const list = await send(2, "tools/list", {});
    const tools = list.result?.tools ?? [];
    const names = tools.map((t) => t.name);

    // Read tools must be present; run in read-only mode (BOKIO_ALLOW_WRITES unset).
    const required = [
        "bokio_company_info",
        "bokio_list_journal_entries",
        "bokio_download_sie",
        "bokio_list_invoices",
        "bokio_list_credit_notes",
        "bokio_list_suppliers",
        "bokio_list_bank_payments",
    ];
    const missing = required.filter((n) => !names.includes(n));
    if (missing.length) fail(`missing read tools: ${missing.join(", ")}`);

    // Write tools must NOT be registered when writes are disabled (#3).
    const forbidden = [
        "bokio_create_journal_entry",
        "bokio_upload_file",
        "bokio_delete_invoice",
        "bokio_create_credit_note",
        "bokio_create_supplier_invoice",
        "bokio_create_bank_payment",
    ];
    const leaked = forbidden.filter((n) => names.includes(n));
    if (leaked.length) fail(`write tools registered in read-only mode: ${leaked.join(", ")}`);

    // Every tool must carry an explicit readOnlyHint annotation (#6).
    const unannotated = tools.filter((t) => typeof t.annotations?.readOnlyHint !== "boolean");
    if (unannotated.length)
        fail(`tools missing readOnlyHint: ${unannotated.map((t) => t.name).join(", ")}`);

    clearTimeout(timeout);
    child.kill();
    return tools.length;
}

try {
    await check(entry);
    const n = await check(link);
    rmSync(dir, { recursive: true, force: true });
    console.log(
        `SMOKE OK: ${n} tools via entry and symlink (read-only; writes hidden, all annotated)`,
    );
} catch (err) {
    fail(err?.message ?? String(err));
}
