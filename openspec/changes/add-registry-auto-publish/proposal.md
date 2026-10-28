# Proposal

Status: done
Issue: diblaze/bokio-mcp#33

## Why
Each release needs a hand-run `gh workflow run mcp-registry.yml --ref main` after the npm approval, and it is easy to forget. The owner wants the registry publish to start by itself on every release and then wait for the owner's approval.

## What Changes
- The `Publish to MCP Registry` workflow also starts when a GitHub Release is published. It runs from the release tag, so `server.json` carries the released version.
- The publish job runs in the GitHub environment `mcp-registry`, which has the owner as required reviewer. Every run waits for approval, including manual ones.
- Manual dispatch from `main` stays as a fallback. Dispatch from any other ref is still skipped.
- Docs: the release step in AGENTS.md and CONTRIBUTING.md becomes "approve on npm, then approve the pending `mcp-registry` deployment".

## Capabilities
### New Capabilities
- none
### Modified Capabilities
- `mcp-registry-listing`: "Registry publish runs only on maintainer request from the default branch" is removed. The new "Registry publish starts on release and waits for maintainer approval" replaces it, carries over its branch and OIDC scenarios, and reverses its release scenario. In "Only versions live on npm are listed", the trigger is now any registry run, not only a dispatch.

## Impact
- Edited: `.github/workflows/mcp-registry.yml` (the `on.release` trigger, the job `if`, `environment`, and the header comment), `AGENTS.md`, `CONTRIBUTING.md`.
- Repo setting outside the diff: the environment `mcp-registry` with required reviewer `diblaze`, and deployment refs `main` (branch) and `v*` (tag). The owner creates it before merge.
- No new secret and no new dependency. `release-please.yml` and the npm trusted-publisher identity do not change.
