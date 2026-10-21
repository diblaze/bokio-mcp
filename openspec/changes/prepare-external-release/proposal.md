# Proposal

Status: approved
Issue: diblaze/bokio-mcp#6

## Why
Other consultants want to run this server against their own Bokio companies, but today it installs only from a clone with a hard-coded personal path, covers roughly half of the current Company API, and carries stale hints (token location, rate-limit wording, pageSize cap) that mislead a first-time user. Bokio republished its OpenAPI on 2026-10-16; this change aligns to it and makes the package installable with `npx -y bokio-mcp`.

## What Changes
- Add read tools for credit notes, suppliers, supplier invoices, invoice payments, invoice settlements and bank payments (bank payments read-only; no payment creation, ever).
- Add gated write tools (typed bodies, existing `BOKIO_ALLOW_WRITES` gate) for credit notes (create-from-invoice, update, publish, record, delete), suppliers (create, update), supplier invoices (create, update) and invoice settlements (create).
- Add PDF download tools for published invoices and credit notes; validate the save path before any network request on every download tool.
- Align existing tools with the current API: `pageSize` max 100 (was 200), `query` filter on items/uploads/chart-of-accounts, token hints point to the Bokio Integrations page, 403/429 hints match Bokio's documented `quota-exceeded` / `rate-limit-exceeded` codes.
- Server version is read from `package.json` (no second hard-coded copy); version 0.1.0 → 0.2.0.
- Build produces an executable `dist/index.js`; the smoke check spawns it directly. Adds LICENSE (MIT), `repository`/`homepage`/`bugs` metadata.
- README rewritten for external users: `npx -y bokio-mcp`, `claude mcp add` one-liner, Claude Desktop JSON, no personal paths or context. New CHANGELOG.md, SECURITY.md, CONTRIBUTING.md (README's contributing section moves there).
- Tool count 31 → 53 (test and smoke assertions updated).

## Capabilities
### New Capabilities
- `bokio-tool-surface`: which Bokio resources are exposed as MCP tools, how write tools are gated and annotated, input bounds, download-path safety, and the actionable error hints.
- `npm-distribution`: what the published package contains and guarantees (executable bin, version parity, shipped files).
### Modified Capabilities
- none (no prior specs exist)

## Impact
- Code: `src/index.ts` (22 new tools, 3 new exported body schemas, `saveDownload` helper, version via `createRequire`), `src/bokio.ts` (hint strings only), `test/server.test.ts`, `test/bokio.test.ts`, `scripts/smoke.mjs`, `package.json` (`build`, `version`, `repository`, `homepage`, `bugs`).
- Docs: `README.md`, `AGENTS.md` (tool count, generic purpose line), new `LICENSE`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`.
- No new dependencies, no config-key changes, no migrations. Auth unchanged (private integration token per company; OAuth remains out of scope).
- Owner-only manual steps after merge: `npm publish`, enable GitHub private vulnerability reporting.
