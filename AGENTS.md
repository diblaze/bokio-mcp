<!-- Generated: 2026-07-19 | Updated: 2026-10-21 -->

# bokio-mcp

## Purpose

A [Model Context Protocol](https://modelcontextprotocol.io) server (stdio transport) that wraps the [Bokio](https://www.bokio.se/) accounting REST API as MCP tools. Single-company, private Bearer-token auth. **Read-only by default** — all mutating tools are hidden and blocked unless `BOKIO_ALLOW_WRITES=1`. For small companies and consultants who keep their own books in Bokio; installed by users with `npx -y bokio-mcp`. See `README.md` for user-facing install/config.

## Key Files

| File | Description |
|------|-------------|
| `src/index.ts` | Server entry: builds the `McpServer` with the `INSTRUCTIONS` sent at initialize (keep them short and true to the tools), registers all 60 tools via the `tool()` helper, gates `main()` on being the entry point. Exports `server` for tests. |
| `src/sie.ts` | SIE 4 export parser (PC8/CP437, `#RAR 0`, annulment pairs) and the pure öre computations behind the computed tools. |
| `src/bokio.ts` | HTTP client + config: `bokioRequest` (JSON, enforces the write gate), `bokioDownload` (binary GET), `fileForm`, `filterQuery`, `resolveCompanyId`, `writesAllowed`, `downloadTarget`. |
| `test/bokio.test.ts` | Unit tests (mocked `fetch`) for the client, write gate, filterQuery, downloadTarget. |
| `test/server.test.ts` | In-memory `Client↔Server` test: asserts all tools register with explicit annotations; computed tools against a mocked fiscal-year listing + SIE download; TDQS lint (`mcp-tdqs`) over all tools. |
| `test/sie.test.ts` | Parser and computation tests on synthetic SIE built in the file. |
| `scripts/smoke.mjs` | Spawns built `dist/index.js` directly and through a symlink (as npm installs bins), runs the MCP handshake + `tools/list`, asserts read-only surface (writes hidden, all annotated). Run via `pnpm run smoke`. |
| `scripts/pack-check.mjs` | `npm pack --dry-run`: tarball holds only `dist/`, README, LICENSE, `package.json`. Run via `pnpm run pack:check` (CI). |
| `biome.json` | Biome config: 4-space, 100 cols, double quotes, semicolons, organize-imports. |
| `pnpm-workspace.yaml` | Carries `allowBuilds`: `esbuild: true` (pnpm 11 needs it for vitest), `lefthook: false` (hooks come from `prepare`). |
| `LLM.md` | Setup guide addressed to an AI agent; linked from the README, not shipped in the tarball. |
| `lefthook.yml` | Git hooks, installed by `pnpm install` (`prepare: lefthook install --reset-hooks-path`, which also clears an old `core.hooksPath`): pre-commit Biome on staged files + actionlint on staged workflows (skipped when not on PATH), commit-msg commitlint (Conventional Commits, built-in config). |
| `.github/workflows/release-please.yml` | On push to `main`: release-please opens or updates the release PR; when a release is created, the `publish` job runs `npm stage publish` (OIDC, Node 24). Needs the `RELEASE_PLEASE_TOKEN` secret. |
| `release-please-config.json`, `.release-please-manifest.json` | release-please config (node, `bump-minor-pre-major`, `v`-prefixed tags, changelog sections Added/Fixed/Changed) and the last released version. |
| `.github/workflows/ci.yml` | CI: Node matrix [22, 24], pnpm, commitlint over the PR's commits → actionlint (+ shellcheck) → `biome ci` → typecheck → test → build → smoke → pack:check. |
| `.github/CODEOWNERS` | `* @diblaze` — required reviewer on PRs. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/` | Server + HTTP client (see `src/AGENTS.md`) |
| `test/` | Vitest suites (see `test/AGENTS.md`) |
| `scripts/` | `smoke.mjs` MCP-handshake check, `pack-check.mjs` tarball contents check |
| `.github/` | CI workflow + CODEOWNERS |

## Coding standard
- Stack: TypeScript 5 (ESM; runtime Node ≥ 22, development ≥ 22.13 for pnpm 11) — MCP SDK ^1.29, Context7 `/modelcontextprotocol/typescript-sdk` (version `v1.29.0`); zod ^4, Context7 `/colinhacks/zod`. Bokio API: OpenAPI `bokio/bokio-api` branch `v1`, `api-specification/company-api.yaml`.
- Package manager: pnpm (lockfile `pnpm-lock.yaml`). Never npm/yarn (npm only in the release workflow's publish job).
- Check: `pnpm exec biome ci && pnpm run typecheck && pnpm test && pnpm run build && pnpm run smoke && pnpm run pack:check` — green before commit. CI: `.github/workflows/ci.yml` (Node 22 + 24) also runs commitlint over the PR's commits and actionlint (locally: `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:1.7.12`).
- Format/lint: Biome, `biome.json` is law. Run `pnpm run format` before commit (the pre-commit hook fixes staged files).
- Commits: Conventional Commits (`@commitlint/config-conventional` as-is), enforced by the commit-msg hook and in CI for every commit in a PR.
- Tests: vitest, `test/*.test.ts`. Public surface only: tools through the in-memory client, pure functions from `src/sie.ts`/`src/bokio.ts`; `fetch` stubbed (`vi.stubGlobal`) as the only trust-boundary stub; no live Bokio calls. Test names end with the spec scenario name in parentheses. Bare `.skip`/`.only` is a blocker.
- Style: money is integer öre inside, kronor (`ore / 100`) only at the output edge, never float sums. Every tool goes through `tool()`; a tool with an output shape returns `okStructured(...)`. Ids in URL paths use `idParam`. New behaviour lands with an OpenSpec change (`openspec/changes/`) and is folded into `openspec/specs/` in the PR.
- Language: code, docs, commits English.
- Tracking: GitHub Issues. Labels `type:bug|feat|chore`. Deps via `--blocked-by`. Ready queue: `gh issue list --search '-is:blocked is:open'`. Commits close with `Closes #n`.
- Don't: put real accounting data, company ids, org numbers, names or amounts anywhere (public repo; fixtures are invented). Don't add a mutating tool without `WRITE.` in its description. Don't expose bank-payment creation.

## For AI Agents

### Working In This Directory

- **Package manager is pnpm only** (`packageManager: pnpm@11.9.0`), which requires **Node ≥ 22.13** to develop (users only need Node ≥ 22). Never use npm/yarn. `corepack enable` first.
- **Lint/format is Biome, 4-space.** Run `pnpm run format` (writes) / `pnpm run lint` (checks). CI runs `pnpm exec biome ci` and it must be clean.
- **`main` is branch-protected**: external changes need a PR with green CI (`build (22)`, `build (24)`) + 1 approval (CODEOWNERS @diblaze). The owner has admin bypass.
- Releases: release-please (`.github/workflows/release-please.yml`) keeps a release PR open on every push to `main`, with the next version and `CHANGELOG.md` entry derived from the commit types (`feat` → minor before 1.0, `fix` → patch; other types never release on their own). Merging it tags `vX.Y.Z`, creates the GitHub Release and stages the package on npm via trusted publishing; the owner approves the staged version on npm with 2FA. Never bump `version` or edit `CHANGELOG.md` by hand, and agents never run `npm publish`.

### Adding or changing a tool

All tools are registered through the `tool(name, description, shape, handler)` helper in `src/index.ts`. It derives behavior from conventions — follow them exactly:

- **Write tools MUST contain `WRITE.` in their description string.** That single token drives two things: (1) the tool is *not registered at all* when `BOKIO_ALLOW_WRITES` is off (#3), and (2) it gets `readOnlyHint:false`. Read tools omit it and get `readOnlyHint:true`.
- Annotation hints are derived from the **tool name**: names matching `/reverse|delete|publish|record|update_supplier_invoice/` get `destructiveHint:true`; `/update/` get `idempotentHint:true`. Name new tools accordingly.
- All mutations MUST go through `bokioRequest` with a non-GET `method` — never call `fetch` directly for writes. `bokioRequest` is the single choke point that enforces the `BOKIO_ALLOW_WRITES` gate; annotations are hints only, not security.
- Downloads use `bokioDownload` (GET, no gate). File writes go through `saveDownload()` → `downloadTarget()` (confines to `BOKIO_DOWNLOAD_DIR`, else the working directory; rejects traversal; never overwrites).
- Secrets: the token is read lazily from `BOKIO_TOKEN` and sent only as a Bearer header. Never log it or write to stdout (stdout is the JSON-RPC channel; use stderr).

### Testing Requirements

Before committing, all of these must pass (CI runs the same):
```bash
pnpm exec biome ci
pnpm run typecheck
pnpm test          # vitest: mocked fetch + in-memory server
pnpm run build
pnpm run smoke     # spawns dist/index.js, MCP handshake
pnpm run pack:check
```
When adding a tool, the `test/server.test.ts` count assertion (`expect(tools.length).toBe(60)`) and the smoke `forbidden`/`required` lists may need updating.

### Common Patterns

- `tool()` wraps every handler in try/catch and returns `{ isError: true }` — handlers throw freely.
- `ok(data)` formats a text result; `okStructured(data)` adds `structuredContent` (required when the tool declares an output shape); `cbase(companyId)` builds `/companies/{id}` with `resolveCompanyId` fallback to `BOKIO_COMPANY_ID`.
- Shared zod fragments (`companyId`, `idParam`, `page`, `pageSize`, `query`, `isoDay`) are defined once and reused.
- Computed tools: `loadYears(companyId, {fiscalYearId?, from, to})` lists fiscal years once (skipped when an id is given), downloads each overlapping SIE export and parses it with `parseSie`; the arithmetic lives in `src/sie.ts`.

## Dependencies

### External
- `@modelcontextprotocol/sdk` (^1.29) — MCP server/client, stdio + in-memory transports.
- `zod` (^4) — tool input schemas.
- dev: `@biomejs/biome` (2.5), `typescript` (5.x), `vitest` (2.x), `tsx`, `mcp-tdqs` (pinned; TDQS lint in `test/server.test.ts`).

### Runtime
- Bokio REST API `https://api.bokio.se/v1` (OpenAPI: <https://github.com/bokio/bokio-api>).

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
