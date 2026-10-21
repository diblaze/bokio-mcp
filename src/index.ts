#!/usr/bin/env node
import { existsSync, realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
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
    ID_PATTERN,
    type Query,
    resolveCompanyId,
    tokenWarning,
    writesAllowed,
} from "./bokio.js";
import {
    allLines,
    balancesAt,
    duplicates,
    ledger,
    parseSie,
    profitAndLoss,
    reconcile,
    type Sie,
    vatSummary,
} from "./sie.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

export const server = new McpServer({ name: "bokio-mcp", version });

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
// Tools with an outputSchema must always return an object, or the SDK raises a
// protocol error: wrap a bare array as items, and fall back to {} for anything else.
function okStructured(data: unknown): Result {
    const r = ok(data);
    if (Array.isArray(data)) r.structuredContent = { items: data };
    else if (data && typeof data === "object")
        r.structuredContent = data as Record<string, unknown>;
    else r.structuredContent = {};
    return r;
}

// Permissive paginated envelope shared by Bokio list endpoints.
const listOutput: ZodRawShape = {
    items: z.array(z.unknown()).optional(),
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
              // Not undoable via the API: publish locks + numbers a document, record
              // posts to the ledger, update_supplier_invoice drops omitted line items.
              destructiveHint: /reverse|delete|publish|record|update_supplier_invoice/.test(name),
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

const idParam = z.string().regex(ID_PATTERN, "expected a plain id (letters, digits, - or _)");
const companyId = idParam
    .optional()
    .describe("Bokio company id. Defaults to BOKIO_COMPANY_ID if omitted.");
const page = z.number().int().positive().optional().describe("Page number (1-based)");
const pageSize = z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe("Items per page (max 100)");
const query = z
    .string()
    .optional()
    .describe(
        'Bokio filter query; combine conditions with &&, e.g. "date>=2026-07-01&&date<=2026-07-31"',
    );
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

// Draft credit notes only (Bokio rejects updates to published ones). `id` is injected by the tool.
export const creditNoteBody = z
    .object({
        currency: z.string().describe("ISO currency code, e.g. SEK"),
        creditDate: z.string().describe("YYYY-MM-DD"),
        dueDate: z.string().describe("YYYY-MM-DD"),
        lineItems: z
            .array(z.record(z.string(), z.unknown()))
            .min(1)
            .describe("At least one line item"),
    })
    .catchall(z.unknown());

// Flat inputs; the tool nests date/sumBaseCurrency/vatScheme into invoiceSettlementDetails.
export const settlementBody = z
    .object({
        type: z.enum(["currency", "bankFee", "paymentServiceFee"]),
        date: z.string().describe("YYYY-MM-DD"),
        sumBaseCurrency: z.number(),
        vatScheme: z
            .enum(["domestic", "eu", "nonEu", "vatExempt"])
            .optional()
            .describe("Required for paymentServiceFee only"),
    })
    .refine((s) => (s.type === "paymentServiceFee") === (s.vatScheme !== undefined), {
        message: "vatScheme is required for paymentServiceFee and not allowed otherwise",
        path: ["vatScheme"],
    });

export const supplierBody = z
    .object({
        name: z.string(),
        orgNumber: z.string().optional(),
        vatNumber: z.string().optional(),
        currency: z.string().optional(),
        address: addressSchema.partial().optional(),
        paymentDetails: z
            .discriminatedUnion("type", [
                z.object({ type: z.literal("bankgiro"), bankgiroNumber: z.string() }),
                z.object({ type: z.literal("plusgiro"), plusgiroNumber: z.string() }),
                z.object({
                    type: z.literal("transfer"),
                    clearingNumber: z.string(),
                    accountNumber: z.string(),
                }),
                z.object({
                    type: z.literal("internationalPayment"),
                    iban: z.string(),
                    bic: z.string(),
                }),
            ])
            .optional(),
    })
    .catchall(z.unknown());

export const supplierInvoiceBody = z
    .object({
        supplierRef: z.object({ id: z.string() }),
        invoiceNumber: z.string().optional(),
        invoiceDate: z.string().describe("YYYY-MM-DD"),
        dueDate: z.string().describe("YYYY-MM-DD"),
        totalAmount: z.number(),
        uploadRef: z.object({ id: z.string() }).optional().describe("Attach an existing upload"),
        lineItems: z
            .array(z.record(z.string(), z.unknown()))
            .optional()
            .describe("Preview field in Bokio; may change"),
    })
    .catchall(z.unknown());

function paging(args: { page?: number; pageSize?: number; query?: string }): Query {
    return { page: args.page, pageSize: args.pageSize ?? 100, query: args.query };
}

const cbase = (cid?: string) => `/companies/${resolveCompanyId(cid)}`;

// Validate the target before downloading, so a bad path costs no API request.
// Never overwrite: download tools are read-only, so they must not clobber existing files.
async function saveDownload(path: string, savePath: string): Promise<Result> {
    const target = downloadTarget(savePath);
    if (existsSync(target)) throw new Error(`${target} already exists; choose a new savePath`);
    const buf = await bokioDownload(path);
    await writeFile(target, buf, { flag: "wx" });
    return ok(`Wrote ${buf.length} bytes to ${target}`);
}

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
    { fiscalYearId: idParam, companyId },
    async (a) =>
        ok(await bokioRequest({ path: `${cbase(a.companyId)}/fiscal-years/${a.fiscalYearId}` })),
);

tool(
    "bokio_chart_of_accounts",
    "Get the chart of accounts (BAS).",
    { companyId, query },
    async (a) =>
        ok(
            await bokioRequest({
                path: `${cbase(a.companyId)}/chart-of-accounts`,
                query: { query: a.query },
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
    { fiscalYearId: idParam, companyId, savePath: z.string().optional() },
    async (a) => {
        const path = `${cbase(a.companyId)}/sie/${a.fiscalYearId}/download`;
        if (a.savePath) return saveDownload(path, a.savePath);
        const buf = await bokioDownload(path);
        return ok(buf.toString("latin1").slice(0, 4000));
    },
);

// ---- computed (read-only, from the SIE export) -----------------------------
// Arithmetic happens here, in öre, so clients never add up rows themselves.

type FiscalYear = { id: string; startDate: string; endDate: string };

/** Download + parse the SIE export of each fiscal year touching [from, to] (or the given id). */
async function loadYears(
    cid: string | undefined,
    sel: { fiscalYearId?: string; from: string; to: string },
): Promise<Sie[]> {
    const base = cbase(cid);
    let ids: string[];
    if (sel.fiscalYearId) {
        ids = [sel.fiscalYearId];
    } else {
        const res = await bokioRequest<{ items?: FiscalYear[] } | FiscalYear[]>({
            path: `${base}/fiscal-years`,
        });
        const years = (Array.isArray(res) ? res : (res?.items ?? [])).map((y) => ({
            id: y.id,
            from: y.startDate.slice(0, 10),
            to: y.endDate.slice(0, 10),
        }));
        const { from, to } = sel;
        ids = years.filter((y) => y.from <= to && y.to >= from).map((y) => y.id);
        if (!ids.length) {
            const covered = years
                .map((y) => `${y.from}..${y.to}`)
                .sort()
                .join(", ");
            throw new Error(`no fiscal year covers ${from}..${to}; covered: ${covered || "none"}`);
        }
    }
    const sies: Sie[] = [];
    for (const id of ids) sies.push(parseSie(await bokioDownload(`${base}/sie/${id}/download`)));
    return sies.sort((a, b) => a.from.localeCompare(b.from));
}

const isoDay = z.iso.date(); // YYYY-MM-DD, real calendar dates only
const today = () => new Date().toISOString().slice(0, 10);
const SIGN = "Amounts in ledger sign: debit positive, credit negative.";

tool(
    "bokio_account_balances",
    `Account balances at a date, computed from the SIE export (opening + movements to the date). ${SIGN} Date defaults to the fiscal year's last day when fiscalYearId is given, else today.`,
    {
        companyId,
        date: isoDay.optional(),
        fiscalYearId: idParam.optional(),
        accounts: z.array(z.number().int()).optional().describe("Only these account numbers"),
    },
    async (a) => {
        const sies = await loadYears(a.companyId, {
            fiscalYearId: a.fiscalYearId,
            from: a.date ?? today(),
            to: a.date ?? today(),
        });
        const date = a.date ?? (a.fiscalYearId ? sies[0].to : today());
        return okStructured({ date, balances: balancesAt(sies, date, a.accounts) });
    },
    {
        date: z.string(),
        balances: z.array(
            z.object({
                account: z.number(),
                name: z.string(),
                opening: z.number(),
                movement: z.number(),
                balance: z.number(),
            }),
        ),
    },
);

tool(
    "bokio_account_ledger",
    `Lines on one account between two dates with running balance, ordered by date, series, number. ${SIGN} Annulled verifications are kept and flagged cancelled.`,
    { companyId, account: z.number().int(), from: isoDay, to: isoDay },
    async (a) => {
        if (a.from > a.to) throw new Error("from is after to");
        const sies = await loadYears(a.companyId, { from: a.from, to: a.to });
        return okStructured(ledger(sies, a.account, a.from, a.to));
    },
    {
        account: z.number(),
        name: z.string(),
        from: z.string(),
        to: z.string(),
        opening: z.number(),
        closing: z.number(),
        lines: z.array(
            z.object({
                date: z.string(),
                series: z.string(),
                number: z.string(),
                text: z.string(),
                amount: z.number(),
                balance: z.number(),
                cancelled: z.boolean(),
            }),
        ),
    },
);

const lineRef = z.object({
    date: z.string(),
    series: z.string(),
    number: z.string(),
    text: z.string(),
});
const lineOut = lineRef.extend({ amount: z.number() });
const shift = (d: string, days: number) =>
    new Date(Date.parse(d) + days * 86_400_000).toISOString().slice(0, 10);

tool(
    "bokio_find_duplicates",
    `Possible double bookings: lines with the same account and amount from different verifications within windowDays of each other. Annulled verifications are skipped. ${SIGN}`,
    {
        companyId,
        from: isoDay,
        to: isoDay,
        account: z.number().int().optional(),
        windowDays: z.number().int().min(0).max(90).default(7),
    },
    async (a) => {
        if (a.from > a.to) throw new Error("from is after to");
        const sies = await loadYears(a.companyId, { from: a.from, to: a.to });
        return okStructured({ groups: duplicates(sies, a.from, a.to, a.windowDays, a.account) });
    },
    {
        groups: z.array(
            z.object({ account: z.number(), amount: z.number(), lines: z.array(lineRef) }),
        ),
    },
);

tool(
    "bokio_reconcile_bank",
    `Match bank statement rows (date, amount, text) against one ledger account (default 1930) by exact amount within toleranceDays; rows in date order each take the earliest reachable unmatched line, each ledger line once. Returns matched pairs, unmatched rows on each side, suspected duplicate ledger lines and the totals for the statement's date span; difference = ledger minus bank. Amounts at most two decimals. ${SIGN} Bank amounts: outflow negative.`,
    {
        companyId,
        account: z.number().int().default(1930),
        toleranceDays: z.number().int().min(0).max(30).default(3),
        rows: z
            .array(
                z.object({
                    date: isoDay,
                    // whole öre only: more than two decimals would round silently
                    amount: z
                        .number()
                        .refine(
                            (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6,
                            "at most two decimals",
                        ),
                    text: z.string().optional(),
                }),
            )
            .min(1),
    },
    async (a) => {
        const dates = a.rows.map((r: { date: string }) => r.date).sort();
        const from = shift(dates[0], -a.toleranceDays);
        const to = shift(dates[dates.length - 1], a.toleranceDays);
        const sies = await loadYears(a.companyId, { from, to });
        const lines = allLines(sies).filter(
            (l) => l.account === a.account && !l.cancelled && l.date >= from && l.date <= to,
        );
        return okStructured({
            account: a.account,
            from,
            to,
            ...reconcile(lines, a.rows, a.toleranceDays),
        });
    },
    {
        account: z.number(),
        from: z.string(),
        to: z.string(),
        matched: z.array(
            z.object({
                bank: z.object({
                    date: z.string(),
                    amount: z.number(),
                    text: z.string().optional(),
                }),
                ledger: lineOut,
                dayDiff: z.number(),
            }),
        ),
        unmatchedBank: z.array(
            z.object({ date: z.string(), amount: z.number(), text: z.string().optional() }),
        ),
        unmatchedLedger: z.array(lineOut),
        suspectedDuplicates: z.array(lineOut),
        bankTotal: z.number(),
        ledgerTotal: z.number(),
        difference: z.number(),
    },
);

tool(
    "bokio_vat_summary",
    `VAT (2610-2659) and sales (3000-3999) account totals for a period, plus outputVat (negated 2610-2639), inputVat (2640-2649) and netVat = output - input (positive = to pay). Account totals only: does not map to tax-return boxes. ${SIGN}`,
    { companyId, from: isoDay, to: isoDay },
    async (a) => {
        if (a.from > a.to) throw new Error("from is after to");
        return okStructured(vatSummary(await loadYears(a.companyId, a), a.from, a.to));
    },
    {
        from: z.string(),
        to: z.string(),
        accounts: z.array(z.object({ account: z.number(), name: z.string(), amount: z.number() })),
        outputVat: z.number(),
        inputVat: z.number(),
        netVat: z.number(),
    },
);

tool(
    "bokio_profit_and_loss",
    `Result accounts (classes 3-8) for a period, grouped by BAS class or by account; result = negated total (profit positive). ${SIGN}`,
    { companyId, from: isoDay, to: isoDay, groupBy: z.enum(["class", "account"]).default("class") },
    async (a) => {
        if (a.from > a.to) throw new Error("from is after to");
        return okStructured(
            profitAndLoss(await loadYears(a.companyId, a), a.from, a.to, a.groupBy),
        );
    },
    {
        from: z.string(),
        to: z.string(),
        rows: z.array(z.object({ key: z.string(), name: z.string(), amount: z.number() })),
        result: z.number(),
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
    { journalEntryId: idParam, companyId },
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
    { journalEntryId: idParam, companyId },
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

tool("bokio_get_invoice", "Get an invoice by id.", { invoiceId: idParam, companyId }, async (a) =>
    ok(await bokioRequest({ path: `${cbase(a.companyId)}/invoices/${a.invoiceId}` })),
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
    { invoiceId: idParam, companyId, invoice: invoiceBody },
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
    { invoiceId: idParam, companyId },
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
    { invoiceId: idParam, companyId },
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
    { invoiceId: idParam, companyId },
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
        invoiceId: idParam,
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

tool(
    "bokio_download_invoice",
    "Download a published invoice as PDF to savePath.",
    { invoiceId: idParam, companyId, savePath: z.string() },
    async (a) => saveDownload(`${cbase(a.companyId)}/invoices/${a.invoiceId}/download`, a.savePath),
);

tool(
    "bokio_list_invoice_payments",
    "List payments registered on an invoice.",
    { invoiceId: idParam, companyId, page, pageSize, query },
    async (a) =>
        okStructured(
            await bokioRequest({
                path: `${cbase(a.companyId)}/invoices/${a.invoiceId}/payments`,
                query: paging(a),
            }),
        ),
    listOutput,
);

tool(
    "bokio_list_invoice_settlements",
    "List settlements (currency differences, bank and payment-service fees) on an invoice.",
    { invoiceId: idParam, companyId, page, pageSize, query },
    async (a) =>
        okStructured(
            await bokioRequest({
                path: `${cbase(a.companyId)}/invoices/${a.invoiceId}/settlements`,
                query: paging(a),
            }),
        ),
    listOutput,
);

tool(
    "bokio_create_invoice_settlement",
    "Register a settlement on an invoice: currency difference, bank fee or payment-service fee (needs vatScheme). WRITE.",
    { invoiceId: idParam, companyId, settlement: settlementBody },
    async (a) => {
        const { type, ...details } = a.settlement;
        return ok(
            await bokioRequest({
                method: "POST",
                path: `${cbase(a.companyId)}/invoices/${a.invoiceId}/settlements`,
                body: { type, invoiceSettlementDetails: details },
            }),
        );
    },
);

// ---- credit notes ----------------------------------------------------------

tool(
    "bokio_list_credit_notes",
    "List credit notes (kreditfakturor).",
    { companyId, page, pageSize, query },
    async (a) =>
        okStructured(
            await bokioRequest({ path: `${cbase(a.companyId)}/credit-notes`, query: paging(a) }),
        ),
    listOutput,
);

tool(
    "bokio_get_credit_note",
    "Get a credit note by id.",
    { creditNoteId: idParam, companyId },
    async (a) =>
        ok(await bokioRequest({ path: `${cbase(a.companyId)}/credit-notes/${a.creditNoteId}` })),
);

tool(
    "bokio_download_credit_note",
    "Download a published credit note as PDF to savePath.",
    { creditNoteId: idParam, companyId, savePath: z.string() },
    async (a) =>
        saveDownload(`${cbase(a.companyId)}/credit-notes/${a.creditNoteId}/download`, a.savePath),
);

tool(
    "bokio_create_credit_note",
    "Create a draft credit note that credits an invoice. Edit it with bokio_update_credit_note, then publish. WRITE.",
    { invoiceId: idParam, companyId },
    async (a) =>
        ok(
            await bokioRequest({
                method: "POST",
                path: `${cbase(a.companyId)}/invoices/${a.invoiceId}/credit`,
            }),
        ),
);

tool(
    "bokio_update_credit_note",
    "Update a draft credit note. Required: currency, creditDate, dueDate, lineItems. WRITE.",
    { creditNoteId: idParam, companyId, creditNote: creditNoteBody },
    async (a) =>
        ok(
            await bokioRequest({
                method: "PUT",
                path: `${cbase(a.companyId)}/credit-notes/${a.creditNoteId}`,
                body: { ...a.creditNote, id: a.creditNoteId },
            }),
        ),
);

tool(
    "bokio_publish_credit_note",
    "Publish a draft credit note. WRITE.",
    { creditNoteId: idParam, companyId },
    async (a) =>
        ok(
            await bokioRequest({
                method: "POST",
                path: `${cbase(a.companyId)}/credit-notes/${a.creditNoteId}/publish`,
            }),
        ),
);

tool(
    "bokio_record_credit_note",
    "Record (bokför) a credit note. WRITE.",
    { creditNoteId: idParam, companyId },
    async (a) =>
        ok(
            await bokioRequest({
                method: "POST",
                path: `${cbase(a.companyId)}/credit-notes/${a.creditNoteId}/record`,
            }),
        ),
);

tool(
    "bokio_delete_credit_note",
    "Delete a draft credit note. WRITE.",
    { creditNoteId: idParam, companyId },
    async (a) =>
        ok(
            await bokioRequest({
                method: "DELETE",
                path: `${cbase(a.companyId)}/credit-notes/${a.creditNoteId}`,
            }),
        ),
);

// ---- suppliers -------------------------------------------------------------

tool(
    "bokio_list_suppliers",
    "List suppliers (leverantörer).",
    { companyId, page, pageSize, query },
    async (a) =>
        okStructured(
            await bokioRequest({ path: `${cbase(a.companyId)}/suppliers`, query: paging(a) }),
        ),
    listOutput,
);

tool("bokio_get_supplier", "Get a supplier by id.", { supplierId: idParam, companyId }, async (a) =>
    ok(await bokioRequest({ path: `${cbase(a.companyId)}/suppliers/${a.supplierId}` })),
);

tool(
    "bokio_create_supplier",
    "Create a supplier. Required: name. WRITE.",
    { companyId, supplier: supplierBody },
    async (a) =>
        ok(
            await bokioRequest({
                method: "POST",
                path: `${cbase(a.companyId)}/suppliers`,
                body: a.supplier,
            }),
        ),
);

tool(
    "bokio_update_supplier",
    "Update a supplier. WRITE.",
    { supplierId: idParam, companyId, supplier: supplierBody },
    async (a) =>
        ok(
            await bokioRequest({
                method: "PUT",
                path: `${cbase(a.companyId)}/suppliers/${a.supplierId}`,
                body: a.supplier,
            }),
        ),
);

tool(
    "bokio_list_supplier_invoices",
    "List supplier invoices (leverantörsfakturor).",
    { companyId, page, pageSize, query },
    async (a) =>
        okStructured(
            await bokioRequest({
                path: `${cbase(a.companyId)}/supplier-invoices`,
                query: paging(a),
            }),
        ),
    listOutput,
);

tool(
    "bokio_get_supplier_invoice",
    "Get a supplier invoice by id.",
    { supplierInvoiceId: idParam, companyId },
    async (a) =>
        ok(
            await bokioRequest({
                path: `${cbase(a.companyId)}/supplier-invoices/${a.supplierInvoiceId}`,
            }),
        ),
);

tool(
    "bokio_create_supplier_invoice",
    "Create a supplier invoice. Required: supplierRef.id, invoiceDate, dueDate, totalAmount. WRITE.",
    { companyId, supplierInvoice: supplierInvoiceBody },
    async (a) =>
        ok(
            await bokioRequest({
                method: "POST",
                path: `${cbase(a.companyId)}/supplier-invoices`,
                body: a.supplierInvoice,
            }),
        ),
);

tool(
    "bokio_update_supplier_invoice",
    "Update a supplier invoice. Line items left out of lineItems are removed. WRITE.",
    {
        supplierInvoiceId: idParam,
        companyId,
        // .catchall would still pass uploadRef through; Bokio's update schema has none.
        supplierInvoice: supplierInvoiceBody
            .omit({ uploadRef: true })
            .refine((b) => !("uploadRef" in b), "uploadRef is not accepted on update"),
    },
    async (a) =>
        ok(
            await bokioRequest({
                method: "PUT",
                path: `${cbase(a.companyId)}/supplier-invoices/${a.supplierInvoiceId}`,
                body: a.supplierInvoice,
            }),
        ),
);

// ---- bank payments (read-only by design) -----------------------------------
// Creating a bank payment moves money after BankID signing; it is deliberately not exposed.

tool(
    "bokio_list_bank_payments",
    "List bank payments. Bokio returns only payments created by this integration; creation is deliberately not exposed.",
    { companyId, page, pageSize, query },
    async (a) =>
        okStructured(
            await bokioRequest({ path: `${cbase(a.companyId)}/bank-payments`, query: paging(a) }),
        ),
    listOutput,
);

tool(
    "bokio_get_bank_payment",
    "Get a bank payment by id (only payments created by this integration; creation is deliberately not exposed).",
    { bankPaymentId: idParam, companyId },
    async (a) =>
        ok(await bokioRequest({ path: `${cbase(a.companyId)}/bank-payments/${a.bankPaymentId}` })),
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

tool("bokio_get_customer", "Get a customer by id.", { customerId: idParam, companyId }, async (a) =>
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
    { customerId: idParam, companyId, customer: customerBody },
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
    { companyId, page, pageSize, query },
    async (a) =>
        okStructured(await bokioRequest({ path: `${cbase(a.companyId)}/items`, query: paging(a) })),
    listOutput,
);

tool("bokio_get_item", "Get an item by id.", { itemId: idParam, companyId }, async (a) =>
    ok(await bokioRequest({ path: `${cbase(a.companyId)}/items/${a.itemId}` })),
);

tool("bokio_create_item", "Create an item. WRITE.", { companyId, item: itemBody }, async (a) =>
    ok(await bokioRequest({ method: "POST", path: `${cbase(a.companyId)}/items`, body: a.item })),
);

tool(
    "bokio_update_item",
    "Update an item. WRITE.",
    { itemId: idParam, companyId, item: itemBody },
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
    { companyId, page, pageSize, query },
    async (a) =>
        okStructured(
            await bokioRequest({ path: `${cbase(a.companyId)}/uploads`, query: paging(a) }),
        ),
    listOutput,
);

tool(
    "bokio_get_upload",
    "Get upload metadata by id.",
    { uploadId: idParam, companyId },
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
    { uploadId: idParam, companyId, savePath: z.string() },
    async (a) => saveDownload(`${cbase(a.companyId)}/uploads/${a.uploadId}/download`, a.savePath),
);

// ---- raw escape hatch ------------------------------------------------------

tool(
    "bokio_raw_get",
    "GET an arbitrary Bokio API path (read-only escape hatch). {companyId} is substituted.",
    {
        path: z.string().describe("e.g. /companies/{companyId}/tag-groups"),
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

// ---- resources (stable reference data) -------------------------------------

function reference(
    name: string,
    uri: string,
    description: string,
    path: (cid: string) => string,
): void {
    server.registerResource(
        name,
        uri,
        { title: name, description, mimeType: "application/json" },
        async (u) => {
            const data = await bokioRequest({ path: path(resolveCompanyId()) });
            return {
                contents: [
                    {
                        uri: u.href,
                        mimeType: "application/json",
                        text: JSON.stringify(data, null, 2),
                    },
                ],
            };
        },
    );
}

reference(
    "company-info",
    "bokio://company/info",
    "Company information for the default Bokio company (BOKIO_COMPANY_ID).",
    (cid) => `/companies/${cid}/company-information`,
);
reference(
    "chart-of-accounts",
    "bokio://company/chart-of-accounts",
    "Chart of accounts (BAS) for the default company.",
    (cid) => `/companies/${cid}/chart-of-accounts`,
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
// realpath: npm/npx start the bin through a symlink in node_modules/.bin.
function isEntryPoint(): boolean {
    try {
        return realpathSync(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
    } catch {
        return false; // argv[1] is not a file (e.g. `node -e`, stdin): imported, not run
    }
}

if (isEntryPoint()) {
    main().catch((err) => {
        process.stderr.write(`fatal: ${(err as Error).message}\n`);
        process.exit(1);
    });
}
