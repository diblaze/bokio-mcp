<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-19 | Updated: 2026-07-19 -->

# src

## Purpose

The server implementation: a thin, convention-driven MCP wrapper over the Bokio REST API. Two files — the tool registry/entry (`index.ts`) and the HTTP client + config helpers (`bokio.ts`).

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | Creates and **exports** `server` (`McpServer`). Defines the `tool()` helper that registers each tool with derived annotations + read-only gating. Registers all 31 tools. `main()` opens stdio only when run as the entry point (`process.argv[1] === fileURLToPath(import.meta.url)`), so importing for tests does not connect. |
| `bokio.ts` | `bokioRequest<T>` (JSON; enforces the write gate at the single choke point), `bokioDownload` (binary GET), `fileForm` (multipart upload), `filterQuery` (journal date-filter join, unit-tested), `downloadTarget` (path confinement), `resolveCompanyId`, `writesAllowed`, `baseUrl`. 30s `AbortSignal.timeout` on every request. |

## For AI Agents

### Working In This Directory

- **The write gate lives in `bokioRequest`** (`WRITE_METHODS.has(method) && !writesAllowed()` → throw). Every mutating tool must route through it with a non-GET method. This is the security boundary — tool annotations are advisory only.
- **`tool()` is convention-driven** (see root `AGENTS.md` › "Adding or changing a tool"): `WRITE.` in the description hides+flags writes; the name (`reverse|delete`, `update`) sets destructive/idempotent hints.
- Keep `bokio.ts` free of MCP concerns (pure HTTP/config) and `index.ts` free of raw `fetch` — call the `bokio.ts` helpers.
- Loose `z.record(z.string(), z.any())` bodies on some write tools are a known gap (issue #2); prefer real field schemas for new write tools.

### Testing Requirements

- Client/gate logic → add to `../test/bokio.test.ts` (mock `fetch` with `vi.stubGlobal`).
- Tool registration/annotations → `../test/server.test.ts` (in-memory transport). Update the tool-count assertion when adding tools.

### Common Patterns

- `export` only what tests or `index.ts` need; keep internal helpers (e.g. `baseUrl`, `token`) unexported.
- Errors carry `status + statusText + truncated body`; never include the token.

## Dependencies

### Internal
- `index.ts` imports all helpers from `./bokio.js`.

### External
- `@modelcontextprotocol/sdk/server/mcp.js` + `.../server/stdio.js`, `zod`, Node built-ins (`node:fs/promises`, `node:url`, `node:path`).

<!-- MANUAL: -->
