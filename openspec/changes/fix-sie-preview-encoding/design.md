# Design
## Context
- E1 `src/index.ts:380` — `return ok(buf.toString("latin1").slice(0, 4000));` — the only text decode of a download in `src/` (`rg 'toString\("' src` hits only this and `src/sie.ts:48-49`); root cause.
- E2 `src/sie.ts:46-53` — `export function decodeSie(buf: Buffer): string {` … `if (!/^#FORMAT\s+PC8\b/m.test(latin)) return latin;` — BOM→UTF-8, PC8→CP437 table, else Latin-1; already used by `parseSie` (`src/sie.ts:80`).
- E3 `src/index.ts:21-32` — `import { allLines, balancesAt, … } from "./sie.js";` — `decodeSie` not yet imported.
- E4 `openspec/specs/bokio-computed-tools/spec.md:35` — "SHALL decode text as PC8 (CP437) when the export declares PC8, as UTF-8 when it starts with a byte-order mark, and as Latin-1 otherwise" — the rule exists for parsing only; the preview is unspecified.
- E5 `test/server.test.ts:435-447` — `function mockBokio()` returns `new Response(sieFor(id))` from a JS string — UTF-8 encoded, so it cannot carry CP437 bytes; the new test stubs `fetch` with a byte `Buffer`.
- E6 `src/bokio.ts:169` — `return Buffer.from(await res.arrayBuffer());` — preview receives raw bytes.

## Goals / Non-Goals
**Goals:**
- Preview text decoded with `decodeSie` (E2), same rule as E4.

**Non-Goals:**
- Slicing on bytes instead of characters — reopen when a preview must end on a line boundary.
- Re-encoding files written via `savePath` — reopen if a user asks for UTF-8 files; raw bytes are the SIE contract.

## Decisions
- Replace `buf.toString("latin1")` with `decodeSie(buf)` at E1 and add it to the E3 import — reuses the tested decoder; a local CP437 table lost (duplicate). E1, E2, E3.
- Spec the behaviour under `bokio-tool-surface` (the tool's contract), not `bokio-computed-tools` (the preview computes nothing). E4.
- Test builds its own byte fixture instead of reusing `mockBokio`/`sieFor` — they emit UTF-8 strings (E5). Fixture names are invented.

## Open Questions
