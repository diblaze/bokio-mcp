# Design
## Context
- E1 `src/index.ts:399-401`: `const res = await bokioRequest<...>({ path: \`${base}/fiscal-years\`,`. This is the listing, fetched on every computed call that has no fiscal year id.
- E2 `src/index.ts:417`: `for (const id of ids) sies.push(parseSie(await bokioDownload(\`${base}/sie/${id}/download\`)));`. This is one download and parse per year, on every call.
- E3 `src/index.ts:439,467,519,565,608,635,668`: these are the seven `loadYears(a.companyId, …)` call sites. All computed tools route through `loadYears`, so the cache goes there.
- E4 `src/index.ts:395`: `const base = cbase(cid);`. The base path is `/companies/{id}`, so a path key already separates companies.
- E5 `src/bokio.ts:117-124`: `bokioRequest` checks `WRITE_METHODS.has(method) && !writesAllowed()` and then throws. Per `AGENTS.md`, it is "the single choke point" that every mutation goes through (non-GET calls at `src/index.ts:738…1310`).
- E6 `src/bokio.ts:137-148`: `const res = await fetch(…)`, then `if (!res.ok) throw …`. A write can time out or fail after Bokio has already applied it.
- E7 `src/sie.ts:141-156,208,467`: `allLines`, `ledger` and `openItems` build new arrays or sort copies (`[...sies].sort`). The computations never mutate a parsed `Sie`, so sharing it is safe.
- E8 `src/index.ts:42`: the instructions say "Cost: each computed call lists the fiscal years, then downloads one SIE export per fiscal year it touches. … reuse results." The instructions are 1,245 characters; the limit is 2,000 (spec `server-instructions`).
- E9 `test/server.test.ts:433-450`: every computed test calls `mockBokio()` and asserts exact `fetch` call counts (`:477`, `:495`, `:512`). Vitest shares one module instance per file, so a cache filled in one test would leak into the next.
- E10 `test/AGENTS.md`: "Restore `process.env` in `afterEach`". The coding standard allows stubbing `fetch` only, and testing pure functions from `src/bokio.ts`.

## Goals / Non-Goals
**Goals:**
- Two computed calls on the same range within 5 minutes make 2 requests in total, not 4.
- A write never leaves stale computed figures behind.

**Non-Goals:**
- Caching `bokio_list_fiscal_years`, `bokio_download_sie` or other reads. Reopen when usage shows repeated plain reads that burn quota.
- A configurable TTL. Reopen when a user asks for one in an issue.
- Merging concurrent identical loads into one request. Reopen when clients run computed calls in parallel.
- Evicting expired entries. Keys are bounded by companies × fiscal years, and a stale entry is overwritten on its next load.

## Decisions
- Put `cached(key, load)` and `clearCache()` in `src/bokio.ts`, next to `bokioRequest`. The clear must sit at the write choke point (E5), and putting the cache in `index.ts` would need an import cycle or a callback. Alternative lost: a cache local to `index.ts` plus a clear call in each of ~25 write handlers.
- The key is the request path. It contains the company id (E4), so no extra key part is needed.
- Store the load's promise as soon as it starts, so parallel calls (MCP clients issue computed calls together) share one download. A rejection deletes the entry, so failures are never reused; a parse error inside `load` also counts as a failure. `clearCache` drops promises in flight too, so a load that started before a write is returned to its caller but never reused. The TTL counts from the start of the load.
- The cached SIE value is the parsed `Sie`, not the raw buffer. It saves the decode and parse as well, and it is safe because computations do not mutate it (E7).
- The TTL is `Date.now()`-based, at 5 × 60,000 ms, as the issue asks. Tests use `vi.useFakeTimers({ toFake: ["Date"] })` and `vi.setSystemTime`. Faking only `Date` leaves the transport's timers and `AbortSignal.timeout` real.
- Clear after the write's `fetch` settles, whether it succeeded or failed, so in a `finally`. A failed or timed-out write may still have landed (E6), and clearing before the fetch would let a read that runs at the same time cache pre-write data. A write blocked by the gate never reaches `fetch`, so it does not clear.
- `mockBokio()` calls `clearCache()`, so the existing count assertions keep holding (E9).
- Change one sentence in INSTRUCTIONS (E8) to say both are reused for 5 minutes, writes made through this server clear them, and changes made in Bokio itself can take up to 5 minutes to show.

## Risks / Trade-offs
- A booking made in the Bokio web app is invisible to computed tools for up to 5 minutes. This is accepted by the issue, and the instructions say so; only writes made through this server clear the cache.
- The cache is module-global. Tests must clear it, which `mockBokio()` handles.

## Open Questions
