# Proposal

Status: approved
Issue: diblaze/bokio-mcp#26

## Why
bokio-mcp is missing from the official MCP Registry: a search for "bokio" returns `{"servers":[],"metadata":{"count":0}}`. The repo has also dropped out of Google results, and another repo uses the same name. A registry listing under `io.github.diblaze/bokio-mcp` makes the server findable and ties the name to this repo and npm package.

## What Changes
- `package.json` gets `"mcpName": "io.github.diblaze/bokio-mcp"`, so the next published npm version proves ownership to the registry. It lands as a `feat` commit so that it triggers a release.
- New `server.json` describes the server for the registry: name, title, description, repository, version, the npm package with stdio transport, and the five `BOKIO_*` environment variables, with `BOKIO_TOKEN` marked secret.
- release-please also bumps both version fields in `server.json` with every release.
- New workflow `Publish to MCP Registry` that only a maintainer starts (manual dispatch from `main`), after approving the staged npm version. It installs a pinned `mcp-publisher` that is checked against a SHA-256 hash, logs in with GitHub OIDC and publishes `server.json`.
- Docs: README gets one line about the registry name. AGENTS.md gets Key Files rows and a release step. CONTRIBUTING.md "Releases" gets the dispatch step.

## Capabilities
### New Capabilities
- `mcp-registry-listing`: the package's registry identity, the server metadata it publishes, and how and when a version reaches the official MCP Registry.
### Modified Capabilities
- none

## Impact
- New: `server.json`, `.github/workflows/mcp-registry.yml`.
- Edited: `package.json` (`mcpName`), `release-please-config.json` (`extra-files`), `test/server.test.ts` (three tests in `distribution`), `README.md`, `AGENTS.md`, `CONTRIBUTING.md`.
- The tarball does not change shape. `server.json` does not ship, and `package.json` already does.
- No runtime dependency and no secret. The registry login uses the job's OIDC token (`id-token: write`).
- Owner steps (not tasks): merge the 0.x release PR, approve it on npm, then `gh workflow run mcp-registry.yml --ref main`.
