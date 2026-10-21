import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

// Separate file: vitest isolates modules per file, so the server registers with writes off.
delete process.env.BOKIO_ALLOW_WRITES;

describe("read-only mode", () => {
    it("write tools absent in read-only mode (Write tools absent in read-only mode)", async () => {
        const { server } = await import("../src/index.js");
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: "test", version: "0" });
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        const { tools } = await client.listTools();
        expect(tools.length).toBeGreaterThan(0);
        // Computed tools are read-only, so they stay listed with writes off.
        const names = new Set(tools.map((t) => t.name));
        for (const n of [
            "bokio_account_balances",
            "bokio_account_ledger",
            "bokio_find_duplicates",
            "bokio_reconcile_bank",
            "bokio_vat_summary",
            "bokio_profit_and_loss",
            "bokio_open_items",
        ])
            expect(names.has(n), n).toBe(true);
        for (const t of tools) {
            expect(t.description).not.toContain("WRITE.");
            expect(t.annotations?.readOnlyHint).toBe(true);
        }
        await client.close();
    });
});
