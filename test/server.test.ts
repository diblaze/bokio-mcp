import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { lintServer, parseToolDefinitions } from "mcp-tdqs";
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
        expect(tools.length).toBe(60);

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

describe("suppliers", () => {
    it("supplier bodies validate required fields (Supplier bodies validate required fields)", async () => {
        const { supplierBody, supplierInvoiceBody } = await import("../src/index.js");
        expect(supplierBody.safeParse({}).success).toBe(false);
        expect(
            supplierBody.safeParse({ name: "A", paymentDetails: { type: "bankgiro" } }).success,
        ).toBe(false);
        expect(
            supplierBody.safeParse({
                name: "A",
                paymentDetails: { type: "bankgiro", bankgiroNumber: "123-4567" },
            }).success,
        ).toBe(true);
        for (const [type, details] of [
            ["plusgiro", { plusgiroNumber: "1234-5" }],
            ["transfer", { clearingNumber: "1234", accountNumber: "567" }],
            ["internationalPayment", { iban: "SE00", bic: "X" }],
        ] as const) {
            expect(
                supplierBody.safeParse({ name: "A", paymentDetails: { type, ...details } }).success,
            ).toBe(true);
            expect(supplierBody.safeParse({ name: "A", paymentDetails: { type } }).success).toBe(
                false,
            );
        }
        const invoice = {
            supplierRef: { id: "s" },
            invoiceDate: "2026-01-01",
            dueDate: "2026-01-31",
            totalAmount: 100,
        };
        expect(supplierInvoiceBody.safeParse(invoice).success).toBe(true);
        for (const field of Object.keys(invoice)) {
            const { [field]: _, ...rest } = invoice as Record<string, unknown>;
            expect(supplierInvoiceBody.safeParse(rest).success, field).toBe(false);
        }
    });
});

describe("supplier invoice update", () => {
    it("update is destructive and does not advertise uploadRef (Supplier invoice update replaces line items)", async () => {
        const client = await connect();
        const { tools } = await client.listTools();
        const update = tools.find((t) => t.name === "bokio_update_supplier_invoice");
        expect(update?.annotations?.destructiveHint).toBe(true);
        const props = (update?.inputSchema.properties?.supplierInvoice ?? {}) as {
            properties?: Record<string, unknown>;
        };
        expect(props.properties).toHaveProperty("supplierRef");
        expect(props.properties).not.toHaveProperty("uploadRef");

        process.env.BOKIO_TOKEN = "a".repeat(40);
        process.env.BOKIO_COMPANY_ID = "co";
        const f = vi.fn(async () => new Response("{}"));
        vi.stubGlobal("fetch", f);
        const res = await client.callTool({
            name: "bokio_update_supplier_invoice",
            arguments: {
                supplierInvoiceId: "si",
                supplierInvoice: {
                    supplierRef: { id: "s" },
                    invoiceDate: "2026-01-01",
                    dueDate: "2026-01-31",
                    totalAmount: 100,
                    uploadRef: { id: "u" },
                },
            },
        });
        expect(res.isError).toBe(true);
        expect(f).not.toHaveBeenCalled();
        vi.unstubAllGlobals();

        // Irreversible actions are flagged so clients ask before running them.
        for (const n of [
            "bokio_publish_invoice",
            "bokio_record_invoice",
            "bokio_publish_credit_note",
            "bokio_record_credit_note",
        ]) {
            expect(tools.find((t) => t.name === n)?.annotations?.destructiveHint, n).toBe(true);
        }
        await client.close();
    });
});

describe("bank payments", () => {
    it("bank payment tools are read-only and none creates (No bank payment creation tool exists)", async () => {
        const client = await connect();
        const { tools } = await client.listTools();
        const bank = tools.filter((t) => t.name.includes("bank_payment"));
        expect(bank.length).toBeGreaterThan(0);
        for (const t of bank) expect(t.annotations?.readOnlyHint).toBe(true);
        expect(tools.some((t) => /create.*bank_payment|bank_payment.*bulk/.test(t.name))).toBe(
            false,
        );
        await client.close();
    });
});

describe("distribution", () => {
    it("server version equals package version (Server version equals package version)", async () => {
        const { readFileSync } = await import("node:fs");
        const client = await connect();
        const pkg = JSON.parse(readFileSync("package.json", "utf8"));
        expect(client.getServerVersion()?.version).toBe(pkg.version);
        await client.close();
    });
});

describe("server instructions", () => {
    it("initialize carries short instructions (Instructions are present in the initialize result)", async () => {
        const client = await connect();
        const i = client.getInstructions();
        expect(typeof i).toBe("string");
        expect(i?.length).toBeGreaterThan(0);
        expect(i?.length).toBeLessThanOrEqual(2000);
        await client.close();
    });

    it("instructions name the write gate (Instructions cover the write gate)", async () => {
        const client = await connect();
        const i = client.getInstructions() ?? "";
        for (const phrase of ["BOKIO_ALLOW_WRITES", "destructive"]) expect(i).toContain(phrase);
        await client.close();
    });

    it("instructions name the accuracy rules (Instructions cover computed tools, ledger sign and export cost)", async () => {
        const client = await connect();
        const i = client.getInstructions() ?? "";
        for (const phrase of ["debit positive, credit negative", "fiscal year", "bokio_raw_get"])
            expect(i).toContain(phrase);
        const listed = new Set((await client.listTools()).tools.map((t) => t.name));
        const named = i.match(/bokio_\w+/g) ?? [];
        expect(named.length).toBeGreaterThan(0);
        for (const name of named) expect(listed, name).toContain(name);
        await client.close();
    });
});

describe("path ids", () => {
    it("ids that would change the URL path are rejected before any request (Path ids cannot change the request path)", async () => {
        const client = await connect();
        process.env.BOKIO_TOKEN = "a".repeat(40);
        process.env.BOKIO_COMPANY_ID = "co";
        const f = vi.fn(async () => new Response("{}"));
        vi.stubGlobal("fetch", f);
        for (const creditNoteId of ["../invoices/x", "x?y=z", ""]) {
            const res = await client.callTool({
                name: "bokio_delete_credit_note",
                arguments: { creditNoteId },
            });
            expect(res.isError, creditNoteId).toBe(true);
        }
        expect(f).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
        await client.close();
    });
});

// ---- computed tools: mocked Bokio with fiscal-year listing + SIE downloads --

const YEARS = [
    { id: "fy1", startDate: "2025-01-01", endDate: "2025-12-31" },
    { id: "fy2", startDate: "2026-01-01", endDate: "2026-12-31" },
];

function sieFor(id: string): string {
    const y = id === "fy1" ? "2025" : "2026";
    const body =
        id === "fy1"
            ? ['#VER "V" "1" 20251220 "Old" 20251220', "{", "\t#TRANS 1930 {} 100.00", "}"]
            : ['#VER "V" "1" 20260110 "New" 20260110', "{", "\t#TRANS 1930 {} -30.00", "}"];
    return [
        "#FORMAT PC8",
        `#RAR 0 ${y}0101 ${y}1231`,
        '#KONTO 1930 "Bank"',
        // fy2 opens above fy1's closing (100) so a carried balance would show.
        `#IB 0 1930 ${id === "fy1" ? "0.00" : "150.00"}`,
        ...body,
        "",
    ].join("\r\n");
}

function mockBokio() {
    process.env.BOKIO_TOKEN = "a".repeat(40);
    process.env.BOKIO_COMPANY_ID = "co";
    const f = vi.fn(async (url: URL | string) => {
        const u = String(url);
        if (u.endsWith("/fiscal-years"))
            return new Response(JSON.stringify({ items: YEARS }), {
                headers: { "content-type": "application/json" },
            });
        const id = /\/sie\/([^/]+)\/download/.exec(u)?.[1] ?? "";
        return new Response(sieFor(id));
    });
    vi.stubGlobal("fetch", f);
    return f;
}

const COMPUTED = [
    "bokio_account_balances",
    "bokio_account_ledger",
    "bokio_find_duplicates",
    "bokio_reconcile_bank",
    "bokio_vat_summary",
    "bokio_profit_and_loss",
    "bokio_open_items",
];

describe("computed tools", () => {
    it("computed tools are read-only (Computed tools are listed as read-only)", async () => {
        const client = await connect();
        const { tools } = await client.listTools();
        const hints = new Map(tools.map((t) => [t.name, t.annotations]));
        for (const n of COMPUTED) expect(hints.get(n)?.readOnlyHint, n).toBe(true);
        await client.close();
    });

    it("balances make one listing and one download (One export request per fiscal year)", async () => {
        const client = await connect();
        const f = mockBokio();
        const res = await client.callTool({
            name: "bokio_account_balances",
            arguments: { date: "2026-06-30", accounts: [1930] },
        });
        expect(f.mock.calls.length).toBe(2);
        expect(String(f.mock.calls[0][0])).toMatch(/\/fiscal-years$/);
        expect(String(f.mock.calls[1][0])).toMatch(/\/sie\/fy2\/download$/);
        expect(res.structuredContent).toMatchObject({
            date: "2026-06-30",
            balances: [{ account: 1930, opening: 150, movement: -30, balance: 120 }],
        });
        vi.unstubAllGlobals();
        await client.close();
    });

    it("fiscalYearId skips the listing (Export fetched by fiscal year id without a listing)", async () => {
        const client = await connect();
        const f = mockBokio();
        const res = await client.callTool({
            name: "bokio_account_balances",
            arguments: { fiscalYearId: "fy1" },
        });
        expect(f.mock.calls.length).toBe(1);
        expect(String(f.mock.calls[0][0])).toMatch(/\/sie\/fy1\/download$/);
        expect(res.structuredContent).toMatchObject({ date: "2025-12-31" });
        vi.unstubAllGlobals();
        await client.close();
    });

    it("date outside fiscal years errors before download (Date outside every fiscal year is rejected)", async () => {
        const client = await connect();
        const f = mockBokio();
        const res = await client.callTool({
            name: "bokio_account_balances",
            arguments: { date: "2030-01-01" },
        });
        expect(res.isError).toBe(true);
        expect(JSON.stringify(res.content)).toMatch(/2025-01-01\.\.2025-12-31/);
        expect(f.mock.calls.length).toBe(1);
        vi.unstubAllGlobals();
        await client.close();
    });

    it("ledger across two fiscal years (Range spanning two fiscal years downloads both)", async () => {
        const client = await connect();
        const f = mockBokio();
        const res = await client.callTool({
            name: "bokio_account_ledger",
            arguments: { account: 1930, from: "2025-12-01", to: "2026-01-31" },
        });
        expect(f.mock.calls.filter((c) => /\/sie\//.test(String(c[0]))).length).toBe(2);
        const l = res.structuredContent as { opening: number; lines: { balance: number }[] };
        expect(l.opening).toBe(0);
        expect(l.lines.map((x) => x.balance)).toEqual([100, 120]);
        vi.unstubAllGlobals();
        await client.close();
    });

    it("ledger rejects from after to (From after to is rejected)", async () => {
        const client = await connect();
        const f = mockBokio();
        const res = await client.callTool({
            name: "bokio_account_ledger",
            arguments: { account: 1930, from: "2026-02-01", to: "2026-01-01" },
        });
        expect(res.isError).toBe(true);
        expect(f).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
        await client.close();
    });

    it("reconcile rejects empty rows (Empty bank rows are rejected)", async () => {
        const client = await connect();
        const f = mockBokio();
        const res = await client.callTool({
            name: "bokio_reconcile_bank",
            arguments: { rows: [] },
        });
        expect(res.isError).toBe(true);
        expect(f).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
        await client.close();
    });

    it("reconcile end to end over the mocked export", async () => {
        const client = await connect();
        mockBokio();
        const res = await client.callTool({
            name: "bokio_reconcile_bank",
            arguments: { rows: [{ date: "2026-01-11", amount: -30 }] },
        });
        expect(res.structuredContent).toMatchObject({
            account: 1930,
            matched: [{ dayDiff: 1, ledger: { number: "1", amount: -30 } }],
            unmatchedLedger: [],
            difference: 0,
        });
        vi.unstubAllGlobals();
        await client.close();
    });

    it("invalid dates and amounts rejected (Invalid dates and sub-öre amounts are rejected)", async () => {
        const client = await connect();
        const f = mockBokio();
        for (const rows of [
            [{ date: "2026-02-31", amount: -1 }],
            [{ date: "2026-02-03", amount: 1.005 }],
        ]) {
            const res = await client.callTool({
                name: "bokio_reconcile_bank",
                arguments: { rows },
            });
            expect(res.isError, JSON.stringify(rows)).toBe(true);
        }
        expect(f).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
        await client.close();
    });

    it("the other computed tools return structured content (the SDK client checks it against the output schema)", async () => {
        const client = await connect();
        mockBokio();
        const calls: [string, Record<string, unknown>][] = [
            ["bokio_find_duplicates", { from: "2026-01-01", to: "2026-12-31" }],
            ["bokio_vat_summary", { from: "2026-01-01", to: "2026-03-31" }],
            ["bokio_profit_and_loss", { from: "2026-01-01", to: "2026-12-31", groupBy: "account" }],
            ["bokio_open_items", { account: 1930, asOf: "2026-06-30" }],
        ];
        for (const [name, args] of calls) {
            const res = await client.callTool({ name, arguments: args });
            expect(res.isError, name).toBeFalsy();
            expect(typeof res.structuredContent, name).toBe("object");
        }
        const oi = await client.callTool({
            name: "bokio_open_items",
            arguments: { account: 1930, asOf: "2026-06-30" },
        });
        expect(oi.structuredContent).toMatchObject({ openingUnitemised: 0, balance: 70 });
        vi.unstubAllGlobals();
        await client.close();
    });
});

describe("tool definitions", () => {
    async function listed() {
        const client = await connect();
        const { tools } = await client.listTools();
        await client.close();
        return tools;
    }
    type Props = Record<string, { description?: string }>;
    const props = (t: { inputSchema: { properties?: unknown } }) =>
        (t.inputSchema.properties ?? {}) as Props;

    it("lint is clean (Lint reports nothing but shadow candidates)", async () => {
        const report = lintServer({
            serverName: "bokio-mcp",
            tools: parseToolDefinitions(await listed()).tools,
        });
        for (const t of report.tools)
            expect(t.contextSignals.schemaDescriptionCoverage, t.name).toBe(100);
        const blocking = report.findings.filter(
            (f) =>
                f.severity === "error" ||
                (f.severity === "warning" && f.rule !== "shadow-candidate"),
        );
        expect(blocking).toEqual([]);
    });

    it("id params name their source (Id parameters name the tool that lists them)", async () => {
        const tools = await listed();
        const names = new Set(tools.map((t) => t.name));
        for (const t of tools) {
            for (const [key, p] of Object.entries(props(t))) {
                if (key === "companyId") {
                    expect(p.description, t.name).toContain("BOKIO_COMPANY_ID");
                    continue;
                }
                if (!key.endsWith("Id")) continue;
                const named = (p.description ?? "").match(/bokio_\w+/g) ?? [];
                expect(
                    named.some((n) => names.has(n)),
                    `${t.name}.${key}`,
                ).toBe(true);
            }
        }
    });

    it("descriptions are short and plain (Descriptions stay short and plain)", async () => {
        for (const t of await listed()) {
            const d = t.description ?? "";
            const sentences = d.replace("WRITE.", "").match(/[.!?](\s|$)/g) ?? [];
            expect(sentences.length, `${t.name}: ${d}`).toBeLessThanOrEqual(3);
            expect(d, t.name).not.toMatch(/\b(IMPORTANT|MUST|NEVER|ALWAYS|NOTE)\b/);
            if (t.annotations?.readOnlyHint === false) expect(d, t.name).toContain("WRITE.");
        }
    });

    it("savePath says where files land (Save path states where files land)", async () => {
        const withSave = (await listed()).filter((t) => "savePath" in props(t));
        expect(withSave.length).toBe(4);
        for (const t of withSave) {
            const d = props(t).savePath.description ?? "";
            expect(d, t.name).toContain("BOKIO_DOWNLOAD_DIR");
            expect(d, t.name).toMatch(/overwrit/);
        }
    });
});
