# Contributing

`main` is protected: changes land through pull requests.

## Build from source

Requires Node.js ≥ 22.13 and [pnpm](https://pnpm.io) (`corepack enable`).

```bash
git clone https://github.com/diblaze/bokio-mcp.git
cd bokio-mcp
pnpm install
pnpm run build     # → dist/
pnpm test          # mocked unit tests, no Bokio account needed
pnpm run smoke     # MCP handshake against the built server
pnpm run lint      # biome check (lint + format)
pnpm run pack:check  # tarball holds only runtime files
```

To try a local build in an MCP client, point it at `node /path/to/bokio-mcp/dist/index.js`.

## Pull requests

1. Fork, branch, commit. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) (`feat: …`, `fix(api): …`). `pnpm install` sets up git hooks that format staged files and check each message; CI checks every commit in the PR as well, because PRs are rebase-merged.
2. Make sure `pnpm exec biome ci`, `pnpm run typecheck`, `pnpm test`, `pnpm run build` and `pnpm run smoke` pass (CI runs the same on Node 22 and 24).
3. Open a PR against `main`. CI must be green and a maintainer (per `CODEOWNERS`) must approve.

Adding a tool: follow the existing `tool()` pattern in `src/index.ts`, put `WRITE.` in the description of anything that changes data, and update the tool count in `test/server.test.ts` plus the `required`/`forbidden` lists in `scripts/smoke.mjs`. Describe every parameter; shared facts go in the zod fragment (`companyId`, the resource ids, `savePath`), not in each tool.

Tool definition quality: `pnpm test` runs the [TDQS](https://github.com/glama-ai/tool-definition-quality-score) lint over all tools. To see the full lint report for the built server, run `pnpm run build`, then `pnpm exec tdqs lint --command "env BOKIO_ALLOW_WRITES=1 node dist/index.js" --format markdown`; the `env` is needed because tdqs does not pass your environment to the server. `tdqs score` grades the descriptions with a model, the way Glama does; it needs `TDQS_BASE_URL`, `TDQS_API_KEY` and `TDQS_MODEL`, costs money and varies between runs, so it is a manual check only.

Never put real accounting data, company ids, org numbers or tokens in code, tests or issues.

Toolchain: TypeScript + pnpm, [Biome](https://biomejs.dev) for lint/format, [Vitest](https://vitest.dev) for tests.

## Releases

Commit types decide the next version: `feat` gives a minor bump (while the version is below 1.0), `fix` a patch, `perf` is listed under Changed, and other types (`docs`, `chore`, `ci`, `build`, `test`) neither trigger a release nor appear in the changelog. release-please keeps a release PR open with the version and changelog. When a maintainer merges it, the release is tagged, a GitHub Release is created and the package is staged on npm, where the owner approves it. After approving, the owner runs `gh workflow run mcp-registry.yml --ref main` to list the version in the MCP Registry. Do not edit `version` or `CHANGELOG.md` in a PR.
