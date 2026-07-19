import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

// Writes must be enabled BEFORE importing the server module, since tool
// registration reads BOKIO_ALLOW_WRITES at import time (#3).
process.env.BOKIO_ALLOW_WRITES = "1";

describe("server tool surface", () => {
    it("registers all tools with explicit annotations over an in-memory transport", async () => {
        const { server } = await import("../src/index.js");
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: "test", version: "0" });
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

        const { tools } = await client.listTools();
        expect(tools.length).toBe(31);

        // #6: every tool declares an explicit readOnlyHint boolean.
        for (const t of tools) {
            expect(typeof t.annotations?.readOnlyHint).toBe("boolean");
        }

        // reads are read-only, writes are not; destructive/idempotent hints are set.
        const byName = new Map(tools.map((t) => [t.name, t.annotations]));
        expect(byName.get("bokio_company_info")?.readOnlyHint).toBe(true);
        expect(byName.get("bokio_create_journal_entry")?.readOnlyHint).toBe(false);
        expect(byName.get("bokio_delete_invoice")?.destructiveHint).toBe(true);
        expect(byName.get("bokio_update_invoice")?.idempotentHint).toBe(true);

        await client.close();
    });
});
