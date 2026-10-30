# Tasks

## 1. Description budget and contributor rule
- [x] 1.1 Widen `test/server.test.ts::tool definitions › descriptions are short and plain (Descriptions stay short and plain)` (E4): ≤ 4 sentence ends, `description.replace("WRITE.", "").trim().length <= 400`, sum of all listed description lengths ≤ 14,000; keep shouting-word and `WRITE.` checks. Proves scenario "Descriptions stay short and plain"; fails today on `bokio_reconcile_bank` (423, E20).
- [x] 1.2 Trim `bokio_reconcile_bank` in `src/index.ts:537` under 400 characters without losing a fact (E20); verify: 1.1 passes.
- [x] 1.3 `AGENTS.md:67` and `CONTRIBUTING.md:28`: "1–4 plain sentences, at most 400 characters"; shared facts stay in the fragment, a parameter fact specific to one tool (filter fields, defaults that depend on another parameter) goes in the description; descriptions name the alternative tool and, without an output schema, what comes back (E1, E2). Verify: `rg -n "400 characters" AGENTS.md CONTRIBUTING.md` prints two lines.

## 2. List tools state paging, filters and alternatives
- [x] 2.1 Test `test/server.test.ts::input bounds › default page size is 100 (List call without pageSize asks for 100)`: stub `fetch`, call `bokio_list_invoices` with no args, assert the URL has `pageSize=100`. Proves scenario "List call without pageSize asks for 100" (characterises E10; passes on first run).
- [x] 2.2 Failing test `test/server.test.ts::tool definitions › list tools state paging and filters (List descriptions state paging and filter syntax)`: tools with a `query` input mention `query` and match `/==|>=|<=|~/`; those also taking `page` match `/\b100\b/`. Proves scenario "List descriptions state paging and filter syntax".
- [x] 2.3 Failing test `test/server.test.ts::tool definitions › list tools name an alternative (List tools name an alternative)`: every tool with a `query` input names a listed `bokio_*` other than itself. Proves scenario "List tools name an alternative".
- [x] 2.4 Rewrite the 12 `query` tools in `src/index.ts` (`chart_of_accounts`, `list_journal_entries`, `list_invoices`, `list_invoice_payments`, `list_invoice_settlements`, `list_credit_notes`, `list_suppliers`, `list_supplier_invoices`, `list_bank_payments`, `list_customers`, `list_items`, `list_uploads`): 100 per page and `totalPages` (E10, E11); 3–5 filter fields from that endpoint's OpenAPI table plus one example condition (E13); journal `from`/`to` are ANDed with `query` (E15); chart is complete and unpaged, customers ordered by descending customer number (E14); name the get/sibling tool. Verify: 2.2, 2.3, 1.1 pass.

## 3. Computed and fiscal-year tools
- [x] 3.1 Failing test `test/server.test.ts::tool definitions › result-schema tools name an alternative (Tools with a result schema name an alternative)`: every read tool with an `outputSchema` names another listed `bokio_*`. Proves scenario "Tools with a result schema name an alternative".
- [x] 3.2 Rewrite the 7 computed tools and `bokio_list_fiscal_years` in `src/index.ts:337-343` and `:431-685`: keep `SIGN`; add per-tool defaults and interplay (balances `date` vs `fiscalYearId`, open items `lookbackYears` vs `asOf`, E16); name the sibling (reconcile → `bokio_find_duplicates`, vat → `bokio_profit_and_loss`, open items → `bokio_account_ledger`); fiscal years: at most 25 years per call, ids feed `bokio_get_fiscal_year`/`bokio_download_sie` (E12). Verify: 3.1, 1.1 pass.

## 4. Single-record, download and raw tools
- [x] 4.1 Failing test `test/server.test.ts::tool definitions › read tools name an alternative (Every read tool names an alternative)`: every `readOnlyHint` true tool names another listed `bokio_*`. Proves scenario "Every read tool names an alternative".
- [x] 4.2 Failing test `test/server.test.ts::tool definitions › schemaless read tools state their result (Read tools without an output schema state their result)`: every read tool without `outputSchema` matches `/return/i`. Proves scenario "Read tools without an output schema state their result".
- [x] 4.3 Rewrite `company_info`, the 11 `get_*`, 4 `download_*` and `raw_get` in `src/index.ts`: what comes back with 3–5 key fields from the OpenAPI schema (E13 schemas, `company-api.yaml:8877`), the list tool for ids, drafts fail on PDF downloads (E17), raw_get returns Bokio's body and names `bokio_list_*` tools to prefer; fix `bokio_get_fiscal_year` "all of them" (E12). Do not repeat not-found or `savePath` facts (E18). Verify: 4.1, 4.2, 1.1 pass.

## 5. Write tools
- [x] 5.1 Failing test `test/server.test.ts::tool definitions › write tools name the next tool (Write tools name the next or alternative tool)`: every `readOnlyHint` false tool names another listed `bokio_*`. Proves scenario "Write tools name the next or alternative tool".
- [x] 5.2 Failing test `test/server.test.ts::tool definitions › write tools state their result (Write tools state their result)`: every `readOnlyHint` false tool matches `/return/i`. Proves scenario "Write tools state their result".
- [x] 5.3 Rewrite the 23 write tools in `src/index.ts:722-1319`: keep `WRITE.` (E9) and draft/undo facts; name the follow-up or read tool (E22); result as Bokio's response, or the named object only where the OpenAPI response schema shows it (E19). Verify: 5.1, 5.2, 1.1 pass and `test/readonly.test.ts` passes.

## 6. Check
- [x] 6.1 `pnpm exec biome ci && pnpm run typecheck && pnpm test && pnpm run build && pnpm run smoke && pnpm run pack:check`
