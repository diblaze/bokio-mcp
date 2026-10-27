# Tasks
## 1. Decode the SIE preview by its declared encoding
- [x] 1.1 Failing test `test/server.test.ts::SIE preview keeps Swedish letters` proves scenario "PC8 preview keeps Swedish letters": new `describe("SIE preview")` block; set `BOKIO_TOKEN`/`BOKIO_COMPANY_ID` as `mockBokio` does, `vi.stubGlobal("fetch", …)` returning `new Response(buf)` where `buf` is `Buffer.concat` of ASCII `#FORMAT PC8\r\n#RAR 0 20260101 20261231\r\n#KONTO 1930 "F` + bytes `0x94` (ö) + `retagskonto V` + `0x84` (ä) + `st ` + `0x86` (å) + `s"\r\n` (E5, E6); call `bokio_download_sie` with `{ fiscalYearId: "fy1" }`; expect text to contain `Företagskonto Väst ås`; `vi.unstubAllGlobals()`, `client.close()`. Invented data only.
- [x] 1.1b Test `test/server.test.ts::SIE preview decodes a BOM export as UTF-8` proves scenario "BOM preview decodes as UTF-8": same stub, `buf` = bytes `EF BB BF` + UTF-8 `#FORMAT PC8\r\n#KONTO 1930 "Företagskonto Väst ås"\r\n`; expect text to start with `#FORMAT` and contain the name (E2).
- [x] 1.1c Test `test/server.test.ts::SIE preview decodes an undeclared export as Latin-1` proves scenario "Undeclared preview decodes as Latin-1": same stub, `buf` = Latin-1 bytes of `#KONTO 1930 "Företagskonto Väst ås"\r\n`; expect text to contain the name (E2).
- [x] 1.2 In `src/index.ts`: add `decodeSie` to the `./sie.js` import (E3); replace `buf.toString("latin1")` with `decodeSie(buf)` at line 380 (E1, E2); verify: `pnpm exec vitest run test/server.test.ts` passes 1.1.

## 2. Check
- [x] 2.1 `pnpm exec biome ci && pnpm run typecheck && pnpm test && pnpm run build && pnpm run smoke && pnpm run pack:check`
