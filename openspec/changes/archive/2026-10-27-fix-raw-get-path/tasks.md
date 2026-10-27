# Tasks
## 1. Raw GET path guard
- [x] 1.1 Failing test `test/server.test.ts::raw get path › escaping paths are rejected before any request (Raw path leaving the API is rejected)` proves scenario "Raw path leaving the API is rejected": new `describe("raw get path")` placed right after the `path ids` block (`:391-409`), not in computed/SIE areas; loop `/../x`, `/companies/{companyId}/../../x`, `/%2e%2e/x`, `/..\\x`; each `isError` true; `fetch` stub never called (E7).
- [x] 1.2 Failing test `test/server.test.ts::raw get path › query in path is rejected (Raw path carrying a query is rejected)` proves scenario "Raw path carrying a query is rejected": `/a?b=1`, `/a#f` give `isError` true, text matches `/params/`, `fetch` not called.
- [x] 1.3 Test `test/server.test.ts::raw get path › placeholder path resolves (Raw path with the company placeholder resolves)` proves scenario "Raw path with the company placeholder resolves": `BOKIO_COMPANY_ID=co`, path `/companies/{companyId}/tag-groups`, `params: { page: 2 }`; one fetch call whose URL ends `/companies/co/tag-groups?page=2`. Passes before and after 1.4 (regression guard).
- [x] 1.4 In `src/index.ts` `bokio_raw_get` (E1), change `path` to `z.string().min(1).regex(/^[\w\-/{}]*(?:\.[\w\-/{}]+)*\.?$/, "path must be an API path such as /companies/{companyId}/tag-groups (letters, digits, / - _ . { }, no ..); put query values in params").describe("API path below /v1, e.g. /companies/{companyId}/tag-groups; query values go in params")`. Handler unchanged. Verify: `pnpm exec vitest run test/server.test.ts` passes, TDQS lint test included.

## 2. Check
- [x] 2.1 `pnpm exec biome ci && pnpm run typecheck && pnpm test && pnpm run build && pnpm run smoke && pnpm run pack:check`
