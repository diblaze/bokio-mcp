# Design
## Context
- E1 `AGENTS.md:67` — "Descriptions are 1–3 plain sentences … Shared parameter facts (id source, `companyId` fallback, `savePath` folder) live once in the zod fragment `.describe()`" — the rule this change relaxes.
- E2 `CONTRIBUTING.md:28` — "shared facts go in the zod fragment (`companyId`, the resource ids, `savePath`), not in each tool." — same rule, contributor copy.
- E3 `openspec/specs/tool-definitions/spec.md:19` — "at most three sentences, not counting the `WRITE.` marker" — requirement being modified.
- E4 `test/server.test.ts:763-771` — `expect(sentences.length, …).toBeLessThanOrEqual(3)` — the test to widen; no length check exists.
- E5 `test/server.test.ts:729-742` — `lintServer(...)`, fails on errors and non-shadow warnings. mcp-tdqs 0.2.0 rules are structural only (`no-description`, `tautological-description`, `undocumented-parameters`, `missing-annotations`, `no-output-schema`, `shadow-candidate`, `node_modules/mcp-tdqs/dist/scoreServer-CQ4Wi4Nw.js`); content rules need our own assertions.
- E6 `node_modules/mcp-tdqs/dist/scoreServer-CQ4Wi4Nw.js:425-430` — Parameter Semantics `3: "baseline when schema description coverage is above 80%, even if the description says nothing about parameters"`; `:395-399` Usage `5: "explicit when / when-not / named alternatives"`.
- E7 Glama scan `/mnt/black/tmp/claude/claude-1000/-home-denis-git-bokio-mcp/0cbaa236-c5f1-4929-b165-f14de73ac6f6/scratchpad/glama2.txt` (2026-10-29, 37 read tools) — Parameters 3 on 33 tools, e.g. `bokio_account_balances`: "The description adds nothing about parameters beyond what the schema already says"; `bokio_chart_of_accounts`: "it never mentions that the list can be filtered via the query parameter"; list tools Behavior 3: "says nothing about pagination defaults, ordering". The four Par 4 tools (`download_sie`, `find_duplicates`, `reconcile_bank`, `profit_and_loss`) state a parameter interaction in the description.
- E8 Glama scan — Naming Consistency 4/5: "A few tools are noun phrases without a verb (company_info, chart_of_accounts, account_balances, vat_summary, profit_and_loss)"; Tool Count 2/5 "At 37 tools"; Completeness 3/5 "lacks create/update/delete" (writes hidden).
- E9 `src/index.ts:91` — `const isWrite = description.includes("WRITE.");` — marker stays.
- E10 `src/index.ts:312-314` — `pageSize: args.pageSize ?? 100` — the 100 default the list descriptions will promise; unspecified today (`openspec/specs/bokio-tool-surface/spec.md:84-90` only bounds it).
- E11 `company-api.yaml` = bokio/bokio-api branch `v1` `api-specification/company-api.yaml`, fetched to `/mnt/black/tmp/claude/claude-1000/-home-denis-git-bokio-mcp/0cbaa236-c5f1-4929-b165-f14de73ac6f6/scratchpad/bokio-api/company-api.yaml`; `company-api.yaml:1455-1458` (bokio/bokio-api `v1`) — Bokio's own `default: 25`, `maximum: 100`; `:6934` `pagedResponse` carries `totalItems`, `totalPages`, `currentPage`.
- E12 `src/index.ts:341` — `bokio_list_fiscal_years` passes no `pageSize`, so Bokio returns at most 25 years (E11); `:347` "bokio_list_fiscal_years returns all of them in one call" overstates it.
- E13 `company-api.yaml` query field tables — invoices `:1629` (invoiceDate, dueDate, status, totalAmount, currency…), credit-notes `:594`, customers `:1208` (name, customerNumber, orgNumber…), journal-entries `:3721` (title, journalEntryNumber, date…), supplier-invoices `:4739`, suppliers `:6145`, items `:3379`, uploads `:6758` (description, journalEntryId), bank-payments `:168`, chart-of-accounts `:409` (account, name, accountType), payments/settlements `:2564`/`:3057` (date, sumBaseCurrency). Examples use `==`, `>`, `~`, `&&` (e.g. `:3736` `title~invoice 1234`).
- E14 `company-api.yaml:404` — "Retrieves the complete chart of accounts" — unpaged; `:1187` customers "returned in descending customer-number order".
- E15 `src/index.ts:697-702` + `src/bokio.ts:32-37` — journal `from`/`to` become `date>=`/`date<=` joined to `query` with `&&` — an interaction worth one clause.
- E16 `src/index.ts:436-450` — balances `date` defaults to the fiscal year's last day with `fiscalYearId`, else today (schema only); `:660-673` open items load `lookbackYears` calendar years before `asOf`.
- E17 `company-api.yaml:2297` "Invoice is not in a published status" (400), `:1054` same for credit notes — draft downloads fail; `src/bokio.ts:191` passes the error through.
- E18 `src/bokio.ts:116-117` — 404 hint " — not found; verify the id (list the collection first)"; `src/index.ts:122-123` `idFrom` already says it per id parameter.
- E19 `src/bokio.ts:176-180` — writes return Bokio's JSON body, or the raw text (empty on 204) — what write descriptions may claim.
- E20 `src/index.ts:537` — `bokio_reconcile_bank` is 423 characters (Glama Conciseness 4, "slightly run-on"); `:429` `SIGN` sentence shared by seven computed tools.
- E21 Current totals (regex over `src/index.ts` descriptions, `SIGN` expanded): read 6,094, write 2,265, total 8,359 characters; longest 423.
- E22 Tools naming no sibling today: read `company_info`, `download_sie`, `reconcile_bank`, `vat_summary`, `open_items`, `download_credit_note`, `list_bank_payments`, `get_bank_payment`, `get_item`, `raw_get`, plus 19 write tools.
- E23 `src/index.ts:38-46` — INSTRUCTIONS already carry ledger sign, cost and gaps; unchanged.

## Goals / Non-Goals
**Goals:**
- Every read tool at Purpose, Usage and Behavior 5 and Parameters ≥ 4 on Glama's next scan, without Conciseness dropping below 5.
- Deterministic guards for what can be checked: budget, named alternative, list paging/filter, stated result.

**Non-Goals:**
- Renaming `bokio_chart_of_accounts`, `bokio_profit_and_loss`, `bokio_account_balances`, `bokio_company_info`, `bokio_vat_summary` to verb_noun (E8) — breaks every saved prompt and client allow-list for one point on one server dimension; reopen at a 1.0 breaking release.
- Tool Count (E8) and showing writes by default — owner decision; reopen if the owner changes the read-only default.
- Paging on `bokio_list_fiscal_years` (E12) — reopen when a company has more than 25 fiscal years.
- `.describe()` on output schema fields (`listOutput`, computed outputs) — reopen when a rescore shows Completeness < 4 on a tool with an output schema.
- `tdqs score` in CI — paid, nondeterministic; reopen never for CI, manual run per Open Questions.
- INSTRUCTIONS and README changes (E23).

## Decisions
- Four sentences, 400 characters per description, 14,000 total — the char cap is the real token control (~3.5k tokens writes-on, +67% over E21); four sentences lets a get tool say what, alternative, result and one behaviour without semicolon chains. Lost: keeping three (forces run-ons like E20). E3, E4, E21.
- Per-tool parameter facts go in the description (filter fields, defaults that depend on another parameter, `from`/`to` with `query`); shared facts (id source, not-found, `companyId`, `savePath`) stay in fragments only. Why: the grader gives Parameters > 3 only for description content (E6, E7), while repeating shared facts costs tokens on 60 tools for no extra meaning. Lost: copying not-found into every get description (E18). E1, E2.
- List descriptions: one clause each for page size and `totalPages` (E10, E11), the 3–5 most useful filter fields from the OpenAPI table plus one example condition (E13), ordering only where Bokio documents it (E14). Lost: full field lists (token cost).
- Get/download/raw/company descriptions: name the 3–5 key fields of Bokio's object (from OpenAPI schemas, e.g. supplier invoice `remainingAmount`, `company-api.yaml:8877`), the list tool for ids, and for downloads that drafts fail (E17).
- Computed descriptions: keep `SIGN` (E20), add the date default/interplay sentence (E16), name the sibling for the neighbouring question (reconcile → `bokio_find_duplicates`, vat → `bokio_profit_and_loss`, open items → `bokio_account_ledger`). Trim reconcile under 400 by moving matching detail to `toleranceDays`/`rows` describes only where it is single-parameter.
- Write tools get the same rules (E22, E19) in their own slice — tests run writes-on, and one rule set is simpler than two. Claims about write results stay at "returns Bokio's response" unless the OpenAPI response schema names the object.
- Guards are plain assertions in `test/server.test.ts` over `listTools()`, scoped by `query`/`outputSchema`/`readOnlyHint`, because mcp-tdqs cannot check content (E5). Each slice widens the alternative-name scope, so each group passes alone.
- Fix the false "returns all of them in one call" (E12) while rewriting `bokio_get_fiscal_year`.

## Risks / Trade-offs
- Glama's grader is a model and varies between scans; the deterministic tests prove structure, not the score. 5/5 on every dimension is not guaranteed; Parameters 5 may need more than 400 characters allow.
- Longer descriptions cost every client tokens on every session; capped by the budget test.
- Filter fields come from Bokio's OpenAPI and may drift; a wrong field only yields Bokio's 400 "Invalid query filter" (`company-api.yaml:198`), never wrong data.

## Open Questions
- None. Owner decided (2026-10-30): acceptance is Glama's rescan after release (no paid `tdqs score`), and group 5 (write tools) stays in this change.
