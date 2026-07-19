<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-19 | Updated: 2026-07-19 -->

# test

## Purpose

Vitest suites. Two complementary layers: pure unit tests of the HTTP client/config (no network, mocked `fetch`), and an in-memory MCP integration test that drives the real server through `tools/list`.

## Key Files

| File | Description |
|------|-------------|
| `bokio.test.ts` | Unit tests for `bokioRequest` (Bearer header, query building, non-2xx throw, **write gate on/off**, missing-token error), `resolveCompanyId`, `writesAllowed`, `filterQuery`, `downloadTarget` (traversal rejection). Mocks `fetch` via `vi.stubGlobal`. |
| `server.test.ts` | Sets `BOKIO_ALLOW_WRITES=1` **before** importing `../src/index.js`, connects a `Client` to the exported `server` over `InMemoryTransport.createLinkedPair()`, and asserts: all 31 tools present, every tool has a boolean `readOnlyHint`, and read/write/destructive/idempotent hints are correct. |

## For AI Agents

### Working In This Directory

- **`server.test.ts` must set `process.env.BOKIO_ALLOW_WRITES` before the dynamic `import`** — tool registration reads the flag at import time (write tools are hidden when off). Use `await import(...)`, not a top-level static import, so env is set first.
- Env mutations are safe: vitest isolates each test file. Restore `process.env` in `afterEach` (see `bokio.test.ts`).
- When you add/remove a tool, update the `expect(tools.length).toBe(31)` assertion here and the `required`/`forbidden` lists in `../scripts/smoke.mjs`.
- No live Bokio calls in tests — everything is mocked or in-memory. Never put a real token here.

### Testing Requirements

- Run `pnpm test` (all suites) or `pnpm exec vitest run test/server.test.ts` for one file.
- New client behavior needs a mocked-`fetch` case; new tool surface/annotation needs a `server.test.ts` assertion.

### Common Patterns

- `mockFetch(status, body, contentType)` returns a `vi.fn` yielding a `Response`.
- Inspect calls via `f.mock.calls[0]` (url, init).

## Dependencies

### Internal
- Imports from `../src/bokio.js` and `../src/index.js`.

### External
- `vitest`, `@modelcontextprotocol/sdk/client/index.js`, `@modelcontextprotocol/sdk/inMemory.js`.

<!-- MANUAL: -->
