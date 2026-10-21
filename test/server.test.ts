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
        expect(tools.length).toBe(43);

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

        // Envelope drift (bare array, non-JSON body) stays data, not a protocol error.
        for (const [body, type] of [
            ["[1,2]", "application/json"],
            ["oops", "text/plain"],
        ]) {
            vi.stubGlobal(
                "fetch",
                vi.fn(async () => new Response(body, { headers: { "content-type": type } })),
            );
            const res = await client.callTool({ name: "bokio_list_invoices", arguments: {} });
            expect(res.isError).toBeFalsy();
            expect((res.content as { text: string }[])[0].text).toContain(
                body === "oops" ? "oops" : "1",
            );
        }
        vi.unstubAllGlobals();

        // #5: reference data exposed as MCP resources.
        const { resources } = await client.listResources();
        expect(resources.map((r) => r.uri).sort()).toEqual([
            "bokio://company/chart-of-accounts",
            "bokio://company/info",
        ]);

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

describe("input bounds", () => {
    it("rejects pageSize above 100 without a request (pageSize above 100 is rejected before any request)", async () => {
        const client = await connect();
        process.env.BOKIO_TOKEN = "a".repeat(40);
        process.env.BOKIO_COMPANY_ID = "co";
        const f = vi.fn(async () => new Response("{}"));
        vi.stubGlobal("fetch", f);
        const res = await client.callTool({
            name: "bokio_list_invoices",
            arguments: { pageSize: 101 },
        });
        expect(res.isError).toBe(true);
        expect((res.content as { text: string }[])[0].text).toMatch(/too_big[\s\S]*pageSize/);
        expect(f).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
        await client.close();
    });
});

async function connect() {
    const { server } = await import("../src/index.js");
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
}

describe("credit notes, payments and settlements", () => {
    it("credit note tools carry correct hints (Credit note tools registered with correct hints)", async () => {
        const client = await connect();
        const { tools } = await client.listTools();
        const hints = new Map(tools.map((t) => [t.name, t.annotations]));
        for (const n of [
            "bokio_list_credit_notes",
            "bokio_get_credit_note",
            "bokio_download_credit_note",
        ]) {
            expect(hints.get(n)?.readOnlyHint).toBe(true);
        }
        expect(hints.get("bokio_update_credit_note")?.idempotentHint).toBe(true);
        expect(hints.get("bokio_delete_credit_note")?.destructiveHint).toBe(true);
        for (const n of [
            "bokio_create_credit_note",
            "bokio_publish_credit_note",
            "bokio_record_credit_note",
        ]) {
            expect(hints.get(n)?.readOnlyHint).toBe(false);
        }
        await client.close();
    });

    it("settlement body validates type and details (Settlement body validates type and details)", async () => {
        const { settlementBody } = await import("../src/index.js");
        expect(
            settlementBody.safeParse({ type: "badDebt", date: "2026-01-01", sumBaseCurrency: 10 })
                .success,
        ).toBe(false);
        expect(
            settlementBody.safeParse({
                type: "paymentServiceFee",
                date: "2026-01-01",
                sumBaseCurrency: 10,
            }).success,
        ).toBe(false);
        expect(
            settlementBody.safeParse({ type: "bankFee", date: "2026-01-01", sumBaseCurrency: 10 })
                .success,
        ).toBe(true);
    });

    it("download with traversing savePath makes no request (Traversing save path makes no request)", async () => {
        const client = await connect();
        process.env.BOKIO_TOKEN = "a".repeat(40);
        process.env.BOKIO_COMPANY_ID = "co";
        process.env.BOKIO_DOWNLOAD_DIR = "/tmp/bokio-dl";
        const f = vi.fn(async () => new Response("pdf"));
        vi.stubGlobal("fetch", f);
        const res = await client.callTool({
            name: "bokio_download_invoice",
            arguments: { invoiceId: "x", savePath: "../out.pdf" },
        });
        expect(res.isError).toBe(true);
        expect((res.content as { text: string }[])[0].text).toMatch(/escapes BOKIO_DOWNLOAD_DIR/);
        expect(f).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
        delete process.env.BOKIO_DOWNLOAD_DIR;
        await client.close();
    });
});

describe("download and body shapes", () => {
    it("download refuses to overwrite an existing file (Existing file is not overwritten)", async () => {
        const { mkdtempSync, writeFileSync, readFileSync } = await import("node:fs");
        const { tmpdir } = await import("node:os");
        const { join } = await import("node:path");
        const dir = mkdtempSync(join(tmpdir(), "bokio-test-"));
        writeFileSync(join(dir, "keep.pdf"), "original");
        const client = await connect();
        process.env.BOKIO_TOKEN = "a".repeat(40);
        process.env.BOKIO_COMPANY_ID = "co";
        process.env.BOKIO_DOWNLOAD_DIR = dir;
        const f = vi.fn(async () => new Response("pdf"));
        vi.stubGlobal("fetch", f);
        const res = await client.callTool({
            name: "bokio_download_invoice",
            arguments: { invoiceId: "x", savePath: "keep.pdf" },
        });
        expect(res.isError).toBe(true);
        expect(readFileSync(join(dir, "keep.pdf"), "utf8")).toBe("original");
        expect(f).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
        delete process.env.BOKIO_DOWNLOAD_DIR;
        await client.close();
    });

    it("settlement and credit-note bodies are sent in Bokio's shape (Write bodies match the Bokio request shape)", async () => {
        const client = await connect();
        process.env.BOKIO_TOKEN = "a".repeat(40);
        process.env.BOKIO_COMPANY_ID = "co";
        const f = vi.fn(
            async () => new Response("{}", { headers: { "content-type": "application/json" } }),
        );
        vi.stubGlobal("fetch", f);
        const body = (i: number) => JSON.parse(String(f.mock.calls[i][1]?.body));
        await client.callTool({
            name: "bokio_create_invoice_settlement",
            arguments: {
                invoiceId: "inv",
                settlement: { type: "bankFee", date: "2026-01-01", sumBaseCurrency: 10 },
            },
        });
        expect(body(0)).toEqual({
            type: "bankFee",
            invoiceSettlementDetails: { date: "2026-01-01", sumBaseCurrency: 10 },
        });
        await client.callTool({
            name: "bokio_update_credit_note",
            arguments: {
                creditNoteId: "cn",
                creditNote: {
                    currency: "SEK",
                    creditDate: "2026-01-01",
                    dueDate: "2026-01-31",
                    lineItems: [{ description: "x" }],
                },
            },
        });
        expect(body(1).id).toBe("cn");
        expect(String(f.mock.calls[1][0])).toContain("/credit-notes/cn");
        vi.unstubAllGlobals();
        await client.close();
    });
});
