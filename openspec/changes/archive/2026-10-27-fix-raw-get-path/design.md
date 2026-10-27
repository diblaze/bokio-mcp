# Design
## Context
- E1 `src/index.ts:1326-1340` — `path: z.string().describe("e.g. /companies/{companyId}/tag-groups")` and `let path: string = a.path.startsWith("/") ? a.path : \`/${a.path}\`;`. No other check on `path`.
- E2 `src/bokio.ts:76` — `const url = new URL(baseUrl() + path);`. `bokioRequest` (`src/bokio.ts:117`) builds every URL here; query values go through `url.searchParams.set` (`:77-80`).
- E3 node, WHATWG URL with base `https://api.bokio.se/v1`: `/../x`, `/%2e%2e/x`, `/.%2e/x`, `/..\x`, `\..\x` all resolve to `https://api.bokio.se/x`. `/a?b=1` keeps `?b=1` in the URL, `/a#f` keeps a fragment. `/a/%2e%2e%2fx` stays literal. So encoded dots and backslashes are real escapes, not just `..`.
- E4 `src/bokio.ts:45-46` — `/** Ids are spliced into URL paths, so only plain id characters are allowed (no \`/\`, \`?\`, \`..\`). */ export const ID_PATTERN = /^[A-Za-z0-9_-]+$/;`. Allowlist precedent; `src/index.ts:118` applies it as `z.string().regex(ID_PATTERN, …)`.
- E5 `src/bokio.ts:53` — `resolveCompanyId` already rejects a non-plain `companyId`, so `{companyId}` substitution cannot inject `..`.
- E6 `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js:125,141` — `validateToolInput` throws inside the call handler's `try`; the `catch` returns `this.createToolError(...)`. A zod regex failure therefore reaches the client as `isError: true` with the message, before the handler runs.
- E7 `test/server.test.ts:99-110` — existing pattern: schema-rejected call, `expect(res.isError).toBe(true)`, `expect(f).not.toHaveBeenCalled()`.
- E8 `rg -n raw_get src test openspec/specs` — only caller of the raw path is the tool itself; `openspec/specs/bokio-tool-surface/spec.md:108` "Path ids cannot change the request path" covers ids, not raw paths.

## Goals / Non-Goals
**Goals:**
- Raw GET path cannot leave `/v1`, cannot carry query or fragment; error points at `params`.
**Non-Goals:**
- Guard in `bokioRequest`/`buildUrl` for all paths — every other caller builds paths from constants and `idParam` ids (E4, E5); reopen when another tool accepts a free-form path.
- Reject unknown `{placeholders}` other than `{companyId}` — sent literally, Bokio answers 404; reopen if a placeholder ever resolves to something unintended.

## Decisions
- Zod `.regex()` on the `path` schema, `/^[\w\-/{}]*(?:\.[\w\-/{}]+)*\.?$/`, with message "path must be an API path such as /companies/{companyId}/tag-groups (letters, digits, / - _ . { }, no ..); put query values in params". Allowlist like E4: one line, rejects `%` and `\` so encoded and backslash escapes (E3) need no decoding logic. Schema-level beats a handler check: same `isError` result (E6), no request, and the rule shows in the tool's input schema. Lost: handler `throw` after `decodeURIComponent` — more code, error not visible in the schema.
- No lookahead: the pattern is copied into the tool's JSON Schema, and RE2-based validators (Go, some LLM schema converters) reject lookahead; `.min(1)` covers the empty path.
- Keep `.` allowed (single-dot segments stay inside `/v1`, E3); only `..` is refused.
- `path` description gains "query values go in params" so TDQS/agents see it.

## Risks / Trade-offs
- A real Bokio path needing `%`, `~` or other characters would be refused. Bokio v1 paths are kebab-case segments plus ids (E4), so none known.

## Open Questions
