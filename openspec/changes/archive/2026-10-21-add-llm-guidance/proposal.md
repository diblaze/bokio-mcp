# Proposal

Status: done
Issue: diblaze/bokio-mcp#13

## Why
The server already encodes how it should be used (write gate, ledger sign, computed tools, one SIE download per fiscal year) but only in README prose and 60 tool descriptions; a client model never reads the README and routinely sums raw journal entries or reports a write that the gate blocked. New users also have no way to hand setup to their assistant.

## What Changes
- The MCP `initialize` result carries short usage instructions (write gate and never claiming a blocked write, prefer computed tools, ledger sign, one export per fiscal year and rate limits, `companyId` default, VAT summary is not return boxes, invoices may be empty when revenue is booked as journal entries, `bokio_raw_get` escape hatch).
- New `LLM.md` at the repo root: setup steps written for an AI agent (token and company id, client detection, `BOKIO_DOWNLOAD_DIR`, writes off, verify with `bokio_company_info`, troubleshooting). Not shipped in the npm tarball.
- README gets one line under Install pointing an agent at the raw `LLM.md` URL.
- Smoke check asserts the built server sends instructions.
- Version 0.3.0 → 0.4.0 with a CHANGELOG entry (server behaviour change; owner publishes).

## Capabilities
### New Capabilities
- `server-instructions`: usage instructions the server sends to every client at initialize — presence, length cap, and the rules they must state.
### Modified Capabilities
- none

## Impact
- Code: `src/index.ts` (`McpServer` options gain `instructions`), `test/server.test.ts` (new describe), `scripts/smoke.mjs` (one assertion), `package.json` (`version`).
- Docs: new `LLM.md`, `README.md` (one line; land after PR #12 and rebase), `CHANGELOG.md`, `AGENTS.md` Key Files row.
- No new dependencies, no config keys, no migrations. `files` in `package.json` already excludes `LLM.md`, so `pack:check` is unaffected.
