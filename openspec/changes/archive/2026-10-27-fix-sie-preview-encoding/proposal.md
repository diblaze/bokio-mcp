# Proposal

Status: done
Issue: diblaze/bokio-mcp#22

## Why
`bokio_download_sie` without `savePath` decodes the export as Latin-1, but Bokio exports `#FORMAT PC8` (CP437), so å/ä/ö in the text preview arrive as control characters. The computed tools already decode correctly; the preview should match.

## What Changes
- The SIE text preview decodes the export the same way the parser does: CP437 when it declares PC8, UTF-8 when it starts with a byte-order mark, Latin-1 otherwise.

## Capabilities
### New Capabilities
### Modified Capabilities
- `bokio-tool-surface`: adds requirement "SIE text preview decodes the export's declared encoding".

## Impact
`src/index.ts` (`bokio_download_sie` handler, `./sie.js` import), `test/server.test.ts` (one test). No API, config or dependency change. Saved files (`savePath`) are unchanged: raw bytes.
