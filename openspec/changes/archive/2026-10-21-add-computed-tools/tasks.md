# Tasks

## 1. SIE parser, balances and ledger
- [x] 1.1 Failing test `test/sie.test.ts::decodes PC8 account names` proves scenario "PC8 text decoded" (Buffer with `#FORMAT PC8` and a CP437 byte in a `#KONTO` name)
- [x] 1.2 Failing test `test/sie.test.ts::lines take the verification date` proves scenario "Lines take the verification date" (fixture `#TRANS` lines have no date, E23)
- [x] 1.2b Failing test `test/sie.test.ts::uses year index 0 only` proves scenario "Only year index 0 balances are used" (fixture has `#RAR -1` + `#IB -1` with a different value)
- [x] 1.2c Failing test `test/sie.test.ts::annulment nets to zero and is flagged` proves scenario "Annulment pair nets to zero in balances and is flagged in the ledger"
- [x] 1.3 Failing test `test/sie.test.ts::rejects an export without #RAR` proves scenario "Malformed export is rejected" (error message contains `#RAR`)
- [x] 1.4 Failing test `test/sie.test.ts::sums öre exactly` proves scenario "Sum of many öre amounts is exact" (0.10 + 0.10 + 0.10 + 0.70 → `1`, not `0.9999999999999999`)
- [x] 1.5 Failing test `test/sie.test.ts::balance at a mid-year date` proves scenario "Balance at a mid-year date equals opening plus movements to date"
- [x] 1.6 Failing test `test/sie.test.ts::balance at year end equals #UB` proves scenario "Balance at fiscal year end equals the closing balance in the export"
- [x] 1.7 Failing test `test/sie.test.ts::accounts filter` proves scenario "Accounts filter limits output and keeps order" (`[2440, 1930]` → rows 1930, 2440)
- [x] 1.8 Failing test `test/sie.test.ts::ledger order and running balance` proves scenario "Ledger lines carry running balance in deterministic order"
- [x] 1.9 Failing test `test/server.test.ts::computed tools are read-only` proves scenario "Computed tools are listed as read-only" (writes off via `test/readonly.test.ts` pattern E9: the seven names present, `readOnlyHint === true`)
- [x] 1.10 Failing test `test/server.test.ts::balances make one listing and one download` proves scenario "One export request per fiscal year" (mock `fetch`: first call `/fiscal-years`, second `/sie/<id>/download`, `f.mock.calls.length === 2`)
- [x] 1.11 Failing test `test/server.test.ts::fiscalYearId skips the listing` proves scenario "Export fetched by fiscal year id without a listing" (`f.mock.calls.length === 1`, URL ends `/sie/fy1/download`)
- [x] 1.12 Failing test `test/server.test.ts::date outside fiscal years errors before download` proves scenario "Date outside every fiscal year is rejected" (listing returns years not covering the date; `isError`, text names the ranges, only one fetch call)
- [x] 1.13 Failing test `test/server.test.ts::ledger across two fiscal years` proves scenario "Range spanning two fiscal years downloads both" (two `/sie/` downloads, lines from both, running balance continuous)
- [x] 1.14 Failing test `test/server.test.ts::ledger rejects from after to` proves scenario "From after to is rejected" (`isError`, `fetch` not called)
- [x] 1.15 `src/sie.ts` (new): `toOre(text)`, `fromOre(n)`, `decodeSie(buf)` (BOM → utf-8, `#FORMAT PC8` → 128-char CP437 table, else latin1), `parseSie(buf)` splitting on `\r?\n` and trimming tabs → `{ from, to, accounts: Map, ib: Map, ub: Map, vers: [{series, number, date, text, cancelled, lines: [{account, amount}]}] }` keeping only `#RAR 0`/`#IB 0`/`#UB 0`, lines dated by their `#VER`, throw `SIE export has no #RAR line` (E17, E18, E23); `markAnnulments(vers)` (text `^Annullering av (\S+):` + exact negated lines → both `cancelled`); `balancesAt(sies, date, accounts?)`, `ledger(sies, account, from, to)` emitting `cancelled` per line; verify: 1.1–1.8 pass
- [x] 1.16 `src/index.ts`: `loadYears(cid, {fiscalYearId} | {from, to})` → `GET /fiscal-years` via `bokioRequest` unless id given (E5), filter overlap, `bokioDownload` each (E4), `parseSie`, sort by start, throw naming covered ranges when none; register `bokio_account_balances` (`{ companyId, date?, fiscalYearId?, accounts?: int[] }` → `{ date, balances: [{account, name, opening, movement, balance}] }`) and `bokio_account_ledger` (`{ companyId, account, from, to }` → `{ account, name, from, to, opening, closing, lines: [{date, series, number, text, amount, balance, cancelled}] }`) through `tool()` with output shapes (E1, E2, E6); description states ledger sign; verify: 1.9–1.14 pass
- [x] 1.17 `test/server.test.ts:17` count 53 → 55 (E7); `package.json` version `0.3.0`; `CHANGELOG.md` new `## 0.3.0 — unreleased` / `### Added` with the two tools (E11); `README.md` Tools: new `**Computed (read-only, from the SIE export):**` block listing both, Notes line on ledger sign (E10); `AGENTS.md`, `src/AGENTS.md`, `test/AGENTS.md`: counts → 55, add `src/sie.ts` and `test/sie.test.ts` rows (E12); verify: `pnpm exec biome ci && pnpm run typecheck && pnpm test`

## 2. Duplicates and bank reconciliation
- [x] 2.1 Failing test `test/sie.test.ts::groups same amount within window` proves scenario "Same amount on the same account within the window is grouped"
- [x] 2.2 Failing test `test/sie.test.ts::one verification is not its own duplicate` proves scenario "Lines of one verification are not duplicates of each other"
- [x] 2.3 Failing test `test/sie.test.ts::equal amounts outside the window` proves scenario "Equal amounts outside the window are not grouped"
- [x] 2.4 Failing test `test/sie.test.ts::reconcile takes the earliest reachable line` proves scenario "Exact amount within tolerance matches the earliest reachable line"
- [x] 2.5 Failing test `test/sie.test.ts::reconcile tie goes to the earlier line` proves scenario "Tie on date distance resolves to the earliest ledger line"
- [x] 2.6 Failing test `test/sie.test.ts::reconcile matches a ledger line once` proves scenario "A ledger line is matched at most once"
- [x] 2.7 Failing test `test/sie.test.ts::reconcile reports unmatched and difference` proves scenario "Unmatched rows on both sides and net difference are reported" (`difference === ledgerTotal - bankTotal`)
- [x] 2.8 Failing test `test/sie.test.ts::reconcile flags suspected duplicates` proves scenario "Suspected duplicate ledger lines are flagged"
- [x] 2.8b Failing test `test/sie.test.ts::annulled pairs skip matching` proves scenario "Annulled pairs are excluded from duplicate and reconciliation matching"
- [x] 2.9 Failing test `test/server.test.ts::reconcile rejects empty rows` proves scenario "Empty bank rows are rejected" (`rows: []` → `isError`, `fetch` not called)
- [x] 2.10 `src/sie.ts`: `duplicates(sies, from, to, windowDays, account?)` (group by account+amount, skip 0, cluster by consecutive date gap ≤ window, keep clusters with ≥ 2 distinct verifications, sort account/amount/first date); both skip `cancelled` lines; `reconcile(lines, rows, toleranceDays)` (rows sorted date/amount/text; rows in date order; candidates = unmatched same-öre lines with |Δdays| ≤ tol; pick the earliest date, then lowest number; `suspectedDuplicates` = unmatched lines with same amount within tol of a matched line); verify: 2.1–2.8 pass
- [x] 2.11 `src/index.ts`: register `bokio_find_duplicates` (`{ companyId, from, to, account?, windowDays = 7 (0–90) }` → `{ groups: [{account, amount, lines: [{date, series, number, text}]}] }`) and `bokio_reconcile_bank` (`{ companyId, account = 1930, toleranceDays = 3 (0–30), rows: z.array({date, amount, text?}).min(1) }` → `{ account, from, to, matched: [{bank, ledger, dayDiff}], unmatchedBank, unmatchedLedger, suspectedDuplicates, bankTotal, ledgerTotal, difference }`; window = rows' date span ± tolerance); verify: 2.9 passes
- [x] 2.12 Count 55 → 57 in `test/server.test.ts` and the three AGENTS files; CHANGELOG + README Computed block gain both tools; verify: `pnpm test`

## 3. VAT summary and profit and loss
- [x] 3.1 Failing test `test/sie.test.ts::vat summary per account` proves scenario "VAT and sales accounts are summed per account for the period"
- [x] 3.2 Failing test `test/sie.test.ts::vat totals from ranges` proves scenario "Totals derive from account ranges"
- [x] 3.3 Failing test `test/sie.test.ts::p&l by class` proves scenario "Result per class covers classes 3 to 8"
- [x] 3.4 Failing test `test/sie.test.ts::p&l by account` proves scenario "Grouping by account lists each account once"
- [x] 3.5 Failing test `test/sie.test.ts::p&l ignores balance accounts` proves scenario "Balance accounts are excluded"
- [x] 3.5b Failing test `test/sie.test.ts::vat settlement left out` proves scenario "VAT settlement verification is left out"
- [x] 3.6 `src/sie.ts`: `periodSums(sies, from, to, pred)` shared by `vatSummary` (accounts 2610–2659 and 3000–3999; `outputVat = -Σ2610–2639`, `inputVat = Σ2640–2649`, `netVat = outputVat - inputVat`) and `profitAndLoss` (accounts 3000–8999; `groupBy "class" | "account"`; class names for 3–8 as a 6-entry constant; `result = -Σ`); verify: 3.1–3.5 pass
- [x] 3.7 `src/index.ts`: register `bokio_vat_summary` (`{ companyId, from, to }` → `{ from, to, accounts: [{account, name, amount}], outputVat, inputVat, netVat }`; description says "account totals only, no return boxes") and `bokio_profit_and_loss` (`{ companyId, from, to, groupBy = "class" }` → `{ from, to, rows: [{key, name, amount}], result }`); count → 59 in test and AGENTS files; CHANGELOG + README; verify: `pnpm test`

## 4. Open items
- [x] 4.1 Failing test `test/sie.test.ts::payment settles the earliest posting` proves scenario "Payment settles the earliest open item of equal amount"
- [x] 4.2 Failing test `test/sie.test.ts::open item age` proves scenario "Unsettled items report age at the as-of date"
- [x] 4.3 Failing test `test/sie.test.ts::unmatched payment` proves scenario "Unmatched payments are reported separately"
- [x] 4.4 Failing test `test/sie.test.ts::opening balance is unitemised` proves scenario "Items from before the loaded years are an unitemised opening amount"
- [x] 4.5 Failing test `test/sie.test.ts::lines after asOf ignored` proves scenario "Lines after the as-of date are ignored"
- [x] 4.5b Failing test `test/sie.test.ts::annulled postings are not open` proves scenario "Annulled postings are not open items"
- [x] 4.6 `src/sie.ts`: `openItems(sies, account, asOf)` — non-cancelled lines ≤ asOf sorted; posting sign by account class (< 2000 debit, else credit); FIFO pair each opposite-sign line with the earliest unpaired same-|öre| posting dated ≤ it; `openingUnitemised = IB` of the oldest loaded year; `ageDays` via `Date.UTC`; `balance = opening + Σ lines`; verify: 4.1–4.5 pass
- [x] 4.7 `src/index.ts`: register `bokio_open_items` (`{ companyId, account = 1510, asOf, lookbackYears = 1 (0–5) }` → `{ account, asOf, openingUnitemised, open: [{date, series, number, text, amount, ageDays}], unmatchedPayments, balance }`; loads the year of `asOf` plus `lookbackYears` earlier years); count → 60 in `test/server.test.ts` and AGENTS files; `scripts/smoke.mjs` `required` += `bokio_account_balances`, `bokio_reconcile_bank`, `bokio_open_items` (E8); CHANGELOG + README; verify: `pnpm run build && pnpm run smoke`

## 4b. Review fixes (live findings and review, 2026-10-21)
- [x] 4b.1 Test `test/sie.test.ts::ledger resets at a new fiscal year` proves scenario "Result account restarts at the new fiscal year"
- [x] 4b.2 Test `test/sie.test.ts::p&l leaves out year-end closing` proves scenario "Year-end closing verification is left out" (Bokio books 8999/2099 on the last day of a closed year)
- [x] 4b.3 Test `test/sie.test.ts::negative opening keeps postings` proves scenario "Opening balance sign does not flip postings"
- [x] 4b.4 Test `test/sie.test.ts::recurring amount reconciles fully` proves scenario "Recurring same amount reconciles fully"
- [x] 4b.5 Test `test/sie.test.ts::margin lines are not reported` proves scenario "Lines outside the statement span are not reported"
- [x] 4b.6 Test `test/server.test.ts::invalid dates and amounts rejected` proves scenario "Invalid dates and sub-öre amounts are rejected"
- [x] 4b.7 `test/readonly.test.ts` asserts the seven computed tools are present with writes off; `test/server.test.ts` calls every computed tool over the mocked export and checks `structuredContent` against its schema
- [x] 4b.8 `src/sie.ts`: ledger restarts at each year's opening; reconcile takes the earliest reachable line and reports/totals the statement span plus matched lines; P&L leaves out verifications with a 2099 line; open-items sign by account class. `src/index.ts`: `isoDay = z.iso.date()`, bank amounts at most two decimals, `loadYears` requires from/to

## 5. Check
- [x] 5.1 `pnpm exec biome ci && pnpm run typecheck && pnpm test && pnpm run build && pnpm run smoke && pnpm run pack:check`
