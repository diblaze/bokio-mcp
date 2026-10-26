# Tasks

## 1. Every parameter described, guarded by the TDQS lint
- [x] 1.1 `pnpm add -D --save-exact mcp-tdqs@0.2.0` (E19). Verify: `package.json` devDependencies holds `"mcp-tdqs": "0.2.0"`, and `pnpm install --frozen-lockfile` is clean.
- [x] 1.2 Write a failing test `test/server.test.ts::tool definitions › lint is clean (Lint reports nothing but shadow candidates)`, which proves scenario "Lint reports nothing but shadow candidates".
  - Import the server dynamically as in E20 and call `listTools()`.
  - Run `lintServer({ serverName: "bokio-mcp", tools: parseToolDefinitions(listed).tools })` (E17).
  - Expect every `report.tools[i].contextSignals.schemaDescriptionCoverage` to be 100.
  - Expect no finding with `severity === "error"`.
  - Expect every `severity === "warning"` finding to have `rule === "shadow-candidate"` (E13, E18).
- [x] 1.3 Write a failing test `test/server.test.ts::tool definitions › id params name their source (Id parameters name the tool that lists them)`, which proves scenario "Id parameters name the tool that lists them".
  - Check every top-level `inputSchema.properties` key matching `/Id$/` other than `companyId`. Its `description` must contain a `bokio_\w+` that is in the listed names.
  - `companyId.description` must contain `BOKIO_COMPANY_ID`.
- [x] 1.4 Write a failing test `test/server.test.ts::tool definitions › savePath says where files land (Save path states where files land)`, which proves scenario "Save path states where files land": every `savePath` description contains `BOKIO_DOWNLOAD_DIR` and `overwrit`.
- [x] 1.5 In `src/index.ts`, describe the shared fragments once (E1–E5, E10, E11). Put `.describe()` last in each chain.
  - Add one id fragment per resource, each naming its list tool and saying an unknown id returns a not-found error: `fiscalYearId`, `journalEntryId`, `invoiceId`, `creditNoteId`, `supplierId`, `supplierInvoiceId`, `bankPaymentId`, `customerId`, `itemId`, `uploadId`.
  - Swap them in at every `xId: idParam` site; upload `journalEntryId` (`:1168`) stays `z.string()` and only gets a description naming bokio_list_journal_entries.
  - Add an `account` fragment (BAS number, see `bokio_chart_of_accounts`).
  - Add `from`/`to` fragments from `isoDay` (inclusive, YYYY-MM-DD). The journal-entry `from`/`to` (`:611`) stay `z.string()` and get the same descriptions, so no input that worked before is rejected.
  - Add a `savePath` fragment, required or optional (`:336`, `:792`, `:864`, `:1185`). It says the path is relative to BOKIO_DOWNLOAD_DIR, else the working directory, and that existing files are never overwritten (E5).
  - Describe the remaining one-off parameters inline: `date`, `accounts`, `windowDays`, `toleranceDays`, `rows`, `groupBy`, `asOf`, `lookbackYears`, write bodies (`invoice`, `creditNote`, `settlement`, `supplier`, `supplierInvoice`, `customer`, `item`), journal `title`/`date`/`journalEntryNumber`/`items`, `sumBaseCurrency`, `bookkeepingAccountNumber`, upload `description`, and `raw_get` `path`/`params`.
  - Verify: 1.2–1.4 pass with `pnpm exec vitest run test/server.test.ts`.
- [x] 1.6 Docs:
  - `AGENTS.md` Key Files row for `test/server.test.ts` adds "TDQS lint over all tools"; the `:95` dev deps line adds `mcp-tdqs` (pinned) (E23).
  - `test/AGENTS.md` gets the same `server.test.ts` row note.
  - `CONTRIBUTING.md:28` adds "describe every parameter; shared facts go in the zod fragment".
  - `CONTRIBUTING.md` adds manual commands:
    - `pnpm exec tdqs lint --command "env BOKIO_ALLOW_WRITES=1 node dist/index.js" --format markdown`, because the env is not inherited (E16).
    - An optional `tdqs score`, which needs `TDQS_BASE_URL`/`TDQS_API_KEY`/`TDQS_MODEL`, is nondeterministic and costs money.
  - Verify: `rg -n "mcp-tdqs|tdqs lint" AGENTS.md test/AGENTS.md CONTRIBUTING.md` prints lines.

## 2. Short, plain tool descriptions
- [ ] 2.1 Write a failing test `test/server.test.ts::tool definitions › descriptions are short and plain (Descriptions stay short and plain)`, which proves scenario "Descriptions stay short and plain".
  - For every listed tool, `description.replace("WRITE.", "")` has ≤ 3 matches of `/[.!?](\s|$)/g`.
  - No description matches `/\b(IMPORTANT|MUST|NEVER|ALWAYS|NOTE)\b/`.
  - `readOnlyHint === false` implies `description` includes `WRITE.` (E8).
- [ ] 2.2 In `src/index.ts`, rewrite every `tool()` description inline (E6, E7, E24). Each one is 1–3 plain sentences:
  - (a) verb + resource + scope, telling it apart from siblings.
  - (b) when to use a sibling instead, for example list vs get vs computed tools, `bokio_download_sie` (raw file) vs computed tools (figures), and `bokio_list_journal_entries` vs `bokio_account_ledger`.
  - (c) the return value in a phrase when there is no output schema. Downloads return "Wrote N bytes to <path>"; the SIE preview returns the first 4,000 characters.
  - Also include behaviour annotations cannot carry: drafts only, or the line-item removal.
  - Leave out facts already in the fragments, the schema or the annotations (E15). Avoid "e.g.".
  - Move single-parameter facts into that parameter's `.describe()`, such as reconcile's two-decimal and outflow-negative rules into `rows`.
  - Keep `WRITE.` and `SIGN` (E24).
  - Verify: 2.1 and group 1 tests pass, and `test/readonly.test.ts` passes.
- [ ] 2.3 In `AGENTS.md` › "Adding or changing a tool" (`:60`), add a bullet: descriptions are 1–3 plain sentences inline, the first sentence says what the tool does, no shouting words, and shared parameter facts live in the zod fragment `.describe()`. README stays a list of names (E22). Verify: `rg -n "1–3 plain sentences" AGENTS.md`.

## 3. Check
- [ ] 3.1 `pnpm exec biome ci && pnpm run typecheck && pnpm test && pnpm run build && pnpm run smoke && pnpm run pack:check && pnpm exec tdqs lint --command "env BOKIO_ALLOW_WRITES=1 node dist/index.js"`
