# Proposal

Status: done
Issue: diblaze/bokio-mcp#8

## Why
Every balance, reconciliation and period sum today is arithmetic the MCP client does by hand over paged journal entries or a raw SIE preview, which is slow, quota-hungry and error-prone (double-booked verifications and bank mismatches have slipped through). Bokio's API has no balance, report or bank-transaction endpoint, so the server must compute these figures itself from the SIE export.

## What Changes
- Add seven read-only computed tools: `bokio_account_balances`, `bokio_account_ledger`, `bokio_reconcile_bank`, `bokio_find_duplicates`, `bokio_vat_summary`, `bokio_open_items`, `bokio_profit_and_loss`. All results are computed in code, in whole öre, returned as `structuredContent` with an output schema, in deterministic order.
- Add a SIE 4 parser (opening/closing balances, fiscal-year range, account names, verifications and lines; PC8/CP437 decoding) that every computed tool shares. One export download per fiscal year touched; no caching.
- Tool count 53 → 60; version 0.2.0 → 0.3.0 (new `## 0.3.0 — unreleased` changelog section on top of the unmerged 0.2.0 one).
- README gains a "Computed" tool block; AGENTS files list the new module and counts.

## Capabilities
### New Capabilities
- `bokio-computed-tools`: read-only figures derived from the bookkeeping export — exact money arithmetic, balances at a date, account ledger, bank reconciliation, duplicate detection, VAT account summary, open items, profit and loss.
### Modified Capabilities
- none

## Impact
- Code: new `src/sie.ts` (parser + pure computations), `src/index.ts` (7 tool registrations + a fiscal-year loader), `test/sie.test.ts` (new, synthetic fixture), `test/server.test.ts` (count, read-only check), `scripts/smoke.mjs` (`required` list), `package.json` (version), `CHANGELOG.md`, `README.md`, `AGENTS.md`, `src/AGENTS.md`, `test/AGENTS.md`.
- API usage: `GET /fiscal-years` + `GET /sie/{fiscalYearId}/download` per computed call; no new scopes beyond `fiscal-years:read` and `sie:read`.
- No new dependencies, no config keys, no migrations, no write paths.
