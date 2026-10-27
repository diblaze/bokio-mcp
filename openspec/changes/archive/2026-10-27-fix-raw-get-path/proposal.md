# Proposal

Status: done
Issue: diblaze/bokio-mcp#24

## Why
`bokio_raw_get` only adds a leading `/` to `path`, so `..` (also as `%2e%2e` or with backslashes) resolves outside `/v1`, and `?`/`#` in `path` mixes with the separate `params` argument. The host stays Bokio and the token does not leak, but the escape hatch should stay inside the API it advertises.

## What Changes
- `bokio_raw_get` rejects a `path` that contains `..`, `?`, `#`, `%`, `\` or any character outside letters, digits, `/`, `-`, `_`, `.`, `{`, `}`, before any request, with an error that points query values at `params`.
- The `path` parameter description states the allowed form and that query values go in `params`.

## Capabilities
### New Capabilities
### Modified Capabilities
- `bokio-tool-surface`: adds requirement "Raw GET path stays inside the API".

## Impact
- `src/index.ts` `bokio_raw_get` `path` schema only. No new dependency, no config key.
- `test/server.test.ts`: new `raw get path` describe block.
- Fold the delta into `openspec/specs/bokio-tool-surface/spec.md` in the PR.
