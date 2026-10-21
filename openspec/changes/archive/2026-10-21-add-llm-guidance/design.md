# Design

## Context
- E1 `src/index.ts:36` — `export const server = new McpServer({ name: "bokio-mcp", version });` — only place the server is built; second constructor argument is unused today.
- E2 `node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.d.ts:13-15` — `Optional instructions describing how to use the server and its features. … instructions?: string;` — `ServerOptions.instructions` exists in the installed SDK 1.29.0; `server/index.js:279` spreads it into the initialize result (`...(this._instructions && { instructions: this._instructions })`).
- E3 `node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.d.ts:165-167` — `After initialization has completed, this may be populated with information about the server's instructions. getInstructions(): string | undefined;` — the in-memory test client can read them.
- E4 `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts:24` — `constructor(serverInfo: Implementation, options?: ServerOptions);` — `McpServer` forwards the options.
- E5 `src/index.ts:79-81` — `const isWrite = description.includes("WRITE."); if (isWrite && !writesAllowed()) return;` — write tools are not registered at all in read-only mode; a client sees no sign of them.
- E6 `src/index.ts:87` — `destructiveHint: /reverse|delete|publish|record|update_supplier_invoice/.test(name)` — irreversible writes flagged destructive.
- E7 `src/index.ts:375` — `const SIGN = "Amounts in ledger sign: debit positive, credit negative.";` — sign rule already phrased once; reuse the wording.
- E8 `src/index.ts:340-353` — `Download + parse the SIE export of each fiscal year touching [from, to] (or the given id).` / `path: \`${base}/fiscal-years\`` — every computed call lists years (unless an id is given) and downloads one export per year.
- E9 `src/bokio.ts:90-95` — `the monthly quota (5,000 requests per company) is used up` / `rate limited (200 requests per 60 s)` — the limits, already in the error hints.
- E10 `src/index.ts:536-537` — `bokio_vat_summary … Account totals only: does not map to tax-return boxes.` — VAT caveat.
- E11 `src/index.ts:1182-1183` — `"bokio_raw_get", "GET an arbitrary Bokio API path (read-only escape hatch). {companyId} is substituted."`.
- E12 `src/index.ts:109-111` — `const companyId = idParam.optional().describe("Bokio company id. Defaults to BOKIO_COMPANY_ID if omitted.");`.
- E13 `src/sie.ts:117-118` — `/** "Annullering av V7: ..." whose lines negate V7 cancels both. */ export function markAnnulments` — annulment rule.
- E14 `README.md:94` — `bokio_open_items (works when revenue is booked as manual journal entries, not only through the invoice module)` — invoice list may be empty for such companies.
- E15 `README.md:15-17` — `Bokio → Integrations … → Create integration → copy token. Limits: 5,000 requests … 200 per minute.` / `Your company id — copy it from the Bokio browser URL (.../companies/<companyId>/...)` / `Node.js ≥ 22.` — setup facts for `LLM.md`.
- E16 `README.md:31-35` — `claude mcp add --transport stdio --scope user --env BOKIO_TOKEN=your_token --env BOKIO_COMPANY_ID=your_company_id bokio -- npx -y bokio-mcp` — Claude Code install; `README.md:60` — `Clients that support it (such as Claude Code) can expand ${BOKIO_TOKEN} from your shell environment instead.`
- E17 `README.md:40-58` — Claude Desktop `mcpServers` JSON with `BOKIO_ALLOW_WRITES: ""`; `README.md:69` — `BOKIO_DOWNLOAD_DIR … for Claude Desktop that is often /, so set this`.
- E18 `README.md:19-27` — `## Quick start … It speaks MCP over stdio, so you normally let your MCP client start it.` — anchor for the agent line on `main`.
- E19 PR #12 (`docs/readme-flow`, OPEN, MERGEABLE) diff — renames `## Quick start` → `## Install`, `## Environment` → `### Configuration`, adds `## Before you start`; same anchor sentence survives: `It speaks MCP over stdio, so your MCP client starts it for you.`
- E20 `scripts/smoke.mjs:61-66` — `const init = await send(1, "initialize", {...}); if (!init.result) fail(...)` — initialize result already captured; one more assertion fits.
- E21 `test/server.test.ts:116-122` — `async function connect() { … client.connect(clientTransport) … return client; }` — shared helper for a new describe.
- E22 `test/server.test.ts:350-357` — `describe("distribution") … client.getServerVersion()?.version` — precedent for asserting initialize metadata.
- E23 `package.json:2,10-13` — `"version": "0.3.0"`, `"files": ["dist", "README.md"]` — `LLM.md` excluded from the tarball by the whitelist; `scripts/pack-check.mjs:7` regex also rejects it, so the two agree.
- E24 `npm view bokio-mcp version` → `0.3.0`; `CHANGELOG.md:5` — `## 0.3.0 — unreleased` (stale label). Next version must be 0.4.0.
- E25 `AGENTS.md` › For AI Agents — `Bump version in package.json only (the server reads it at startup) and add a CHANGELOG.md entry.` / Coding standard — `Test names end with the spec scenario name in parentheses.` / `Don't: put real accounting data, company ids, org numbers, names or amounts anywhere`.
- E26 `src/bokio.ts:88-89` — `case 401: return \` — auth failed; check BOKIO_TOKEN (${TOKEN_HELP})\`` — troubleshooting text for `LLM.md`.
- E27 `src/bokio.ts:48-51` — `resolveCompanyId … throw new Error("companyId required: pass it or set BOKIO_COMPANY_ID")`.
- E28 `biome.json:9` — `"includes": ["src/**", "test/**", "scripts/**"]` — Markdown is not linted; `LLM.md` needs no formatter run.
- E29 Owner request: "the MCP should instruct the LLM how to use the MCP correctly. But also a LLM.md for easy setup in README.md 'paste this link into your LLM and let it install it for you'".

## Goals / Non-Goals
**Goals:**
- Every client receives the usage rules at initialize (E1, E2) and a test plus the smoke check prove it (E3, E20).
- A user can paste one URL into an assistant and get bokio-mcp installed read-only, verified, without the token leaking into a committed file (E29, E16, E17).

**Non-Goals:**
- `llms.txt` (llmstxt.org) — reopen when a second LLM-facing document exists or a client asks for site-level discovery; today `LLM.md` is the single document.
- Different instructions for write mode — reopen when write-mode clients misuse a specific write tool; the hidden-tool rule (E5) already covers the read-only case.
- Shipping `LLM.md` in the npm tarball — reopen if a client installs from npm offline and needs the guide; it is fetched from GitHub (E23).
- Reworking tool descriptions — the instructions reference them; reopen when a description contradicts the instructions.

## Decisions
- Instructions as one `const INSTRUCTIONS` string in `src/index.ts`, passed as `new McpServer({ name, version }, { instructions: INSTRUCTIONS })` (E1, E2, E4). Lost: separate `src/instructions.ts` (one string does not justify a module); a Markdown file read at runtime (would have to enter `files`, E23, and adds I/O before the handshake).
- Content is a compressed restatement of facts already in code: E5, E6, E7, E8, E9, E10, E11, E12, E13, E14. Cap 2,000 characters, asserted in the test — every client pays these tokens every session. Lost: full README-style guidance.
- Test reads `client.getInstructions()` (E3) in a new `describe` using `connect()` (E21), modelled on E22. Smoke asserts `init.result.instructions` is a non-empty string (E20) so the built binary over stdio is covered, not only the in-memory server.
- `LLM.md` at repo root, written to the agent in the imperative: ask for token and company id (E15), never echo or commit the token (E16), detect the client — Claude Code → `claude mcp add` with `${BOKIO_TOKEN}` expansion (E16); Claude Desktop → `claude_desktop_config.json` per OS (E17); other clients → the same `mcpServers` JSON — set `BOKIO_DOWNLOAD_DIR` (E17), leave `BOKIO_ALLOW_WRITES` unset unless asked, verify with `bokio_company_info`, troubleshoot Node ≥ 22 (E15), 401 (E26), missing or wrong company id (E27). Placeholders only (E25).
- README link uses the raw URL `https://raw.githubusercontent.com/diblaze/bokio-mcp/main/LLM.md`: an agent fetching it gets Markdown, not the GitHub HTML shell. Lost: the `blob/main` URL (human-friendly, but fetch tools must then strip page chrome).
- README line lands after PR #12 merges; this branch rebases and places the line directly under the stdio sentence in `## Install` (E19). On `main` today the same sentence sits under `## Quick start` (E18); the task names the sentence, not the heading, so the edit survives either way.
- Version 0.3.0 → 0.4.0 and a `## 0.4.0 — unreleased` CHANGELOG block (E24, E25): a new initialize field is a visible server behaviour change. Lost: folding into 0.3.0 — npm already has 0.3.0.
- No new capability for `LLM.md` or the README line: documentation, not system behaviour. Covered by task-level checks (placeholder grep, link grep) only.

## Risks / Trade-offs
- Clients differ in whether they surface `instructions` to the model (Claude Code and Claude Desktop do; others may ignore it). Mitigation: the same rules stay in tool descriptions (E7, E10, E11); the instructions add, never replace.
- A stale instruction misleads every session. Mitigation: facts are copied from code constants and descriptions; the test pins the key phrases so renaming a tool breaks the test.
- `LLM.md` cannot be tested end to end (needs a live client and token). Mitigation: placeholder grep, and the verify step is a read-only call.
- Rebase conflict with PR #12 on `README.md`. Mitigation: merge order fixed in tasks; the edit is one line anchored on a sentence present in both versions.
- `CHANGELOG.md:5` labels 0.3.0 "unreleased" while npm has 0.3.0 (E24): outside this change; see Open Questions.

## Open Questions
- Fix the stale `## 0.3.0 — unreleased` label in `CHANGELOG.md` in the same commit as the 0.4.0 entry (npm shows 0.3.0 published, E24)? Default: yes, one word, same commit; say no to leave it.
- Add `llms.txt` (llmstxt.org) as well? Recommendation: skip (YAGNI) — one document, linked from README; reopen per Non-Goals.
- Raw URL vs `blob/main` URL in the README line? Default raw (see Decisions); switch if the owner prefers the link to render on GitHub when a human clicks it.

## Decisions (owner, 2026-10-21)
- Approved. README link: raw URL. llms.txt: skip. CHANGELOG: fix the 0.3.0 "unreleased" label in the 0.4.0 commit.
