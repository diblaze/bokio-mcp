# Proposal

Status: approved
Issue: diblaze/bokio-mcp#35

## Why
Glama scores the 37 read tools at TDQS A 3.7: Parameters sits at the baseline 3 on almost every tool because descriptions add nothing beyond the schema, and Behavior and Usage lose points for missing paging, result shape and named alternatives. Every client loads every description, so the gain has to come inside an explicit length budget.

## What Changes
- Tool descriptions may run to four sentences, capped at 400 characters each and 14,000 characters for all tools together (writes on).
- Every description names another listed tool as the alternative or next step.
- List tool descriptions state the 100-per-page default, `totalPages`, and the filter fields their `query` accepts, with an example condition.
- Read tools without an output schema, and all write tools, say what they return.
- Computed tool descriptions state per-tool parameter defaults and interplay (date defaults, `from`/`to` with `query`, `lookbackYears`).
- Contributor rule relaxed: shared parameter facts stay in the zod fragment, a fact specific to one tool goes in its description.

## Capabilities
### New Capabilities
### Modified Capabilities
- `tool-definitions`: "Tool descriptions are short plain sentences" becomes four sentences with a character budget; adds named alternatives, list paging/filter statements and stated results.
- `bokio-tool-surface`: adds the existing 100-per-page default that the descriptions now promise.

## Impact
`src/index.ts` descriptions only (no schema, handler or name changes); `test/server.test.ts`; `AGENTS.md`, `CONTRIBUTING.md`. No API, config or dependency change. Tool names unchanged.
