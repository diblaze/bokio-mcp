# Design
## Context
- E1 `.github/workflows/release-please.yml:51-52` — `# Trusted publishing (OIDC): no token. The owner approves the staged version on npm with 2FA.` / `- run: npm stage publish` — a version is not live on npm when the release job ends.
- E2 `.github/workflows/release-please.yml:3-5` — `on:` / `push:` / `branches: [main]` — the release workflow runs on push only. A release and a tag are created at the same moment the version is staged.
- E3 registry `internal/validators/registries/npm.go@v1.8.6:65` — `requestURL := pkg.RegistryBaseURL + "/" + url.PathEscape(pkg.Identifier) + "/" + url.PathEscape(pkg.Version)`. Lines 89-94 then check `npmResp.MCPName == serverName`. Line 141: `version '%s' was not found (status: 404) ... publish version '%s' before registering it`. The registry reads the published version document, so the publish must run after approval.
- E4 `curl https://registry.npmjs.org/bokio-mcp/latest` returned `{"version":"0.5.0","mcpName":null}`. The current release has no `mcpName`, so the first listing needs a new release.
- E5 `package.json:2-3` — `"name": "bokio-mcp",` / `"version": "0.5.0",`. Line 4 `"description"` is 102 characters, which is over the registry limit (E9). `server.json` therefore gets its own shorter description.
- E6 `release-please-config.json:62-64` — `"packages": {` / `".": { "release-type": "node" }` — has no `extra-files` yet.
- E7 release-please `docs/customizing.md:215-223` — `"extra-files": [ { "type": "json", "path": "path/to/file.json", "jsonpath": "$.json.path.to.field" } ]` — JSON fields are bumped through jsonpath.
- E8 registry `docs/modelcontextprotocol-io/package-types.mdx@v1.8.6:42` — `The mcpName property **MUST** match the server name from server.json`. Lines 20-37 give the npm `server.json` shape (`$schema` `.../schemas/2025-12-11/server.schema.json`, `name`, `title`, `description`, `version`, `packages[{registryType, identifier, version, transport:{type:"stdio"}}]`).
- E9 `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json` — `ServerDetail.description.maxLength` is `100`, and `Package.required` is `["registryType","identifier","transport"]`. Registry `generic-server-json.md@v1.8.6:60-66` shows `environmentVariables[{name, description, isRequired, isSecret}]` and `repository {url, source:"github"}`.
- E10 registry `docs/modelcontextprotocol-io/github-actions.mdx@v1.8.6:14-17` — "pin `mcp-publisher` to a specific release ... do not switch back to the mutable `releases/latest` URL". Line 32 `id-token: write # Required for OIDC authentication`, line 86 `./mcp-publisher login github-oidc`, and line 95 `./mcp-publisher publish`.
- E11 `registry_1.8.6_checksums.txt` (release v1.8.6, 2026-10-27) — `1fbe93fc0783c2394d8012c8d6e50a59e98cb2cc2d216264cc69f405d0e21340  mcp-publisher_linux_amd64.tar.gz`.
- E12 registry `docs/reference/cli/commands.md@v1.8.6:235-241` — `mcp-publisher validate [file]` — "Validate a `server.json` file without publishing".
- E13 registry `docs/modelcontextprotocol-io/versioning.mdx@v1.8.6:32` — "The version string **MUST** be unique for each publication ... cannot be changed."
- E14 Environment variables the server reads: `src/bokio.ts:16` `process.env.BOKIO_DOWNLOAD_DIR`, `:28` `BOKIO_BASE_URL`, `:41` `BOKIO_ALLOW_WRITES`, `:49` `BOKIO_COMPANY_ID`, `:58` `BOKIO_TOKEN`. They match the README table at `README.md:65-71`, for example `| \`BOKIO_TOKEN\` | yes, when a tool is called | Private Bearer token |`.
- E15 `scripts/pack-check.mjs:7` — `/^(dist\/|README\.md$|LICENSE$|package\.json$)/` — `package.json` already ships, and `server.json` must not.
- E16 `test/server.test.ts:351-356` — `describe("distribution"` reads `package.json` with `readFileSync`. This is the house pattern for manifest checks.
- E17 `openspec/specs/release-automation/spec.md` "Non-releasable commits open no release" — `docs`, `chore`, `ci` and similar types do not release, so `mcpName` must ship in a `feat`/`fix` commit.
- E18 `curl 'https://registry.modelcontextprotocol.io/v0/servers?search=bokio'` returned `{"servers":[],"metadata":{"count":0}}`, so the server is not listed today.

## Goals / Non-Goals
**Goals:**
- List `io.github.diblaze/bokio-mcp` in the official registry, and keep its version equal to the npm version.
- Publish with no stored secret, and only after the owner approves the version on npm.

**Non-Goals:**
- Automatic registry publish after npm approval (polling or webhook). Reopen when the manual dispatch is forgotten more than once.
- Running `mcp-publisher validate` in CI. Reopen when `server.json` changes for reasons other than release-please version bumps.
- Cosign signature verification. A SHA-256 pin recorded in the repo is immutable and needs no extra action. Reopen when the publisher version gets bumped often.
- Listings on other catalogues (Smithery, Glama, awesome lists). Reopen on request.
- An MCPB bundle or a remote transport. Reopen when users ask for a non-npm install.

## Decisions
- **Trigger: `workflow_dispatch` only, with a job `if: github.ref == 'refs/heads/main'`.** The owner already approves each version on npm by hand (E1), so starting the registry run is one more click (`gh workflow run`). A publish in the release job, or on `release: published`, would fire before approval and fail the 404 check (E2, E3). Polling npm in the release job would hold a runner for up to 6 h while waiting for a human, so it lost. Re-running is also free after a registry preview data reset.
- **Version sync: release-please `extra-files`** with jsonpaths `$.version` and `$.packages[0].version` (E6, E7). `server.json` on `main` then always holds the real version, a test can assert it, and `validate` runs on the committed file. The alternative was patching the version with jq at publish time (E10:89-92). It lost because the committed file would go stale, and the stale file would be what the test reads.
- **Publisher install: pinned `v1.8.6` plus `sha256sum -c` against E11's hash.** This is shorter than the cosign step that the docs show (E10), equally strong, and needs no extra action. The runner is pinned `ubuntu-24.04` amd64, so one hash is enough.
- **`server.json` keeps its own description of 100 characters or fewer** (E5, E9). The `environmentVariables` come from E14, and only `BOKIO_TOKEN` is `isRequired` and `isSecret`.
- **Commit type `feat(dist)`** for `mcpName` + `server.json`, so release-please cuts the release that carries `mcpName` (E4, E17). The workflow and docs go in a `ci:` commit.
- **Tests go in the existing `distribution` describe** (E16). No new test file.

## Risks / Trade-offs
- The first dispatch before the next release is approved fails with the E3 404, or with "missing required 'mcpName'" on 0.5.0. This is expected. The docs say to dispatch after approval.
- Re-dispatching an already listed version fails (E13). This is harmless.
- The registry is in preview, and its data may be reset (E10:6-8). If so, re-dispatch.
- `v1.8.6` may become too old for the registry's OIDC audience ("invalid audience", E10 troubleshooting). Bump the version and hash together.

## Open Questions
- none
