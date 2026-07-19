import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

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

        // #4: a list tool returns structuredContent validated against its outputSchema.
        process.env.BOKIO_TOKEN = "a".repeat(40);
        process.env.BOKIO_COMPANY_ID = "co";
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({
                            totalItems: 1,
                            totalPages: 1,
                            currentPage: 1,
                            items: [{ id: "x" }],
                        }),
                        { status: 200, headers: { "content-type": "application/json" } },
                    ),
            ),
        );
        const listed = await client.callTool({ name: "bokio_list_invoices", arguments: {} });
        expect((listed.structuredContent as { items?: unknown[] })?.items?.length).toBe(1);
        vi.unstubAllGlobals();

        await client.close();
    });
});

describe("write-body schemas (#2)", () => {
    it("validate required fields and enums", async () => {
        const { invoiceBody, customerBody } = await import("../src/index.js");
        expect(invoiceBody.safeParse({}).success).toBe(false);
        expect(
            invoiceBody.safeParse({ invoiceDate: "2026-01-01", lineItems: [{ description: "x" }] })
                .success,
        ).toBe(true);
        expect(invoiceBody.safeParse({ invoiceDate: "2026-01-01", lineItems: [] }).success).toBe(
            false,
        );
        expect(customerBody.safeParse({ name: "A" }).success).toBe(false); // missing type
        expect(customerBody.safeParse({ name: "A", type: "company" }).success).toBe(true);
        expect(customerBody.safeParse({ name: "A", type: "bogus" }).success).toBe(false); // enum
    });
});
