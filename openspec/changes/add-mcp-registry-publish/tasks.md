# Tasks

## 1. Registry identity and metadata (commit `feat(dist): declare MCP Registry name and server.json`)
- [x] 1.1 Add a failing test `test/server.test.ts::distribution > server.json names the published package (Registry name matches the package manifest)`. It reads `package.json` and `server.json` (E16) and asserts: `pkg.mcpName === "io.github.diblaze/bokio-mcp" === sj.name`; `sj.packages` has length 1; `packages[0]` is `{registryType:"npm", identifier: pkg.name, transport:{type:"stdio"}}`; `sj.description.length <= 100` (E9). It proves scenario "Registry name matches the package manifest".
- [x] 1.2 Add a failing test `test/server.test.ts::distribution > server.json version tracks the package (Registry metadata version equals package version)`. It asserts `sj.version === sj.packages[0].version === pkg.version`. It also asserts that `release-please-config.json` `packages["."]["extra-files"]` holds `{type:"json", path:"server.json", jsonpath:"$.version"}` and the same entry with `"$.packages[0].version"`. It proves scenario "Registry metadata version equals package version".
- [x] 1.3 Add a failing test `test/server.test.ts::distribution > server.json lists the configuration variables (Registry metadata lists the documented variables)`. It takes the set of `BOKIO_\w+` names from the `README.md` rows that match ``/^\| `(BOKIO_\w+)`/m`` and asserts it equals the `environmentVariables[].name` set and the set of `process.env.(BOKIO_\w+)` names in `src/*.ts` (reviewer finding). It also asserts that `BOKIO_TOKEN` has `isRequired: true, isSecret: true` and that it is the only entry with `isSecret: true`. It proves scenario "Registry metadata lists the documented variables".
- [x] 1.4 In `package.json`, add `"mcpName": "io.github.diblaze/bokio-mcp"` after `"description"` (E4, E8). Create a new `server.json` (E8, E9, E14) with these fields:
  - `$schema`: `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`
  - `name`: `io.github.diblaze/bokio-mcp`
  - `title`: `bokio-mcp` (not `Bokio`, so the listing does not read as an official Bokio product)
  - `description`: `Bokio accounting API as MCP tools: ledger, invoices, SIE balances, VAT, P&L. Read-only by default.`
  - `repository`: `{url:"https://github.com/diblaze/bokio-mcp", source:"github"}`
  - `version`: `0.5.0`
  - `packages[0]`: `{registryType:"npm", registryBaseUrl:"https://registry.npmjs.org", identifier:"bokio-mcp", version:"0.5.0", transport:{type:"stdio"}, environmentVariables:[...]}`. Give one entry each to `BOKIO_TOKEN` (required, secret), `BOKIO_COMPANY_ID`, `BOKIO_ALLOW_WRITES`, `BOKIO_DOWNLOAD_DIR` and `BOKIO_BASE_URL` (`isRequired:false, isSecret:false`), with descriptions taken from `README.md:67-71`.

  Verify: 1.1 and 1.3 pass, and `pnpm run pack:check` still prints `PACK OK` (E15).
- [x] 1.5 In `release-please-config.json`, add `"extra-files"` with the two json entries from 1.2 to `packages["."]` (E6, E7). Verify: 1.2 passes, and `uvx check-jsonschema --schemafile https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json release-please-config.json` exits 0.
- [x] 1.6 Docs: in `README.md` Install, add one line giving its MCP Registry name `io.github.diblaze/bokio-mcp` (no claim that it is listed; that is only true after the first dispatch). In `AGENTS.md` Key Files, add a `server.json` row: registry metadata, its version is bumped by release-please and it does not ship. Verify: `rg -n 'io.github.diblaze/bokio-mcp' README.md AGENTS.md`

## 2. Registry publish workflow (commit `ci: publish to the MCP Registry on dispatch`)
- [x] 2.1 Check `yq -e '(.on | keys) == ["workflow_dispatch"]' .github/workflows/mcp-registry.yml && ! rg -q 'mcp-publisher' .github/workflows/release-please.yml`. It proves scenario "Release does not publish to the registry by itself".
- [x] 2.2 Check `yq -e '.jobs.publish.if == "github.ref == '"'"'refs/heads/main'"'"'"' .github/workflows/mcp-registry.yml`. It proves scenario "Dispatch from another branch is refused".
- [x] 2.3 Check `yq -e '.permissions == {} and .jobs.publish.permissions["id-token"] == "write"' .github/workflows/mcp-registry.yml && rg -q 'mcp-publisher login github-oidc' .github/workflows/mcp-registry.yml && ! rg -q 'secrets\.' .github/workflows/mcp-registry.yml`. It proves scenario "Publish authenticates without a stored secret".
- [x] 2.4 Check `rg -q 'MCP_PUBLISHER_VERSION: v1\.8\.6' .github/workflows/mcp-registry.yml && rg -q '1fbe93fc0783c2394d8012c8d6e50a59e98cb2cc2d216264cc69f405d0e21340  mcp-publisher.tar.gz" \| sha256sum -c' .github/workflows/mcp-registry.yml && ! rg -q 'latest' .github/workflows/mcp-registry.yml`. It proves scenario "Tampered or unpinned publisher is rejected".
- [x] 2.5 No local check: the registry itself rejects a version npm does not serve (E3), and the workflow has no publish-to-npm step (2.6). Scenario "Unapproved npm version is not listed" is proven by that registry behaviour, not by a grep.
- [x] 2.6 Create a new `.github/workflows/mcp-registry.yml` (E10, E11):
  - `name: Publish to MCP Registry`
  - `on:` mapping with only `workflow_dispatch:` (a scalar has no keys for check 2.1)
  - top-level `permissions: {}`
  - job `publish`: `if: github.ref == 'refs/heads/main'`, `runs-on: ubuntu-24.04` (pinned; also keeps check 2.4's `latest` ban meaningful), `permissions: {contents: read, id-token: write}`, `env: MCP_PUBLISHER_VERSION: v1.8.6`
  - step `actions/checkout@v4` with `persist-credentials: false`
  - step `run: |` with `set -euo pipefail`, then `curl --fail --location --silent --show-error --output mcp-publisher.tar.gz "https://github.com/modelcontextprotocol/registry/releases/download/${MCP_PUBLISHER_VERSION}/mcp-publisher_linux_amd64.tar.gz"`, then `echo "1fbe93fc0783c2394d8012c8d6e50a59e98cb2cc2d216264cc69f405d0e21340  mcp-publisher.tar.gz" | sha256sum -c -`, then `tar xzf mcp-publisher.tar.gz mcp-publisher`
  - step `run: ./mcp-publisher login github-oidc`
  - step `run: ./mcp-publisher publish`

  Add a comment that says to bump the version and the hash together. Verify: `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:1.7.12 -color` passes, and 2.1–2.4 pass.
- [x] 2.7 Docs: in `AGENTS.md`, add a Key Files row for `.github/workflows/mcp-registry.yml`. In the Releases paragraph, add: "after approving on npm, run `gh workflow run mcp-registry.yml --ref main` to list the version in the MCP Registry". Add the same step to `CONTRIBUTING.md` `## Releases` (line 38). Verify: `rg -n 'mcp-registry.yml' AGENTS.md CONTRIBUTING.md`

## 3. Check
- [x] 3.1 `pnpm exec biome ci && pnpm run typecheck && pnpm test && pnpm run build && pnpm run smoke && pnpm run pack:check && docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:1.7.12 && d="$(mktemp -d)" && curl -fsSL -o "$d/p.tgz" https://github.com/modelcontextprotocol/registry/releases/download/v1.8.6/mcp-publisher_linux_amd64.tar.gz && echo "1fbe93fc0783c2394d8012c8d6e50a59e98cb2cc2d216264cc69f405d0e21340  $d/p.tgz" | sha256sum -c - && tar xzf "$d/p.tgz" -C "$d" mcp-publisher && "$d/mcp-publisher" validate server.json`
