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

1. Fork, branch, commit.
2. Make sure `pnpm exec biome ci`, `pnpm run typecheck`, `pnpm test`, `pnpm run build` and `pnpm run smoke` pass (CI runs the same on Node 22 and 24).
3. Open a PR against `main`. CI must be green and a maintainer (per `CODEOWNERS`) must approve.

Adding a tool: follow the existing `tool()` pattern in `src/index.ts`, put `WRITE.` in the description of anything that changes data, and update the tool count in `test/server.test.ts` plus the `required`/`forbidden` lists in `scripts/smoke.mjs`.

Never put real accounting data, company ids, org numbers or tokens in code, tests or issues.

Toolchain: TypeScript + pnpm, [Biome](https://biomejs.dev) for lint/format, [Vitest](https://vitest.dev) for tests.
