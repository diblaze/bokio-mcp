# Proposal

Status: done
Issue: diblaze/bokio-mcp#19

## Why
Glama rates the server C (2.9/5) on its Tool Definition Quality Score (TDQS). The weakest tool pulls the whole score down, because the server score weights the minimum at 40%. The common gaps: undescribed id, date and savePath parameters; two-word descriptions such as "List customers."; and no hint about where ids come from or what a download writes. Fixing these is cheap. The deterministic `tdqs lint` can keep them fixed in CI.

## What Changes
- Every tool parameter gets a schema description. Shared facts are described once, in the shared zod fragments: where an id comes from, the `companyId` fallback, paging, date format, and the save-path confinement with no overwrite.
- Tool descriptions are rewritten as one to three plain sentences, inline next to each tool. The first sentence says what the tool does; the rest says when to use a sibling instead, what is returned, and behaviour the annotations do not carry. No shouting words. The `WRITE.` token stays.
- `pnpm test` runs the TDQS reference linter (`mcp-tdqs`, pinned dev dependency) over all 60 listed tools. It fails on any error-level or warning-level finding except `shadow-candidate`.
- CONTRIBUTING.md documents the manual `tdqs lint` / `tdqs score` commands. README keeps listing tool names only.

## Capabilities
### New Capabilities
- `tool-definitions`: quality rules for the tool definitions clients see in `tools/list`: lint-clean, short plain descriptions, and documented ids and save paths.
### Modified Capabilities
- none

## Impact
- Code: `src/index.ts` (zod fragments, descriptions; no handler changes), `test/server.test.ts` (new describe).
- Dependencies: dev `mcp-tdqs` 0.2.0 (brings its own `@modelcontextprotocol/sdk` ^1.30 / `zod` ^4.5 copies; runtime deps unchanged).
- Docs: `AGENTS.md`, `test/AGENTS.md`, `CONTRIBUTING.md`. No config keys, no migrations, no CI workflow change (the lint rides in `pnpm test`).
