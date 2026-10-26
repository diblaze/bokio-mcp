# Design
## Context
- E1 `src/index.ts:118` — `const idParam = z.string().regex(ID_PATTERN, …)` has no `.describe()`. This is why every `get_*` tool sits at 50% coverage.
- E2 `src/index.ts:119-121` — `companyId = idParam.optional().describe("Bokio company id. Defaults to BOKIO_COMPANY_ID if omitted.")`. The pattern to copy: one fragment, described once.
- E3 `src/index.ts:122-135` — `page`, `pageSize`, `query` are already described, so the `list_*` tools sit at 100% coverage.
- E4 `src/index.ts:383` — `const isoDay = z.iso.date();` has no description. `from`/`to` are undescribed on every computed tool.
- E5 `src/index.ts:336` — `savePath: z.string().optional()`, and likewise `:792`, `:864`, `:1185`, all undescribed. The behaviour lives in `saveDownload` (`:282-288`): `already exists; choose a new savePath` and `Wrote ${buf.length} bytes to ${target}`.
- E6 `src/index.ts:292` — `"Retrieve company information."`; `:1067` — `"List customers."`. These are the Glama worst cases (2.5, 2.0).
- E7 `src/index.ts:483` — the `bokio_reconcile_bank` description runs to five sentences.
- E8 `src/index.ts:89` — `const isWrite = description.includes("WRITE.");`. Gating and annotations hang on this token, so it must stay.
- E9 `src/index.ts:102-104` — `outputSchema` is set only when one is given. `listOutput` (`:74-79`) has undescribed fields.
- E10 `src/index.ts:610` — `from: z.string().optional(), to: z.string().optional()` on journal entries, undescribed. `:1167-1168` — upload `description`/`journalEntryId` are undescribed.
- E11 `src/bokio.ts:92-93` — `" — not found; verify the id (list the collection first)"`. The not-found behaviour already exists, so the descriptions only need to point at the list tool.
- E12 `tdqs lint --command "node dist/index.js"` on `origin/main` (7250de4) — `37 tools · 0 errors, 10 warnings, 32 notes`. The warnings are 9× `undocumented-parameters` (<50%) and 1× `shadow-candidate` (`bokio_reconcile_bank` vs `bokio_download_sie`).
- E13 [TDQS spec](https://github.com/glama-ai/tool-definition-quality-score/blob/main/README.md) `README.md:321` — `expensive >= 2 * cheap && expensive - cheap >= 4`; `:325` — `zero-argument tools qualify against any sibling costing 4 or more`.
- E14 [TDQS spec](https://github.com/glama-ai/tool-definition-quality-score/blob/main/README.md) `README.md:290` — `0.6 × mean(TDQS) + 0.4 × min(TDQS)`. The worst tool matters.
- E15 [TDQS spec](https://github.com/glama-ai/tool-definition-quality-score/blob/main/README.md) `README.md:183` — coverage `> 80%` means `the baseline is 3`. `:185` — a bare `{"type": "object"}` `relieves it of nothing`. `:194` — `No credit for repeating what the schema or annotations already state`.
- E16 `mcp-tdqs dist/scoreServer-*.js:1167-1170` — `new StdioClientTransport({ args, command, stderr: "ignore" })` passes no env. SDK `client/stdio.js:67-68` — `env: { ...getDefaultEnvironment(), ... }`. So `BOKIO_ALLOW_WRITES` never reaches the server, which explains why the write-surface run listed 37 tools. `env BOKIO_ALLOW_WRITES=1 node dist/index.js` works, because `env` is spawned as the executable.
- E17 `mcp-tdqs dist/index.d.ts:535` — `lintServer({ serverName, tools })`; `:551` — `parseToolDefinitions(input: unknown)`. Both are pure library calls, with no spawn and no key.
- E18 `mcp-tdqs dist/scoreServer-*.js:1013-1024` — an `undocumented-parameters` finding fires when coverage `< 80`; `:1046-1047` — `shadow-candidate` has `severity: "warning"`.
- E19 `mcp-tdqs package.json` — deps `@modelcontextprotocol/sdk ^1.30.0`, `zod ^4.5.4`; `pnpm-lock.yaml:495,1444` — the repo has `sdk@1.29.0`, `zod@4.4.3`.
- E20 `test/server.test.ts:7` — `process.env.BOKIO_ALLOW_WRITES = "1"` is set before import; `:16-17` — `listTools()` / `toBe(60)`.
- E21 `.github/workflows/ci.yml:49-50` — `pnpm test` already runs on Node 22 and 24.
- E22 `README.md:79-104` — tool names only, no descriptions.
- E23 `CONTRIBUTING.md:28` — the "Adding a tool:" checklist line; `AGENTS.md:60-81` — "Adding or changing a tool" and Testing Requirements; `AGENTS.md:95` — the dev deps line.
- E24 `src/index.ts:385` — `SIGN = "Amounts in ledger sign: debit positive, credit negative."` is a shared sentence used by seven computed tools.

## Goals / Non-Goals
**Goals:**
- 100% parameter coverage on all 60 tools. Most of it comes from the shared fragments (E1, E4, E5).
- 1–3 plain sentences per tool, inline, readable in `src/index.ts`. The first sentence is verb + resource. Then, where it applies: the sibling to use instead, the return shape, and the behaviour annotations cannot carry (not-found E11, file location E5, rate cost).
- A deterministic regression guard on every PR.

**Non-Goals:**
- Output schemas for passthrough `get_*`/`company_info`/`chart_of_accounts`/`raw_get`. A bare object earns nothing (E15), and the real Bokio shapes are not modelled. Reopen when a tool's Bokio response shape is typed anyway, for example for a computed tool.
- Field `.describe()`s on the existing computed-tool output schemas. Those tools are already A-tier (3.6–4.4). Reopen when `tdqs score` shows Completeness < 3 on one.
- `tdqs score` in CI or as a pnpm script. It needs a key, costs money and is nondeterministic. Reopen when Glama's published score diverges from the lint-clean state and a repeatable manual run is wanted.
- Removing the `shadow-candidate` warnings. They are structural (E13): any tool with a required nested array, such as reconcile rows or write bodies, costs ≥ 4 against the cost-0 `list_*` tools. Reopen when a coherence run on Glama raises `Shadowing Risk`.
- Changing the server INSTRUCTIONS or README tool list (E22).

## Decisions
- Describe shared facts once, in the fragments. Add one described id fragment per resource, for example `const invoiceId = idParam.describe("Invoice id from bokio_list_invoices.")`, reused by every tool of that resource. Also describe `isoDay`, an `account` fragment (`BAS account number; see bokio_chart_of_accounts`) and a `savePath` fragment (inside BOKIO_DOWNLOAD_DIR or the working directory, never overwrites). Why: one edit lifts most tools (E1–E5), and nothing repeats per tool. Lost: per-call inline `.describe()` strings, which duplicate text and drift.
- Descriptions stay inline in `tool(...)` calls. There is no descriptions file, so a reader sees the text next to the handler. Keep `SIGN` (E24) but count it as one of the three sentences. Move reconcile's "at most two decimals" / "outflow negative" into the `rows` schema (E7), and do the same elsewhere when a sentence describes a single parameter.
- The lint runs in vitest through the library (`parseToolDefinitions` + `lintServer`, E17) on the writes-on in-memory surface (E20). It fails on `severity === "error"`, on any warning other than `shadow-candidate`, and on any tool below 100% coverage. Why: it needs no build, has no env pass-through problem (E16), and already runs in CI (E21). The 60-tool surface is a superset of the 37 read tools, and their per-tool definitions are identical. Lost: the CLI `tdqs lint --fail-on warning` as a CI step. The structural shadow warnings (E13) would fail it permanently, and it needs the `env` workaround for writes (E16). It also stands in for a hand-written "every param has a description" test, so there is no duplicate check.
- Pin `mcp-tdqs` exactly (`0.2.0`), as a dev dependency only. Its newer sdk/zod install as its own copies, and runtime deps are not bumped (E19).
- Shouting-word and sentence-count checks are one small test. Sentences are counted as matches of `/[.!?](\s|$)/` after removing `WRITE.`, so descriptions avoid "e.g." and use "such as" instead.

## Risks / Trade-offs
- Rewriting the A-tier computed tools down to three sentences may cost Glama points there. Mitigation: only move parameter facts into the schema, and keep the facts themselves.
- The lint proves structure, not quality. The real score only shows after Glama re-scores, because the hash changes on every definition ([TDQS spec](https://github.com/glama-ai/tool-definition-quality-score/blob/main/README.md), inputHash).
- Coherence remains capped by tool count: 60 tools with writes, or 37 without, is "26+ too many". That is out of scope.

## Open Questions
- none. Lint as vitest test or CLI step in CI: the owner chose the vitest test at plan approval (see Decisions).
- Schema tightening is out of scope: journal-entry `from`/`to` stay `z.string()` and upload `journalEntryId` stays `z.string()`, only described, so no input that worked before is rejected.
