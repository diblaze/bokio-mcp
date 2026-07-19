<!-- Generated: 2026-07-19 | Updated: 2026-07-19 -->

# bokio-mcp

## Purpose

A [Model Context Protocol](https://modelcontextprotocol.io) server (stdio transport) that wraps the [Bokio](https://www.bokio.se/) accounting REST API as MCP tools. Single-company, private Bearer-token auth. **Read-only by default** — all mutating tools are hidden and blocked unless `BOKIO_ALLOW_WRITES=1`. Built to drive a Swedish AB's books alongside a YNAB budget. See `README.md` for user-facing install/config.

## Key Files

| File | Description |
|------|-------------|
| `src/index.ts` | Server entry: builds the `McpServer`, registers all 31 tools via the `tool()` helper, gates `main()` on being the entry point. Exports `server` for tests. |
| `src/bokio.ts` | HTTP client + config: `bokioRequest` (JSON, enforces the write gate), `bokioDownload` (binary GET), `fileForm`, `filterQuery`, `resolveCompanyId`, `writesAllowed`, `downloadTarget`. |
| `test/bokio.test.ts` | Unit tests (mocked `fetch`) for the client, write gate, filterQuery, downloadTarget. |
| `test/server.test.ts` | In-memory `Client↔Server` test: asserts all tools register with explicit annotations. |
| `scripts/smoke.mjs` | Spawns built `dist/index.js`, runs the MCP handshake + `tools/list`, asserts read-only surface (writes hidden, all annotated). Run via `pnpm run smoke`. |
| `biome.json` | Biome config: 4-space, 100 cols, double quotes, semicolons, organize-imports. |
| `pnpm-workspace.yaml` | Carries `allowBuilds: esbuild: true` (pnpm 11 needs it for vitest). |
| `.github/workflows/ci.yml` | CI: Node matrix [22, 24], pnpm, `biome ci` → typecheck → test → build → smoke. |
| `.github/CODEOWNERS` | `* @diblaze` — required reviewer on PRs. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/` | Server + HTTP client (see `src/AGENTS.md`) |
| `test/` | Vitest suites (see `test/AGENTS.md`) |
| `scripts/` | `smoke.mjs` MCP-handshake check (single file) |
| `.github/` | CI workflow + CODEOWNERS |

## For AI Agents

### Working In This Directory

- **Package manager is pnpm only** (`packageManager: pnpm@11.9.0`), which requires **Node ≥ 22.13**. Never use npm/yarn. `corepack enable` first.
- **Lint/format is Biome, 4-space.** Run `pnpm run format` (writes) / `pnpm run lint` (checks). CI runs `pnpm exec biome ci` and it must be clean.
- **`main` is branch-protected**: external changes need a PR with green CI (`build (22)`, `build (24)`) + 1 approval (CODEOWNERS @diblaze). The owner has admin bypass.
- Do **not** publish to npm without explicit ask (tracked as issue #1).

### Adding or changing a tool

All tools are registered through the `tool(name, description, shape, handler)` helper in `src/index.ts`. It derives behavior from conventions — follow them exactly:

- **Write tools MUST contain `WRITE.` in their description string.** That single token drives two things: (1) the tool is *not registered at all* when `BOKIO_ALLOW_WRITES` is off (#3), and (2) it gets `readOnlyHint:false`. Read tools omit it and get `readOnlyHint:true`.
- Annotation hints are derived from the **tool name**: names matching `/reverse|delete/` get `destructiveHint:true`; `/update/` get `idempotentHint:true`. Name new tools accordingly.
- All mutations MUST go through `bokioRequest` with a non-GET `method` — never call `fetch` directly for writes. `bokioRequest` is the single choke point that enforces the `BOKIO_ALLOW_WRITES` gate; annotations are hints only, not security.
- Downloads use `bokioDownload` (GET, no gate). File writes go through `downloadTarget()` (confines to `BOKIO_DOWNLOAD_DIR`, rejects traversal).
- Secrets: the token is read lazily from `BOKIO_TOKEN` and sent only as a Bearer header. Never log it or write to stdout (stdout is the JSON-RPC channel; use stderr).

### Testing Requirements

Before committing, all of these must pass (CI runs the same):
```bash
pnpm exec biome ci
pnpm run typecheck
pnpm test          # vitest: mocked fetch + in-memory server
pnpm run build
pnpm run smoke     # spawns dist/index.js, MCP handshake
```
When adding a tool, the `test/server.test.ts` count assertion (`expect(tools.length).toBe(31)`) and the smoke `forbidden`/`required` lists may need updating.

### Common Patterns

- `tool()` wraps every handler in try/catch and returns `{ isError: true }` — handlers throw freely.
- `ok(data)` formats a text result; `cbase(companyId)` builds `/companies/{id}` with `resolveCompanyId` fallback to `BOKIO_COMPANY_ID`.
- Shared zod fragments (`companyId`, `page`, `pageSize`, `query`, `passthrough`) are defined once and reused.

## Dependencies

### External
- `@modelcontextprotocol/sdk` (^1.29) — MCP server/client, stdio + in-memory transports.
- `zod` (^4) — tool input schemas.
- dev: `@biomejs/biome` (2.5), `typescript` (5.x), `vitest` (2.x), `tsx`.

### Runtime
- Bokio REST API `https://api.bokio.se/v1` (OpenAPI: <https://github.com/bokio/bokio-api>).

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
