#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type ZodRawShape, z } from "zod";
import {
    bokioDownload,
    bokioRequest,
    downloadTarget,
    fileForm,
    filterQuery,
    type Query,
    resolveCompanyId,
    tokenWarning,
    writesAllowed,
} from "./bokio.js";

export const server = new McpServer({ name: "bokio-mcp", version: "0.1.0" });

// ---- helpers ---------------------------------------------------------------

type Result = {
    content: { type: "text"; text: string }[];
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
};

function ok(data: unknown): Result {
    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return { content: [{ type: "text", text }] };
}

// #4: text + structuredContent, so clients get typed data alongside the JSON text.
// Only attaches structuredContent for plain objects (MCP requires an object).
function okStructured(data: unknown): Result {
    const r = ok(data);
    if (data && typeof data === "object" && !Array.isArray(data)) {
        r.structuredContent = data as Record<string, unknown>;
    }
    return r;
}

// Permissive paginated envelope shared by Bokio list endpoints.
const listOutput: ZodRawShape = {
    items: z.array(z.record(z.string(), z.unknown())).optional(),
    totalItems: z.number().optional(),
    totalPages: z.number().optional(),
    currentPage: z.number().optional(),
};

function tool(
    name: string,
    description: string,
    shape: ZodRawShape,
    // biome-ignore lint/suspicious/noExplicitAny: handler args are runtime-validated by zod at the tool layer
    handler: (args: any) => Promise<Result>,
    outputShape?: ZodRawShape,
): void {
    const isWrite = description.includes("WRITE.");
    // #3: a read-only deployment does not even advertise write tools
    if (isWrite && !writesAllowed()) return;
    const annotations = isWrite
        ? {
              readOnlyHint: false,
              destructiveHint: /reverse|delete/.test(name),
              idempotentHint: /update/.test(name),
              openWorldHint: true,
          }
        : { readOnlyHint: true, openWorldHint: true };
    const config = outputShape
        ? { description, inputSchema: shape, annotations, outputSchema: outputShape }
        : { description, inputSchema: shape, annotations };
    // biome-ignore lint/suspicious/noExplicitAny: registerTool passes zod-parsed args
    server.registerTool(name, config, async (args: any) => {
        try {
            return await handler(args ?? {});
        } catch (err) {
            return {
                content: [{ type: "text", text: `ERROR: ${(err as Error).message}` }],
                isError: true,
            };
        }
    });
}

const companyId = z
    .string()
    .optional()
    .describe("Bokio company id. Defaults to BOKIO_COMPANY_ID if omitted.");
const page = z.number().int().positive().optional().describe("Page number (1-based)");
const pageSize = z.number().int().positive().max(200).optional().describe("Items per page");
const query = z
    .string()
    .optional()
    .describe('Bokio filter query, e.g. "date>=2026-07-01 and date<=2026-07-31"');
// Typed write-body schemas (modelled from the Bokio OpenAPI). `.catchall` keeps
// any unmodelled/nested fields while still validating the documented ones.
const addressSchema = z
    .object({
        line1: z.string(),
        line2: z.string().optional(),
        city: z.string(),
        postalCode: z.string(),
        country: z.string().describe("ISO country code, e.g. SE"),
        countrySubdivision: z.string().optional(),
    })
    .catchall(z.unknown());

export const customerBody = z
    .object({
        name: z.string(),
        type: z.enum(["company", "private"]),
        vatNumber: z.string().optional(),
        orgNumber: z.string().optional(),
        paymentTerms: z.string().optional(),
        address: addressSchema.optional(),
        contactsDetails: z
            .array(
                z
                    .object({
                        name: z.string().optional(),
                        email: z.string().optional(),
                        phone: z.string().optional(),
                        isDefault: z.boolean().optional(),
                    })
                    .catchall(z.unknown()),
            )
            .optional(),
        language: z.enum(["sv", "en"]).optional(),
    })
    .catchall(z.unknown());

export const invoiceBody = z
    .object({
        invoiceDate: z.string().describe("YYYY-MM-DD (required)"),
        lineItems: z
            .array(z.record(z.string(), z.unknown()))
            .min(1)
            .describe("At least one line item"),
        type: z.enum(["invoice", "cashInvoice"]).optional(),
        customerRef: z
            .object({ id: z.string().optional(), name: z.string().optional() })
            .catchall(z.unknown())
            .optional(),
        invoiceNumber: z.string().optional(),
        currency: z.string().optional(),
        currencyRate: z.number().optional(),
        dueDate: z.string().optional(),
    })
    .catchall(z.unknown());

const itemBody = z
    .object({
        description: z.string(),
        itemType: z.enum(["salesItem", "descriptionOnlyItem"]).optional(),
        productType: z.enum(["goods", "services"]).optional(),
        unitType: z.string().optional().describe("e.g. piece, hour, month"),
        unitPrice: z.number().optional(),
        taxRate: z.number().optional(),
        bookkeepingAccountNumber: z.number().int().optional(),
    })
    .catchall(z.unknown());

function paging(args: { page?: number; pageSize?: number; query?: string }): Query {
    return { page: args.page, pageSize: args.pageSize ?? 100, query: args.query };
}

const cbase = (cid?: string) => `/companies/${resolveCompanyId(cid)}`;

// ---- meta ------------------------------------------------------------------

tool("bokio_company_info", "Retrieve company information.", { companyId }, async (a) =>
    ok(await bokioRequest({ path: `${cbase(a.companyId)}/company-information` })),
);

tool(
    "bokio_list_fiscal_years",
    "List fiscal years (needed for SIE export ids).",
    { companyId },
    async (a) => okStructured(await bokioRequest({ path: `${cbase(a.companyId)}/fiscal-years` })),
    listOutput,
);

tool(
    "bokio_get_fiscal_year",
    "Get a single fiscal year by id.",
    { fiscalYearId: z.string(), companyId },
    async (a) =>
        ok(await bokioRequest({ path: `${cbase(a.companyId)}/fiscal-years/${a.fiscalYearId}` })),
);

tool(
    "bokio_chart_of_accounts",
    "Get the chart of accounts (BAS).",
    { companyId, page, pageSize },
    async (a) =>
        ok(
            await bokioRequest({
                path: `${cbase(a.companyId)}/chart-of-accounts`,
                query: paging(a),
            }),
        ),
);

tool(
    "bokio_get_account",
    "Get one account from the chart of accounts.",
    { account: z.number().int(), companyId },
    async (a) =>
        ok(await bokioRequest({ path: `${cbase(a.companyId)}/chart-of-accounts/${a.account}` })),
);

tool(
    "bokio_download_sie",
    "Download the SIE file for a fiscal year. Saves to savePath if given, else returns a text preview.",
    { fiscalYearId: z.string(), companyId, savePath: z.string().optional() },
    async (a) => {
        const buf = await bokioDownload(`${cbase(a.companyId)}/sie/${a.fiscalYearId}/download`);
        if (a.savePath) {
            const target = downloadTarget(a.savePath);
            await writeFile(target, buf);
            return ok(`Wrote ${buf.length} bytes to ${target}`);
        }
        return ok(buf.toString("latin1").slice(0, 4000));
    },
);

// ---- journal entries -------------------------------------------------------

tool(
    "bokio_list_journal_entries",
    "List journal entries (verifikationer). Use from/to for a date range or query for raw filters.",
    { companyId, page, pageSize, query, from: z.string().optional(), to: z.string().optional() },
    async (a) => {
        const q = paging(a);
        q.query = filterQuery(a.from, a.to, a.query);
        return okStructured(
            await bokioRequest({ path: `${cbase(a.companyId)}/journal-entries`, query: q }),
        );
    },
    listOutput,
);

tool(
    "bokio_get_journal_entry",
    "Get a journal entry by id.",
    { journalEntryId: z.string(), companyId },
    async (a) =>
        ok(
            await bokioRequest({
                path: `${cbase(a.companyId)}/journal-entries/${a.journalEntryId}`,
            }),
        ),
);

tool(
    "bokio_create_journal_entry",
    "Create a journal entry (double-entry: debit sum must equal credit sum). WRITE.",
    {
        companyId,
        title: z.string().optional(),
        date: z.string().optional().describe("YYYY-MM-DD"),
        journalEntryNumber: z.string().optional(),
        items: z
            .array(
                z.object({
                    account: z.number().int().describe("BAS account number"),
                    debit: z.number().default(0),
                    credit: z.number().default(0),
                }),
            )
            .min(2)
            .describe("Balanced line items"),
    },
    async (a) =>
        ok(
            await bokioRequest({
                method: "POST",
                path: `${cbase(a.companyId)}/journal-entries`,
                body: {
                    title: a.title,
                    date: a.date,
                    journalEntryNumber: a.journalEntryNumber,
                    items: a.items,
                },
            }),
        ),
);

tool(
    "bokio_reverse_journal_entry",
    "Reverse (reversera) a journal entry. WRITE.",
    { journalEntryId: z.string(), companyId },
    async (a) =>
        ok(
            await bokioRequest({
                method: "POST",
                path: `${cbase(a.companyId)}/journal-entries/${a.journalEntryId}/reverse`,
            }),
        ),
);

// ---- invoices --------------------------------------------------------------

tool(
    "bokio_list_invoices",
    "List customer invoices.",
    { companyId, page, pageSize, query },
    async (a) =>
        okStructured(
            await bokioRequest({ path: `${cbase(a.companyId)}/invoices`, query: paging(a) }),
        ),
    listOutput,
);

tool(
    "bokio_get_invoice",
    "Get an invoice by id.",
    { invoiceId: z.string(), companyId },
    async (a) => ok(await bokioRequest({ path: `${cbase(a.companyId)}/invoices/${a.invoiceId}` })),
);

tool(
    "bokio_create_invoice",
    "Create an invoice. Required in body: invoiceDate, lineItems. WRITE.",
    { companyId, invoice: invoiceBody },
    async (a) =>
        ok(
            await bokioRequest({
                method: "POST",
                path: `${cbase(a.companyId)}/invoices`,
                body: a.invoice,
            }),
        ),
);

tool(
    "bokio_update_invoice",
    "Update an invoice. WRITE.",
    { invoiceId: z.string(), companyId, invoice: invoiceBody },
    async (a) =>
        ok(
            await bokioRequest({
                method: "PUT",
                path: `${cbase(a.companyId)}/invoices/${a.invoiceId}`,
                body: a.invoice,
            }),
        ),
);

tool(
    "bokio_delete_invoice",
    "Delete an invoice. WRITE.",
    { invoiceId: z.string(), companyId },
    async (a) =>
        ok(
            await bokioRequest({
                method: "DELETE",
                path: `${cbase(a.companyId)}/invoices/${a.invoiceId}`,
            }),
        ),
);

tool(
    "bokio_publish_invoice",
    "Publish an invoice. WRITE.",
    { invoiceId: z.string(), companyId },
    async (a) =>
        ok(
            await bokioRequest({
                method: "POST",
                path: `${cbase(a.companyId)}/invoices/${a.invoiceId}/publish`,
            }),
        ),
);

tool(
    "bokio_record_invoice",
    "Record (bokför) an invoice. WRITE.",
    { invoiceId: z.string(), companyId },
    async (a) =>
        ok(
            await bokioRequest({
                method: "POST",
                path: `${cbase(a.companyId)}/invoices/${a.invoiceId}/record`,
            }),
        ),
);

tool(
    "bokio_create_invoice_payment",
    "Register a payment on an invoice. Required: date, sumBaseCurrency, bookkeepingAccountNumber. WRITE.",
    {
        invoiceId: z.string(),
        companyId,
        date: z.string().describe("YYYY-MM-DD"),
        sumBaseCurrency: z.number(),
        bookkeepingAccountNumber: z.number().int(),
    },
    async (a) =>
        ok(
            await bokioRequest({
                method: "POST",
                path: `${cbase(a.companyId)}/invoices/${a.invoiceId}/payments`,
                body: {
                    date: a.date,
                    sumBaseCurrency: a.sumBaseCurrency,
                    bookkeepingAccountNumber: a.bookkeepingAccountNumber,
                },
            }),
        ),
);

// ---- customers -------------------------------------------------------------

tool(
    "bokio_list_customers",
    "List customers.",
    { companyId, page, pageSize, query },
    async (a) =>
        okStructured(
            await bokioRequest({ path: `${cbase(a.companyId)}/customers`, query: paging(a) }),
        ),
    listOutput,
);

tool(
    "bokio_get_customer",
    "Get a customer by id.",
    { customerId: z.string(), companyId },
    async (a) =>
        ok(await bokioRequest({ path: `${cbase(a.companyId)}/customers/${a.customerId}` })),
);

tool(
    "bokio_create_customer",
    "Create a customer. Required: name, type (company|private). WRITE.",
    { companyId, customer: customerBody },
    async (a) =>
        ok(
            await bokioRequest({
                method: "POST",
                path: `${cbase(a.companyId)}/customers`,
                body: a.customer,
            }),
        ),
);

tool(
    "bokio_update_customer",
    "Update a customer. WRITE.",
    { customerId: z.string(), companyId, customer: customerBody },
    async (a) =>
        ok(
            await bokioRequest({
                method: "PUT",
                path: `${cbase(a.companyId)}/customers/${a.customerId}`,
                body: a.customer,
            }),
        ),
);

// ---- items -----------------------------------------------------------------

tool(
    "bokio_list_items",
    "List items (articles).",
    { companyId, page, pageSize },
    async (a) =>
        okStructured(await bokioRequest({ path: `${cbase(a.companyId)}/items`, query: paging(a) })),
    listOutput,
);

tool("bokio_get_item", "Get an item by id.", { itemId: z.string(), companyId }, async (a) =>
    ok(await bokioRequest({ path: `${cbase(a.companyId)}/items/${a.itemId}` })),
);

tool("bokio_create_item", "Create an item. WRITE.", { companyId, item: itemBody }, async (a) =>
    ok(await bokioRequest({ method: "POST", path: `${cbase(a.companyId)}/items`, body: a.item })),
);

tool(
    "bokio_update_item",
    "Update an item. WRITE.",
    { itemId: z.string(), companyId, item: itemBody },
    async (a) =>
        ok(
            await bokioRequest({
                method: "PUT",
                path: `${cbase(a.companyId)}/items/${a.itemId}`,
                body: a.item,
            }),
        ),
);

// ---- uploads ---------------------------------------------------------------

tool(
    "bokio_list_uploads",
    "List uploaded files / receipts.",
    { companyId, page, pageSize },
    async (a) =>
        okStructured(
            await bokioRequest({ path: `${cbase(a.companyId)}/uploads`, query: paging(a) }),
        ),
    listOutput,
);

tool(
    "bokio_get_upload",
    "Get upload metadata by id.",
    { uploadId: z.string(), companyId },
    async (a) => ok(await bokioRequest({ path: `${cbase(a.companyId)}/uploads/${a.uploadId}` })),
);

tool(
    "bokio_upload_file",
    "Upload a local file (receipt/kvitto) to Bokio. WRITE.",
    {
        companyId,
        filePath: z.string().describe("Absolute path to the file to upload"),
        description: z.string().optional(),
        journalEntryId: z.string().optional(),
    },
    async (a) => {
        // Reuse the write gate via bokioRequest with a multipart form.
        const form = await fileForm(a.filePath, {
            description: a.description,
            journalEntryId: a.journalEntryId,
        });
        return ok(
            await bokioRequest({ method: "POST", path: `${cbase(a.companyId)}/uploads`, form }),
        );
    },
);

tool(
    "bokio_download_upload",
    "Download an uploaded file's data to savePath.",
    { uploadId: z.string(), companyId, savePath: z.string() },
    async (a) => {
        const buf = await bokioDownload(`${cbase(a.companyId)}/uploads/${a.uploadId}/download`);
        const target = downloadTarget(a.savePath);
        await writeFile(target, buf);
        return ok(`Wrote ${buf.length} bytes to ${target}`);
    },
);

// ---- raw escape hatch ------------------------------------------------------

tool(
    "bokio_raw_get",
    "GET an arbitrary Bokio API path (read-only escape hatch). {companyId} is substituted.",
    {
        path: z.string().describe("e.g. /companies/{companyId}/credit-notes"),
        companyId,
        params: z
            .record(z.string(), z.union([z.string(), z.number()]))
            .optional()
            .describe("Scalar query params"),
    },
    async (a) => {
        let path: string = a.path.startsWith("/") ? a.path : `/${a.path}`;
        if (path.includes("{companyId}"))
            path = path.replaceAll("{companyId}", resolveCompanyId(a.companyId));
        return ok(await bokioRequest({ path, query: a.params as Query | undefined }));
    },
);

// ---- boot ------------------------------------------------------------------

async function main(): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    const warn = tokenWarning();
    if (warn) process.stderr.write(`bokio-mcp: ${warn}\n`);
    process.stderr.write(`bokio-mcp ready (writes ${writesAllowed() ? "ENABLED" : "disabled"})\n`);
}

// Only open stdio when run as the entry point; importing (e.g. in tests) must not connect.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((err) => {
        process.stderr.write(`fatal: ${(err as Error).message}\n`);
        process.exit(1);
    });
}
