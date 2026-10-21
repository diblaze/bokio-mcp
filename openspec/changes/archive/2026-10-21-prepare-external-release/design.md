# Design

## Context
- E1 `src/index.ts:19` — `export const server = new McpServer({ name: "bokio-mcp", version: "0.1.0" });` — version duplicated from package.json; bump would need two edits.
- E2 `src/index.ts:60-62` — `const isWrite = description.includes("WRITE.");` / `if (isWrite && !writesAllowed()) return;` — write tools are hidden by the `WRITE.` token; new write tools follow it.
- E3 `src/index.ts:66-67` — `destructiveHint: /reverse|delete/.test(name), idempotentHint: /update/.test(name)` — hints derived from the name; new tools must be named `*_delete_*` / `*_update_*` accordingly.
- E4 `src/index.ts:92` — `const pageSize = z.number().int().positive().max(200)` — Bokio caps pageSize at 100 (E20).
- E5 `src/index.ts:196-202` — `bokio_chart_of_accounts` sends `query: paging(a)`; the endpoint only accepts `query` (E20).
- E6 `src/index.ts:469` / `src/index.ts:502` — `{ companyId, page, pageSize }` on list_items / list_uploads; both endpoints accept `query` (E20).
- E7 `src/index.ts:219-223` and `src/index.ts:543-546` — `const buf = await bokioDownload(...)` runs before `downloadTarget(a.savePath)`; a traversing path costs a rate-limited request before failing.
- E8 `src/index.ts:556` — `.describe("e.g. /companies/{companyId}/credit-notes")` — example path becomes a first-class tool.
- E9 `src/index.ts:97-163` — typed body pattern: `z.object({...}).catchall(z.unknown())`, `export const customerBody` / `invoiceBody` consumed by `test/server.test.ts:66`.
- E10 `src/bokio.ts:55`, `:84`, `:103` — `"Bokio -> Installningar -> API Tokens"` ×3; `src/bokio.ts:86` — `403: " — token lacks permission for this resource"`; `src/bokio.ts:90` — `429: " — rate limited (Bokio free tier: 5000 requests/month)"`.
- E11 `src/bokio.ts:114-118` — `if (WRITE_METHODS.has(method) && !writesAllowed()) throw new Error(\`write blocked: ...requires BOKIO_ALLOW_WRITES=1\`)` — the single choke point every new write tool routes through.
- E12 `src/bokio.ts:152` — `export async function bokioDownload(path, query): Promise<Buffer>` — binary GET used for SIE/uploads; reused for PDFs.
- E13 `test/server.test.ts:17` — `expect(tools.length).toBe(31);` — count assertion; `test/server.test.ts:64-79` body-schema test pattern.
- E14 `test/bokio.test.ts:47-60` — hint test maps `[429, /rate limited/]`; needs 403 and Integrations wording.
- E15 `scripts/smoke.mjs:7` — `spawn("node", ["dist/index.js"], ...)` — does not prove the exec bit; `:68-78` `required` / `forbidden` lists.
- E16 `package.json` — `"version": "0.1.0"`, `"build": "tsc"`, `"files": ["dist","README.md"]`, `"bin": {"bokio-mcp": "dist/index.js"}`, `"prepublishOnly": "npm run build"`, no `repository`/`homepage`/`bugs`.
- E17 `README.md:11` — "Built for driving a Swedish AB's books alongside a YNAB budget"; `:15` — "Bokio → Inställningar → API Tokens (free up to 5,000 requests/month)"; `:40` — `"args": ["/home/<user>/git/bokio-mcp/dist/index.js"]`; `:53` — "matching how the YNAB MCP token is handled"; `:85` — "[Preview] Bokio endpoints (supplier-invoices, suppliers, tag-groups) are not yet wrapped"; `:88-96` — Contributing section.
- E18 `AGENTS.md:7` — "registers all 31 tools", "Built to drive a Swedish AB's books alongside a YNAB budget"; `AGENTS.md` "Do not publish to npm without explicit ask (tracked as issue #1)".
- E19 Repo state (inspected 2026-10-21): `stat dist/index.js` → `-rw-rw-r--`; `npm pack --dry-run` → 6 files, no LICENSE; `LICENSE`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md` absent; `gh repo view` → `licenseInfo: null`; `npm view bokio-mcp` → 404 (name free).
- E20 Bokio Company API OpenAPI, `github.com/bokio/bokio-api` branch `v1`, `api-specification/company-api.yaml`, last commit 2026-10-16 — `servers: https://api.bokio.se/v1`; every list endpoint: `pageSize integer max=100 default=25`; `chart-of-accounts GET q=['query']`; `items GET q=[page,pageSize,query]`; `uploads GET q=[page,pageSize,query]`; `journal-entries GET q=[...,'tagId']`; `invoices GET q=[...,'projectId']`.
- E21 E20 → `POST /companies/{companyId}/bank-payments` description: "In order to submit the transaction to the bank, the signatory for the account needs to login to the Bokio application and sign the payment with their BankID"; `GET /bank-payments` scope `bank-payments:read-limited` "created by the integration".
- E22 E20 → `invoiceSettlementWrite`: `required: [type, invoiceSettlementDetails]`, `type enum [currency, bankFee, paymentServiceFee]`; `standardSettlementDetails` `{date, sumBaseCurrency}` `additionalProperties: false`; `paymentServiceFeeSettlementDetails` adds required `vatScheme enum [domestic, eu, nonEu, vatExempt]`.
- E23 E20 → `supplier`: `required: [name]`, `paymentDetails oneOf` bankgiro{bankgiroNumber} | plusgiro{plusgiroNumber} | transfer{clearingNumber, accountNumber} | internationalPayment{iban, bic}, discriminated by `type`; `supplierAddress` all-optional.
- E24 E20 → `supplierInvoiceCreate` / `supplierInvoiceUpdate`: `required: [invoiceDate, dueDate, totalAmount, supplierRef]`, `supplierRef.id` required, `uploadRef {id}`, `lineItems` (Preview).
- E25 E20 → `creditNote`: `required: [id, currency, creditDate, dueDate, lineItems]`, `status enum [draft, published]`; `PUT /credit-notes/{id}` "Only draft credit notes can be updated"; `DELETE` "Only draft credit notes can be deleted"; `POST /invoices/{invoiceId}/credit` has no request body, returns the draft credit note.
- E26 https://docs.bokio.se/reference/rate-limits (updated 2026-09-03) — "at most 200 requests in a rolling 60-second window per bearer token"; "Private integrations can send up to 5,000 requests per company each month"; 429 `rate-limit-exceeded` / `concurrency-limit-exceeded`; 403 `quota-exceeded`.
- E27 https://docs.bokio.se/reference/authentication-for-private-integrations — token comes from the Integrations page `https://app.bokio.se/integrations` → "Create integration" → copy token; `401` on missing/expired token.
- E28 https://docs.bokio.se/reference/pagination — "pageSize ... default value is 25, and the maximum value is 100".
- E29 Issue diblaze/bokio-mcp#1 — "Add `chmod +x dist/index.js` to the build so the installed bin is executable", "switch README install to `npx -y bokio-mcp`".
- E30 Claude Code MCP docs (`docs.claude.com/en/docs/claude-code/mcp.md`) — `claude mcp add --env KEY=value --transport stdio <name> -- npx -y <pkg>`; `mcpServers` JSON `{ "command": "npx", "args": ["-y", "<pkg>"] }` is the shape Claude Desktop reads.
- E31 `tsconfig.json` — `"rootDir": "src"` → a static `import pkg from "../package.json"` fails compilation; `createRequire(import.meta.url)("../package.json")` resolves from both `src/` (tsx) and `dist/`.

### Endpoint → tool map (all under `/companies/{companyId}`, doc URL = `https://docs.bokio.se/reference/<slug>`)
| Tool | Method + path | slug | Gate |
|---|---|---|---|
| bokio_list_credit_notes | GET /credit-notes | list-credit-notes-v1 | read |
| bokio_get_credit_note | GET /credit-notes/{creditNoteId} | get-credit-note-v1 | read |
| bokio_download_credit_note | GET /credit-notes/{creditNoteId}/download (PDF, published only) | download-credit-note | read |
| bokio_create_credit_note | POST /invoices/{invoiceId}/credit | post-invoices-invoiceid-credit | WRITE |
| bokio_update_credit_note | PUT /credit-notes/{creditNoteId} | update-credit-note-v1 | WRITE, idempotent |
| bokio_publish_credit_note | POST /credit-notes/{creditNoteId}/publish | publish-credit-note-v1 | WRITE |
| bokio_record_credit_note | POST /credit-notes/{creditNoteId}/record | record-credit-note-with-id | WRITE |
| bokio_delete_credit_note | DELETE /credit-notes/{creditNoteId} | delete-credit-note-with-id | WRITE, destructive |
| bokio_download_invoice | GET /invoices/{invoiceId}/download (PDF, published only) | download-invoice | read |
| bokio_list_invoice_payments | GET /invoices/{invoiceId}/payments | get-invoice-payments | read |
| bokio_list_invoice_settlements | GET /invoices/{invoiceId}/settlements | get-invoice-settlements | read |
| bokio_create_invoice_settlement | POST /invoices/{invoiceId}/settlements | post-invoice-settlement | WRITE |
| bokio_list_suppliers | GET /suppliers | get-suppliers | read |
| bokio_get_supplier | GET /suppliers/{supplierId} | get-supplier-by-id | read |
| bokio_create_supplier | POST /suppliers | post-supplier | WRITE |
| bokio_update_supplier | PUT /suppliers/{supplierId} | put-supplier | WRITE, idempotent |
| bokio_list_supplier_invoices | GET /supplier-invoices | get-supplier-invoices | read |
| bokio_get_supplier_invoice | GET /supplier-invoices/{supplierInvoiceId} | get-supplier-invoice-by-id | read |
| bokio_create_supplier_invoice | POST /supplier-invoices | post-supplier-invoice | WRITE |
| bokio_update_supplier_invoice | PUT /supplier-invoices/{supplierInvoiceId} | put-supplier-invoice | WRITE, idempotent |
| bokio_list_bank_payments | GET /bank-payments | get-bank-payments-limited | read |
| bokio_get_bank_payment | GET /bank-payments/{bankPaymentId} | get-bank-payments-bank-payment-id | read |
| (none, by design) | POST /bank-payments, POST /bank-payments/bulk | post-bank-payment | excluded (E21) |

## Goals / Non-Goals
**Goals:**
- Every non-preview Company API resource has at least list + get tools; the gaps named in the request (credit notes, suppliers, supplier invoices, settlements, bank payments) get full read coverage and the write actions a bookkeeper needs.
- Existing tools match the 2026-10-16 spec (pageSize cap, `query` params, hint text).
- `npx -y bokio-mcp` works for a stranger with only a Bokio token and company id; README/SECURITY/CONTRIBUTING/CHANGELOG carry no personal context.
- Close #1 (E29).

**Non-Goals:**
- `npm publish` and enabling GitHub private vulnerability reporting — owner manual steps after merge (branch protection, npm 2FA). Reopen when the release commit is on `main`.
- OAuth / public-integration auth — reopen when a user cannot create a private integration token for their company.
- Delete tools for customers, items, suppliers, supplier invoices, invoice payments, settlements — reopen when a user asks; `bokio_delete_credit_note` is included only because a wrong draft credit note has no other API exit (E25).
- Record tools for invoice payments/settlements, invoice attachments, invoice line-item append, journal-entry comments/tags, tag-groups, projects (Preview), supplier-invoice uploads/line-items (Preview) — reads reachable via `bokio_raw_get`; reopen on request or when Preview flags drop.
- `tagId` (journal entries) and `projectId` (invoices, supplier invoices) query params — reopen with tag-groups/projects support.
- `tags` on journal-entry items — reopen with tag-groups support.
- Retry/back-off on 429 — reopen when a user reports hitting the 200/60 s limit (E26) in normal use.
- Windows CI runner — `chmod +x` in build is POSIX; reopen if a Windows contributor appears.

## Decisions
- Reuse `tool()` + `bokioRequest` + `okStructured`/`listOutput` for all 22 tools; no new abstraction (E2, E9, E11). Alternative (generic CRUD factory) lost: hides the `WRITE.`/name conventions that AGENTS.md documents.
- Write bodies as exported zod objects with `.catchall(z.unknown())` (E9) so tests can `safeParse` them; `supplierBody.paymentDetails` is `z.discriminatedUnion("type", ...)` mirroring E23; `settlementBody` uses flat `type/date/sumBaseCurrency/vatScheme` inputs with a `.refine` (vatScheme required iff `paymentServiceFee`) and the handler nests them into `invoiceSettlementDetails` (E22) — simpler for an LLM than a oneOf. `creditNoteBody` omits `id`; the handler injects `creditNoteId` (E25).
- Bank payments: GET only. POST moves money after BankID signing (E21); the request forbids it. The server.test asserts no tool name matches `create_bank_payment` and all `bank_payment` tools are read-only.
- Download tools: one `saveDownload(path, savePath)` helper that calls `downloadTarget` before `bokioDownload` (E7, E12), used by SIE, upload, invoice PDF, credit-note PDF. Alternative (leave order) lost: wastes quota and leaks timing of a rejected path.
- Hints (E10) fixed to E26/E27 wording: 401/no-token → Integrations page; 403 → "token lacks scope or monthly quota (5,000 req/company) exhausted"; 429 → "rate limited (200 req/60 s) or concurrent write — wait, then retry". A single `TOKEN_HELP` const replaces the three copies. `statusHint` already appends the response body (which carries Bokio's `code`), so no parsing added.
- `pageSize.max(100)` (E4, E28); `paging()` default 100 stays (equals the max). `bokio_chart_of_accounts` shape becomes `{ companyId, query }` (E5); `query` added to list_items/list_uploads (E6).
- Version: `createRequire(import.meta.url)("../package.json").version` (E1, E31); a test compares `client.getServerVersion().version` to package.json. Alternative (bump two strings) lost: drifts silently.
- Build: `"build": "tsc && chmod +x dist/index.js"` (E29); smoke spawns `dist/index.js` directly (E15) so CI fails if the bit is lost. Alternative (`node -e chmodSync`) lost: longer, same portability.
- `files` stays `["dist","README.md"]`; npm always includes LICENSE and package.json. CHANGELOG/SECURITY/CONTRIBUTING are repo-only (lean tarball). `repository`/`homepage`/`bugs` added so the npm page links back.
- README: install section becomes `npx -y bokio-mcp` + `claude mcp add --env BOKIO_TOKEN=... --env BOKIO_COMPANY_ID=... --transport stdio bokio -- npx -y bokio-mcp` + Claude Desktop `mcpServers` JSON (E30); the clone/build block moves to CONTRIBUTING.md together with the current Contributing section (E17). One line: "OAuth (public integrations) is a possible future addition; today each user creates a private integration token for their own company."
- `.env.example` is not readable under this plan's rules; the executor verifies it holds placeholders only before the docs commit.

## Risks / Trade-offs
- 22 new tools inflate `tools/list` for clients with small context; mitigated by read-only default (30 tools) and short descriptions.
- Bokio marks supplier-invoice `lineItems` as Preview (E24); kept as `z.array(z.record(...)).optional()` so a field change does not break validation.
- `chmod` in `build` breaks on Windows shells; CI is ubuntu (E15 context) — accepted, listed as Non-Goal.
- No live-API test; schemas are modelled from the published OpenAPI only. `bokio_raw_get` remains the escape hatch if a field name differs.
- Hint strings are user-visible text; the mocked-fetch test pins them so wording changes are deliberate.

## Open Questions
- Resolved: LICENSE copyright holder = `diblaze` (owner, at approval).
- Resolved: `bokio_delete_credit_note` ships, destructive-hinted, write-gated (owner, at approval).
