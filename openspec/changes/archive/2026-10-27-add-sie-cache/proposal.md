# Proposal

Status: done
Issue: diblaze/bokio-mcp#23

## Why
Every computed tool call lists the fiscal years and downloads one SIE export for each year it touches, even when the call before it just fetched the same data. A typical session (balances, then ledger, then VAT for one year) costs about 6 requests where 2 would do. Bokio caps usage at 5,000 requests per company per month and 200 per minute.

## What Changes
- Computed tools reuse the fiscal-year listing and the parsed SIE export of each year for 5 minutes. The cache is keyed by request path, which contains the company id. It is held in process memory only, with no persistence and no config.
- Failed loads (HTTP error, timeout, malformed export) are never cached.
- Every write request clears the whole cache once it settles, whether it succeeded or failed, so a booking shows up on the next computed call.
- The server instructions' "Cost" paragraph says the data is reused for 5 minutes and that a write clears it.

## Capabilities
### New Capabilities
- none
### Modified Capabilities
- `bokio-computed-tools`: "Computed tools are read-only and derive from the bookkeeping export" now allows a cached copy. Two requirements are added: five-minute reuse, and clearing the cache on writes.
- `server-instructions`: new requirement "Instructions state the reuse window" (the existing accuracy requirement is at its length limit).

## Impact
- Code: `src/bokio.ts` gains `cached()`, `clearCache()` and a clear in `bokioRequest` on write methods. `src/index.ts` `loadYears` wraps its two fetches in `cached()`, and the INSTRUCTIONS Cost sentence changes.
- Tests: `test/bokio.test.ts`, `test/server.test.ts` (`mockBokio()` clears the cache, plus new cache cases).
- No new dependency, config key or migration. Other tools, including `bokio_list_fiscal_years` and `bokio_download_sie`, are not cached.
