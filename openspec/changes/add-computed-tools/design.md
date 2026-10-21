# Design

## Context
- E1 `src/index.ts:59-94` — `function tool(name, description, shape, handler, outputShape?)`; `const isWrite = description.includes("WRITE.")`; read tools get `{ readOnlyHint: true, openWorldHint: true }`; `outputSchema: outputShape` when given — computed tools register through it, omit `WRITE.`, pass an output shape.
- E2 `src/index.ts:42-49` — `function okStructured(data)` sets `structuredContent` for object results — the return path for every computed tool.
- E3 `src/index.ts:311-321` — `bokio_download_sie`: `const buf = await bokioDownload(path); return ok(buf.toString("latin1").slice(0, 4000));` — today's only SIE access: guessed Latin-1, no parsing, 4,000-char preview.
- E4 `src/bokio.ts:157-170` — `export async function bokioDownload(path, query): Promise<Buffer>` — binary GET, no write gate; the parser's input.
- E5 `src/index.ts:274-280` — `bokio_list_fiscal_years` → `${cbase(a.companyId)}/fiscal-years` with `listOutput` — the date → fiscal-year-id lookup already exists as a request.
- E6 `src/index.ts:96-99`, `:256` — `const idParam = z.string().regex(ID_PATTERN, …)`, `const companyId = idParam.optional()…`, `const cbase = (cid?) => \`/companies/${resolveCompanyId(cid)}\`` — reused for `fiscalYearId` and `companyId` inputs.
- E7 `test/server.test.ts:17` — `expect(tools.length).toBe(53);` — count assertion to bump.
- E8 `scripts/smoke.mjs:74-82` — `const required = ["bokio_company_info", … "bokio_list_bank_payments"];` — read-tool presence list.
- E9 `test/readonly.test.ts:16-19` — `expect(t.description).not.toContain("WRITE."); expect(t.annotations?.readOnlyHint).toBe(true);` for every tool with writes off — covers computed tools automatically once registered.
- E10 `README.md:56-78` — Tools section, blocks `**Meta:** … \`bokio_download_sie\`` through `**Escape hatch:**`; `README.md:82` — "SIE download is handy for reconciling the ledger against another system."
- E11 `CHANGELOG.md:5` — `## 0.2.0 — unreleased`; `package.json:3` — `"version": "0.2.0"`; PR #7 (`feat/prepare-external-release` → `main`) is OPEN; this branch is based on it.
- E12 `AGENTS.md:7` — "registers all 53 tools"; `AGENTS.md:62` — "`expect(tools.length).toBe(53)`"; `src/AGENTS.md:13`, `test/AGENTS.md:14` — same count; `src/AGENTS.md` Key Files table lists only `index.ts`, `bokio.ts`.
- E13 Bokio OpenAPI `company-api.yaml@v1` (fetched 2026-10-21) — path list has no balance, report or bank-transaction endpoint; `GET /companies/{companyId}/chart-of-accounts/{account}` → `accountBalance: "The current balance of the account", nullable: true` — current value only, no date parameter.
- E14 Same spec — `GET /companies/{companyId}/sie/{fiscalYearId}/download` → `application/octet-stream`, scope `sie:read`; `fiscalYear` schema `required: [id, startDate, endDate, accountingMethod]`, `status: open | closed`.
- E15 Same spec — `GET /journal-entries`: `pageSize … default: 25, maximum: 100`; filter fields `title, journalEntryNumber, date, …` — the paged alternative costs ⌈N/100⌉ requests per range.
- E16 Same spec — `supplierInvoiceGet.remainingAmount`, `invoice.paidAmount`/`status` — module-based open items exist only for documents created in Bokio's invoice modules, not for revenue booked as manual journal entries.
- E17 Node v22.22.3 (`node -e 'new TextDecoder("ibm437")'`) → `The "ibm437" encoding is not supported` — CP437 needs a 128-entry high-byte table; `latin1` and `utf-8` are built in.
- E18 SIE 4 format (sie.se, "SIE 4" specification) — `#FORMAT PC8`; `#RAR årsnr start slut`; `#KONTO nr "namn"`; `#IB årsnr konto saldo`, `#UB årsnr konto saldo` (balance accounts only); `#VER serie vernr verdatum "text" [regdatum]` followed by `{ … }` of `#TRANS konto {objekt} belopp [transdatum] ["text"]`; amounts use a decimal point, debit positive, credit negative; strings quoted with `"`, inner quotes escaped `\"`.
- E19 `src/bokio.ts:91`, `:95` — "monthly quota (5,000 requests per company)", "rate limited (200 requests per 60 s)".
- E20 `CONTRIBUTING.md:30` — "Never put real accounting data, company ids, org numbers or tokens in code, tests or issues."
- E21 `test/AGENTS.md:19` — "No live Bokio calls in tests — everything is mocked or in-memory."
- E23 Live Bokio SIE download (owner, 2026-10-21, not committed) — header `#FLAGGA 0`, `#PROGRAM "Bokio" 1.0`, `#FORMAT PC8` (å/ä/ö decode correctly as CP437), `#SIETYP 4`, `#KPTYP BAS2014`, CRLF line endings; `#RAR 0` … `#RAR -4` with `#IB`/`#UB`/`#RES` per year index (open year also has `#UB 0`); `#VER "V" "<n>" <yyyymmdd> "<text>" <regdate>` then tab-indented `#TRANS <acct> {} <amount>` with no date and no text; voided verifications stay in the file and get a separate reversal verification on the same date, text `Annullering av V<n>: <original text>`, registered later.
- E22 `biome.json` — `"includes": ["src/**", "test/**", "scripts/**"]`, 4-space, 100 cols — a fixture under `test/` must be a `.ts`/string, or sit in a non-linted extension.

## Goals / Non-Goals
**Goals:**
- Seven deterministic read-only tools whose arithmetic is done in code, in öre, with output schemas (E1, E2).
- One shared SIE parser; one export download per fiscal year touched (E4, E14).
- No real data anywhere in the repo (E20, E21).

**Non-Goals:**
- Tax-return box (rutor) mapping in `bokio_vat_summary` — reopen when Skatteverket's box ↔ account mapping is pinned down and tested against a filed return.
- In-process SIE cache — reopen when a 403 `quota-exceeded` is observed or a session makes more than ~100 computed calls; today each call costs ≤ 1 + years requests against 5,000/month (E19).
- CSV text input for `bokio_reconcile_bank` — reopen when a client cannot turn a statement into `{date, amount, text}` rows; bank CSV layouts differ per bank and a wrong column guess is a silent error.
- Partial or many-to-one matching in `bokio_open_items` and `bokio_reconcile_bank` — reopen when unmatched partial payments appear more than occasionally.
- Module-based open items from `/invoices` and `/supplier-invoices` (E16) — reopen when a user needs customer names or due dates; the ledger method covers manual journal entries, which module data cannot.
- Cross-checking against `accountBalance` (E13) — reopen when a computed balance disagrees with Bokio's UI.

## Decisions
- Source is the SIE export, not paged journal entries — one request per fiscal year versus ⌈N/100⌉, and SIE carries `#IB` so balances need no replay from company start (E14, E15, E18). Journal paging lost on quota.
- Fiscal year resolution: `fiscalYearId` given → download only; else `GET /fiscal-years` once, pick years overlapping the request, download each, sort by start (E5, E14). `#RAR` in the export supplies the year's own range, so default dates need no extra request.
- Money: parse `"-1234.56"` → öre integer by string split (sign, integer part, fraction padded to two digits); sum as integers; output `ore / 100` once at the edge. Caller-supplied bank amounts become öre via `Math.round(amount * 100)`. No decimal library (E17 shows only built-ins; a dependency lost on size).
- Encoding: honour `#FORMAT PC8` with a 128-char CP437 high-byte table (confirmed, E23), UTF-8 when the buffer starts with a BOM, else Latin-1 (E17, E18). Replaces the Latin-1 guess in E3 for the new tools; `bokio_download_sie` preview is left unchanged.
- Parser follows the live file (E23): split on `\r?\n`, trim tabs; `#TRANS acct {} amount` — every line takes its `#VER` date, text comes from the `#VER`; only `#IB 0`/`#UB 0` are kept, `#RAR 0` is the fiscal year's range, other indices and `#RES` are skipped.
- Annulments (E23): a verification whose text matches `^Annullering av (\S+):` and whose lines are the exact negation of the named verification marks both `cancelled`. Duplicates, reconcile and open items skip cancelled lines; the ledger keeps them with `cancelled: true`; balances need no special case (they net). Negation check guards against a text-only false positive.
- Sign convention: every amount is in ledger sign (debit positive, credit negative) — the same as Bokio's API and UI; only the derived totals (`outputVat`, `inputVat`, `netVat`, `result`) are negated so that "owed" and "profit" read positive. One rule, stated in each description.
- Files: `src/sie.ts` holds parser and pure computations (`parseSie`, `balancesAt`, `ledger`, `reconcile`, `duplicates`, `vatSummary`, `openItems`, `profitAndLoss`); registration and the fiscal-year loader stay in `src/index.ts` because `tool()` is not exported (E1). Two source files beat a module per tool.
- Tie-breaks are fixed: ledger lines sort by date, series, number, line index; reconcile picks smallest |Δdays|, then earliest ledger date, then lowest number; duplicate groups sort by account, amount, first date. Same input → same output.
- Open items: FIFO on exact amount per account; default `account` 1510, `lookbackYears` 1 so a December posting paid in January pairs; the oldest loaded `#IB` is reported as `openingUnitemised` (E18).
- Duplicate window default 7 days: catches a same-week double booking, misses a recurring monthly charge.
- Version 0.3.0 with its own changelog section (E11): new tools are a minor bump; PR #7 stays reviewable as 0.2.0. If 0.2.0 never ships, the owner folds the two sections at release.
- Test fixture: a synthetic SIE string built in `test/sie.test.ts` mirroring E23's shape (CRLF, `#RAR 0` and `#RAR -1`, `#IB`/`#UB` for both indices, `#VER "V" "<n>" … <regdate>`, tab-indented `#TRANS acct {} amount`, one `Annullering av V<n>:` pair) with invented accounts, numbers and amounts; the PC8 case builds a `Buffer` with one CP437 byte inline (E20, E22).

## Risks / Trade-offs
- Annulment detection depends on Bokio's marker text `Annullering av` (E23); a changed wording leaves both verifications live, which the duplicate tool would then flag as a pair — visible, not silent.
- Reconciliation and open-item matching on exact amount only: fees, rounding and partial payments surface as unmatched on both sides — by design, the tool reports, the user judges.
- A full-year SIE for a busy company can be several MB; parsing is linear and in memory. Acceptable for the target users (small companies, E19 quota already bounds scale).
- `today` as the default date depends on the server clock; `date` can always be passed explicitly.

## Open Questions
1. Keep version 0.3.0 with a separate changelog section, or fold into the unmerged 0.2.0 (E11)? Default: 0.3.0.
