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
    cached,
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
    decodeSie,
    duplicates,
    ledger,
    openItems,
    parseSie,
    profitAndLoss,
    reconcile,
    type Sie,
    vatSummary,
} from "./sie.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const INSTRUCTIONS = `Bokio accounting API for one company.

Writes: tools that change data exist only when the server runs with BOKIO_ALLOW_WRITES=1. If a write tool is missing, writes are off; say so and never report a booking, invoice or payment as done unless the call succeeded. Every write changes the live books, so confirm it with the user first. Tools marked destructive (publish, record, reverse, delete, bokio_update_supplier_invoice) cannot be undone.

Numbers: for balances, ledgers, VAT, profit and loss, open items, double bookings and bank reconciliation use the computed tools that read the SIE export instead of summing journal entries yourself; they compute in whole öre. Amounts are in ledger sign, debit positive, credit negative, so liabilities, equity and revenue show negative. A verification and its "Annullering av ..." reversal cancel out.

Cost: each computed call lists the fiscal years, then downloads one SIE export per fiscal year it touches. Both are reused for 5 minutes; writes made through this server clear them, while changes made in Bokio itself can take up to 5 minutes to show. Bokio allows 5,000 requests per company per month and 200 per minute, so ask for the date range you need and reuse results.

Gaps: revenue booked as journal entries does not appear in bokio_list_invoices; use bokio_account_ledger or bokio_open_items. bokio_raw_get reads any other Bokio path.`;

export const server = new McpServer({ name: "bokio-mcp", version }, { instructions: INSTRUCTIONS });

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
// Each resource id names the tool that lists it, so tool descriptions need not repeat it.
const idFrom = (list: string) =>
    idParam.describe(`Id from ${list}; an unknown id returns a not-found error.`);
const fiscalYearId = idFrom("bokio_list_fiscal_years");
const journalEntryId = idFrom("bokio_list_journal_entries");
const invoiceId = idFrom("bokio_list_invoices");
const creditNoteId = idFrom("bokio_list_credit_notes");
const supplierId = idFrom("bokio_list_suppliers");
const supplierInvoiceId = idFrom("bokio_list_supplier_invoices");
const bankPaymentId = idFrom("bokio_list_bank_payments");
const customerId = idFrom("bokio_list_customers");
const itemId = idFrom("bokio_list_items");
const uploadId = idFrom("bokio_list_uploads");
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
const account = z
    .number()
    .int()
    .describe("BAS account number, such as 1930; bokio_chart_of_accounts lists them.");
const isoDay = z.iso.date(); // YYYY-MM-DD, real calendar dates only
const fromDay = isoDay.describe("First day, inclusive (YYYY-MM-DD).");
const toDay = isoDay.describe("Last day, inclusive (YYYY-MM-DD).");
const savePath = z
    .string()
    .describe(
        "File path inside BOKIO_DOWNLOAD_DIR, else the working directory; an existing file is never overwritten, so pick a new name.",
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

const invoiceInput = invoiceBody.describe(
    "Invoice fields in the Bokio API shape; invoiceDate and lineItems are required.",
);
const supplierInput = supplierBody.describe(
    "Supplier fields in the Bokio API shape; name is required.",
);
const customerInput = customerBody.describe(
    "Customer fields in the Bokio API shape; name and type are required.",
);
const itemInput = itemBody.describe("Item fields in the Bokio API shape; description is required.");

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

tool(
    "bokio_company_info",
    "Get the Bokio company's own details, such as its name and organisation number. Use it to confirm which company the token and companyId point at.",
    { companyId },
    async (a) => ok(await bokioRequest({ path: `${cbase(a.companyId)}/company-information` })),
);

tool(
    "bokio_list_fiscal_years",
    "List the company's fiscal years with their ids and start and end dates; returns Bokio's first page, up to 25 years. The ids feed bokio_get_fiscal_year, bokio_download_sie and the fiscalYearId of bokio_account_balances.",
    { companyId },
    async (a) => okStructured(await bokioRequest({ path: `${cbase(a.companyId)}/fiscal-years` })),
    listOutput,
);

tool(
    "bokio_get_fiscal_year",
    "Get one fiscal year by id, with its start and end dates. bokio_list_fiscal_years returns all of them in one call.",
    { fiscalYearId, companyId },
    async (a) =>
        ok(await bokioRequest({ path: `${cbase(a.companyId)}/fiscal-years/${a.fiscalYearId}` })),
);

tool(
    "bokio_chart_of_accounts",
    "List the complete BAS chart of accounts in one unpaged call: account numbers with names. Narrow it with query on account, name or accountType, such as account>=3000&&account<=3999. Use bokio_get_account for one account; the ledger and balance tools take its number.",
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
    "Get one account from the BAS chart of accounts by number. For its balance or postings use bokio_account_balances or bokio_account_ledger.",
    { account, companyId },
    async (a) =>
        ok(await bokioRequest({ path: `${cbase(a.companyId)}/chart-of-accounts/${a.account}` })),
);

tool(
    "bokio_download_sie",
    "Download the raw SIE 4 export of one fiscal year to savePath, or return its first 4,000 characters as text when savePath is omitted. For balances, ledgers, VAT or profit and loss use the computed tools, which read this export themselves and do the arithmetic.",
    { fiscalYearId, companyId, savePath: savePath.optional() },
    async (a) => {
        const path = `${cbase(a.companyId)}/sie/${a.fiscalYearId}/download`;
        if (a.savePath) return saveDownload(path, a.savePath);
        const buf = await bokioDownload(path);
        return ok(decodeSie(buf).slice(0, 4000));
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
        const path = `${base}/fiscal-years`;
        const res = await cached(path, () =>
            bokioRequest<{ items?: FiscalYear[] } | FiscalYear[]>({ path }),
        );
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
    for (const id of ids) {
        const path = `${base}/sie/${id}/download`;
        sies.push(await cached(path, async () => parseSie(await bokioDownload(path))));
    }
    return sies.sort((a, b) => a.from.localeCompare(b.from));
}

const today = () => new Date().toISOString().slice(0, 10);
const SIGN = "Amounts in ledger sign: debit positive, credit negative.";

tool(
    "bokio_account_balances",
    `Compute the opening balance, movement and balance per account at a date from the SIE export. With fiscalYearId only that year is read and date defaults to its last day; otherwise date defaults to today and the year covering it is read. Use it for an account at a date; bokio_account_ledger shows the individual lines. ${SIGN}`,
    {
        companyId,
        date: isoDay
            .optional()
            .describe(
                "Balance date (YYYY-MM-DD); defaults to the fiscal year's last day when fiscalYearId is given, else today.",
            ),
        fiscalYearId: fiscalYearId.optional(),
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
    `List one account's postings between from and to with a running balance, in date order, from the SIE export. A from before the first fiscal year starts at that year; the balance restarts at each fiscal year's opening. Annulled verifications are kept and flagged cancelled; bokio_list_journal_entries lists whole verifications. ${SIGN}`,
    { companyId, account, from: fromDay, to: toDay },
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
    `Find possible double bookings in the SIE export: groups of lines with the same account and amount between from and to, from more than one verification, each within windowDays of the previous one. Annulled verifications and zero lines are skipped; to check against a bank statement use bokio_reconcile_bank. ${SIGN}`,
    {
        companyId,
        from: fromDay,
        to: toDay,
        account: account.optional().describe("Only this BAS account; omit for all accounts."),
        windowDays: z
            .number()
            .int()
            .min(0)
            .max(90)
            .default(7)
            .describe("Max days between consecutive bookings in a group; default 7."),
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
    `Match bank statement rows to one ledger account in the SIE export, reading lines from toleranceDays before the first row to toleranceDays after the last. Returns matched pairs, unmatched rows on both sides, suspected duplicates and totals (difference = ledger minus bank). For double bookings over a period use bokio_find_duplicates. ${SIGN}`,
    {
        companyId,
        account: account.default(1930).describe("Ledger account to match; default 1930 (bank)."),
        toleranceDays: z
            .number()
            .int()
            .min(0)
            .max(30)
            .default(3)
            .describe(
                "Max days between a bank row and its ledger line; each row, in date order, takes the earliest unmatched line of the same amount; default 3.",
            ),
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
            .min(1)
            .describe(
                "Bank statement rows; amounts in kronor with at most two decimals, outflow negative.",
            ),
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
    `Sum the VAT accounts (2610-2659) and sales accounts (3000-3999) between from and to, with outputVat (negated 2610-2639), inputVat (2640-2649) and netVat = output minus input, positive when VAT is to pay. These are account totals, not tax-return boxes; bokio_profit_and_loss gives the period result. ${SIGN}`,
    { companyId, from: fromDay, to: toDay },
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
    `Sum the result accounts (BAS classes 3-8) between from and to, grouped by class or by account, with result = negated total so that profit is positive. For balance-sheet accounts use bokio_account_balances. ${SIGN}`,
    {
        companyId,
        from: fromDay,
        to: toDay,
        groupBy: z
            .enum(["class", "account"])
            .default("class")
            .describe("Group by BAS class (3-8) or by account; default class."),
    },
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

tool(
    "bokio_open_items",
    `List unpaid items on a ledger account at asOf, matching each payment to the earliest unpaid posting of the same amount (FIFO). It reads from 1 January of asOf's year minus lookbackYears up to asOf; the oldest year's opening balance is one unitemised amount. Items carry their age in days; bokio_account_ledger lists all postings. ${SIGN}`,
    {
        companyId,
        account: account
            .default(1510)
            .describe("Ledger account; default 1510 (receivables), 2440 for supplier debt."),
        asOf: isoDay.optional().describe("Date to evaluate at (YYYY-MM-DD); defaults to today."),
        lookbackYears: z
            .number()
            .int()
            .min(0)
            .max(5)
            .default(1)
            .describe(
                "Calendar years before the year of asOf to load, so older unpaid items are itemised; default 1.",
            ),
    },
    async (a) => {
        const asOf = a.asOf ?? today();
        const from = `${Number(asOf.slice(0, 4)) - a.lookbackYears}-01-01`;
        const sies = await loadYears(a.companyId, { from, to: asOf });
        return okStructured(openItems(sies, a.account, asOf));
    },
    {
        account: z.number(),
        asOf: z.string(),
        openingUnitemised: z.number(),
        open: z.array(lineOut.extend({ ageDays: z.number() })),
        unmatchedPayments: z.array(lineOut),
        balance: z.number(),
    },
);

// ---- journal entries -------------------------------------------------------

tool(
    "bokio_list_journal_entries",
    "List journal entries (verifikationer), 100 per page by default; the response carries totalPages. Filter with query on title, journalEntryNumber or date, such as title~invoice 1234; from and to are ANDed with query. Use bokio_get_journal_entry for one entry and bokio_account_ledger for the postings on one account.",
    {
        companyId,
        page,
        pageSize,
        query,
        from: z.string().optional().describe("First day, inclusive (YYYY-MM-DD)."),
        to: z.string().optional().describe("Last day, inclusive (YYYY-MM-DD)."),
    },
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
    "Get one journal entry (verifikation) by id, as Bokio returns it. To find entries by date use bokio_list_journal_entries.",
    { journalEntryId, companyId },
    async (a) =>
        ok(
            await bokioRequest({
                path: `${cbase(a.companyId)}/journal-entries/${a.journalEntryId}`,
            }),
        ),
);

tool(
    "bokio_create_journal_entry",
    "Create a journal entry in the live books; the debit sum must equal the credit sum. To undo one later, reverse it with bokio_reverse_journal_entry. WRITE.",
    {
        companyId,
        title: z.string().optional().describe("Verification text"),
        date: z.string().optional().describe("YYYY-MM-DD"),
        journalEntryNumber: z.string().optional().describe("Verification number"),
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
    "Reverse (reversera) a journal entry by booking an opposite entry; the original stays in the books. Bokio only reverses entries created through the API and not linked to an invoice, once each, and not in a closed fiscal year. WRITE.",
    { journalEntryId, companyId },
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
    "List customer invoices, 100 per page by default; the response carries totalPages. Filter with query on status, invoiceDate, dueDate, currency or totalAmount, such as invoiceDate>=2026-01-01&&currency==SEK. Revenue booked as journal entries is not listed; use bokio_account_ledger or bokio_open_items, and bokio_get_invoice for one invoice.",
    { companyId, page, pageSize, query },
    async (a) =>
        okStructured(
            await bokioRequest({ path: `${cbase(a.companyId)}/invoices`, query: paging(a) }),
        ),
    listOutput,
);

tool(
    "bokio_get_invoice",
    "Get one customer invoice by id, as Bokio returns it. Use bokio_download_invoice for the PDF and bokio_list_invoice_payments for its payments.",
    { invoiceId, companyId },
    async (a) => ok(await bokioRequest({ path: `${cbase(a.companyId)}/invoices/${a.invoiceId}` })),
);

tool(
    "bokio_create_invoice",
    "Create a draft customer invoice. Then publish it with bokio_publish_invoice and record it with bokio_record_invoice. WRITE.",
    { companyId, invoice: invoiceInput },
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
    "Update a draft customer invoice by id with a full set of invoice fields. WRITE.",
    { invoiceId, companyId, invoice: invoiceInput },
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
    "Delete a draft customer invoice by id; this cannot be undone. WRITE.",
    { invoiceId, companyId },
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
    "Publish a draft invoice, making it official and ready to send; Bokio does not email it to the customer. WRITE.",
    { invoiceId, companyId },
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
    "Record (bokför) an invoice, posting it to the ledger; this cannot be undone through the API. WRITE.",
    { invoiceId, companyId },
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
    "Register a payment received on an invoice, with the account the money arrived on. WRITE.",
    {
        invoiceId,
        companyId,
        date: z.string().describe("YYYY-MM-DD"),
        sumBaseCurrency: z.number().describe("Amount paid in the company's base currency"),
        bookkeepingAccountNumber: z
            .number()
            .int()
            .describe("BAS account the money arrived on, such as 1930"),
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
    "Download a published invoice as a PDF file to savePath. Returns the written path and byte count; bokio_get_invoice returns the invoice data instead.",
    { invoiceId, companyId, savePath },
    async (a) => saveDownload(`${cbase(a.companyId)}/invoices/${a.invoiceId}/download`, a.savePath),
);

tool(
    "bokio_list_invoice_payments",
    "List the payments registered on one invoice, 100 per page by default; the response carries totalPages. Filter with query on date or sumBaseCurrency, such as date>=2026-01-01. Fees and currency differences are listed by bokio_list_invoice_settlements.",
    { invoiceId, companyId, page, pageSize, query },
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
    "List the settlements on one invoice (currency differences, bank fees and payment-service fees), 100 per page by default; the response carries totalPages. Filter with query on date or sumBaseCurrency, such as date>=2026-01-01. Payments are listed by bokio_list_invoice_payments.",
    { invoiceId, companyId, page, pageSize, query },
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
    "Register a settlement on an invoice: a currency difference, a bank fee or a payment-service fee. WRITE.",
    {
        invoiceId,
        companyId,
        settlement: settlementBody.describe(
            "Settlement type, date and amount in base currency; vatScheme only for paymentServiceFee.",
        ),
    },
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
    "List credit notes (kreditfakturor), 100 per page by default; the response carries totalPages. Filter with query on status, creditDate, dueDate, currency or totalAmount, such as creditDate>=2026-01-01. Use bokio_get_credit_note for one credit note; customer invoices are listed by bokio_list_invoices.",
    { companyId, page, pageSize, query },
    async (a) =>
        okStructured(
            await bokioRequest({ path: `${cbase(a.companyId)}/credit-notes`, query: paging(a) }),
        ),
    listOutput,
);

tool(
    "bokio_get_credit_note",
    "Get one credit note by id, as Bokio returns it. Use bokio_download_credit_note for the PDF.",
    { creditNoteId, companyId },
    async (a) =>
        ok(await bokioRequest({ path: `${cbase(a.companyId)}/credit-notes/${a.creditNoteId}` })),
);

tool(
    "bokio_download_credit_note",
    "Download a published credit note as a PDF file to savePath. Returns the written path and byte count.",
    { creditNoteId, companyId, savePath },
    async (a) =>
        saveDownload(`${cbase(a.companyId)}/credit-notes/${a.creditNoteId}/download`, a.savePath),
);

tool(
    "bokio_create_credit_note",
    "Create a draft credit note that credits an invoice. Edit it with bokio_update_credit_note, then publish it with bokio_publish_credit_note. WRITE.",
    { invoiceId, companyId },
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
    "Update a draft credit note; Bokio rejects updates to published ones. WRITE.",
    {
        creditNoteId,
        companyId,
        creditNote: creditNoteBody.describe(
            "Draft fields; currency, creditDate, dueDate and lineItems are required.",
        ),
    },
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
    "Publish a draft credit note, making it official and immutable. WRITE.",
    { creditNoteId, companyId },
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
    "Record (bokför) a credit note, posting it to the ledger; this cannot be undone through the API. WRITE.",
    { creditNoteId, companyId },
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
    "Delete a draft credit note by id; this cannot be undone. WRITE.",
    { creditNoteId, companyId },
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
    "List suppliers (leverantörer), 100 per page by default; the response carries totalPages. Filter with query on name, orgNumber or vatNumber, such as name~acme. Use bokio_get_supplier for one supplier; their invoices are listed by bokio_list_supplier_invoices.",
    { companyId, page, pageSize, query },
    async (a) =>
        okStructured(
            await bokioRequest({ path: `${cbase(a.companyId)}/suppliers`, query: paging(a) }),
        ),
    listOutput,
);

tool(
    "bokio_get_supplier",
    "Get one supplier by id, as Bokio returns it. Their invoices are listed by bokio_list_supplier_invoices.",
    { supplierId, companyId },
    async (a) =>
        ok(await bokioRequest({ path: `${cbase(a.companyId)}/suppliers/${a.supplierId}` })),
);

tool(
    "bokio_create_supplier",
    "Create a supplier, optionally with bankgiro, plusgiro, bank transfer or international payment details. WRITE.",
    { companyId, supplier: supplierInput },
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
    "Update a supplier by id with a full set of supplier fields. WRITE.",
    { supplierId, companyId, supplier: supplierInput },
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
    "List supplier invoices (leverantörsfakturor), 100 per page by default; the response carries totalPages. Filter with query on supplierRef.id, invoiceNumber, invoiceDate, dueDate or totalAmount, such as dueDate<=2026-06-30. Use bokio_get_supplier_invoice for one invoice and bokio_open_items on account 2440 for unpaid supplier debt by age.",
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
    "Get one supplier invoice by id, as Bokio returns it. An attached file downloads with bokio_download_upload.",
    { supplierInvoiceId, companyId },
    async (a) =>
        ok(
            await bokioRequest({
                path: `${cbase(a.companyId)}/supplier-invoices/${a.supplierInvoiceId}`,
            }),
        ),
);

tool(
    "bokio_create_supplier_invoice",
    "Create a supplier invoice, optionally attached to a file uploaded with bokio_upload_file. WRITE.",
    {
        companyId,
        supplierInvoice: supplierInvoiceBody.describe(
            "Supplier invoice fields; supplierRef.id (from bokio_list_suppliers), invoiceDate, dueDate and totalAmount are required.",
        ),
    },
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
    "Update a supplier invoice by id; line items left out of lineItems are removed. WRITE.",
    {
        supplierInvoiceId,
        companyId,
        // .catchall would still pass uploadRef through; Bokio's update schema has none.
        supplierInvoice: supplierInvoiceBody
            .omit({ uploadRef: true })
            .refine((b) => !("uploadRef" in b), "uploadRef is not accepted on update")
            .describe("All fields to keep; uploadRef is not accepted on update."),
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
    "List bank payments, 100 per page by default; the response carries totalPages. Bokio returns only payments created by this integration, and creating them is not exposed. Filter with query on status, amount, paymentDate or createdDateTime, such as paymentDate>=2026-01-01; bokio_get_bank_payment reads one payment.",
    { companyId, page, pageSize, query },
    async (a) =>
        okStructured(
            await bokioRequest({ path: `${cbase(a.companyId)}/bank-payments`, query: paging(a) }),
        ),
    listOutput,
);

tool(
    "bokio_get_bank_payment",
    "Get one bank payment by id. Bokio returns only payments created by this integration, and creating them is deliberately not exposed.",
    { bankPaymentId, companyId },
    async (a) =>
        ok(await bokioRequest({ path: `${cbase(a.companyId)}/bank-payments/${a.bankPaymentId}` })),
);

// ---- customers -------------------------------------------------------------

tool(
    "bokio_list_customers",
    "List customers in descending customer-number order, 100 per page by default; the response carries totalPages. Filter with query on name, customerNumber, orgNumber or vatNumber, such as name~acme. Use bokio_get_customer for one customer and bokio_list_invoices for their invoices.",
    { companyId, page, pageSize, query },
    async (a) =>
        okStructured(
            await bokioRequest({ path: `${cbase(a.companyId)}/customers`, query: paging(a) }),
        ),
    listOutput,
);

tool(
    "bokio_get_customer",
    "Get one customer by id, as Bokio returns it. Their invoices are listed by bokio_list_invoices.",
    { customerId, companyId },
    async (a) =>
        ok(await bokioRequest({ path: `${cbase(a.companyId)}/customers/${a.customerId}` })),
);

tool(
    "bokio_create_customer",
    "Create a customer, either a company or a private person. WRITE.",
    { companyId, customer: customerInput },
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
    "Update a customer by id with a full set of customer fields. WRITE.",
    { customerId, companyId, customer: customerInput },
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
    "List items (artiklar), the products and services used on invoice lines, 100 per page by default; the response carries totalPages. Filter with query on description, itemType, unitPrice or taxRate, such as description~consulting. Use bokio_get_item for one item.",
    { companyId, page, pageSize, query },
    async (a) =>
        okStructured(await bokioRequest({ path: `${cbase(a.companyId)}/items`, query: paging(a) })),
    listOutput,
);

tool(
    "bokio_get_item",
    "Get one item (artikel) by id, as Bokio returns it.",
    { itemId, companyId },
    async (a) => ok(await bokioRequest({ path: `${cbase(a.companyId)}/items/${a.itemId}` })),
);

tool(
    "bokio_create_item",
    "Create an item (artikel) for invoice lines, with its price, VAT rate and bookkeeping account. WRITE.",
    { companyId, item: itemInput },
    async (a) =>
        ok(
            await bokioRequest({
                method: "POST",
                path: `${cbase(a.companyId)}/items`,
                body: a.item,
            }),
        ),
);

tool(
    "bokio_update_item",
    "Update an item by id with a full set of item fields. WRITE.",
    { itemId, companyId, item: itemInput },
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
    "List uploaded files and receipts (kvitton), 100 per page by default; the response carries totalPages. Filter with query on description or journalEntryId, such as description~receipt. Use bokio_get_upload for one upload and bokio_download_upload for its content.",
    { companyId, page, pageSize, query },
    async (a) =>
        okStructured(
            await bokioRequest({ path: `${cbase(a.companyId)}/uploads`, query: paging(a) }),
        ),
    listOutput,
);

tool(
    "bokio_get_upload",
    "Get one upload's metadata by id. bokio_download_upload fetches the file itself.",
    { uploadId, companyId },
    async (a) => ok(await bokioRequest({ path: `${cbase(a.companyId)}/uploads/${a.uploadId}` })),
);

tool(
    "bokio_upload_file",
    "Upload a local image or PDF, such as a receipt (kvitto), to Bokio, optionally attached to a journal entry. WRITE.",
    {
        companyId,
        filePath: z.string().describe("Absolute path to the file to upload"),
        description: z
            .string()
            .optional()
            .describe("Text shown on the upload in Bokio; defaults to the file name"),
        journalEntryId: z
            .string()
            .optional()
            .describe("Journal entry to attach the file to; id from bokio_list_journal_entries."),
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
    "Download an uploaded file's content to savePath. Returns the written path and byte count; bokio_get_upload returns its metadata.",
    { uploadId, companyId, savePath },
    async (a) => saveDownload(`${cbase(a.companyId)}/uploads/${a.uploadId}/download`, a.savePath),
);

// ---- raw escape hatch ------------------------------------------------------

tool(
    "bokio_raw_get",
    "Send a GET to any Bokio API path that no other tool covers; {companyId} in the path is replaced with the company id. Returns the response body.",
    {
        path: z
            .string()
            .min(1)
            .regex(
                /^[\w\-/{}]*(?:\.[\w\-/{}]+)*\.?$/,
                "path must be an API path such as /companies/{companyId}/tag-groups (letters, digits, / - _ . { }, no ..); put query values in params",
            )
            .describe(
                "API path below /v1, e.g. /companies/{companyId}/tag-groups; query values go in params",
            ),
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
