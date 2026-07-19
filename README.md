# bokio-mcp

[![CI](https://github.com/diblaze/bokio-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/diblaze/bokio-mcp/actions/workflows/ci.yml)

Model Context Protocol server for the [Bokio](https://www.bokio.se/) accounting API.

- **Auth:** private self-serve Bearer token (single company). No OAuth.
- **Scope:** journal entries, invoices, customers, items, uploads, chart of accounts, fiscal years, SIE export.
- **Safety:** all write operations are blocked unless `BOKIO_ALLOW_WRITES=1`.

Built for driving a Swedish AB's books alongside a YNAB budget. Read-only by default so it is safe to point at live accounting data.

## Prerequisites

1. A Bokio private API token: **Bokio → Inställningar → API Tokens** (free up to 5,000 requests/month).
2. Your company id — copy it from the Bokio browser URL (`.../companies/<companyId>/...`).
3. Node.js ≥ 22.13 and [pnpm](https://pnpm.io) (`corepack enable`).

## Install & build (local)

```bash
git clone https://github.com/diblaze/bokio-mcp.git ~/git/bokio-mcp
cd ~/git/bokio-mcp
pnpm install
pnpm run build     # → dist/
pnpm test          # mocked unit tests
pnpm run smoke     # MCP handshake, asserts tools register
pnpm run lint      # biome check (lint + format)
```

## Configure in Claude Code

Add to `~/.claude.json` under `mcpServers` (or use `claude mcp add`):

```json
{
  "mcpServers": {
    "bokio": {
      "command": "node",
      "args": ["/home/denis/git/bokio-mcp/dist/index.js"],
      "env": {
        "BOKIO_TOKEN": "${BOKIO_TOKEN}",
        "BOKIO_COMPANY_ID": "your_company_id",
        "BOKIO_ALLOW_WRITES": ""
      }
    }
  }
}
```

Leave `BOKIO_ALLOW_WRITES` empty for read-only. Set it to `1` only when you intend to mutate the books.

> Do not hardcode the token in a committed file. Use `${BOKIO_TOKEN}` env expansion, matching how the YNAB MCP token is handled.

## Environment

| Var | Required | Purpose |
|-----|----------|---------|
| `BOKIO_TOKEN` | yes (at call time) | Private Bearer token |
| `BOKIO_COMPANY_ID` | default company | Omit a tool's `companyId` to use this |
| `BOKIO_ALLOW_WRITES` | no | `1`/`true`/`yes`/`on` enables writes; otherwise blocked |
| `BOKIO_DOWNLOAD_DIR` | no | Confines SIE/upload downloads to this dir (rejects path traversal) |
| `BOKIO_BASE_URL` | no | Defaults to `https://api.bokio.se/v1` |

## Tools

**Meta:** `bokio_company_info`, `bokio_list_fiscal_years`, `bokio_get_fiscal_year`, `bokio_chart_of_accounts`, `bokio_get_account`, `bokio_download_sie`

**Journal:** `bokio_list_journal_entries` (`from`/`to`/`query`), `bokio_get_journal_entry`, `bokio_create_journal_entry` *(write)*, `bokio_reverse_journal_entry` *(write)*

**Invoices:** `bokio_list_invoices`, `bokio_get_invoice`, `bokio_create_invoice` *(write)*, `bokio_update_invoice` *(write)*, `bokio_delete_invoice` *(write)*, `bokio_publish_invoice` *(write)*, `bokio_record_invoice` *(write)*, `bokio_create_invoice_payment` *(write)*

**Customers:** `bokio_list_customers`, `bokio_get_customer`, `bokio_create_customer` *(write)*, `bokio_update_customer` *(write)*

**Items:** `bokio_list_items`, `bokio_get_item`, `bokio_create_item` *(write)*, `bokio_update_item` *(write)*

**Uploads:** `bokio_list_uploads`, `bokio_get_upload`, `bokio_upload_file` *(write)*, `bokio_download_upload`

**Escape hatch:** `bokio_raw_get` — GET any Bokio path (read-only).

## Notes

- Journal entries are double-entry: debit total must equal credit total.
- SIE download is great for reconciling the AB ledger against an external budget.
- `[Preview]` Bokio endpoints (supplier-invoices, suppliers, tag-groups) are not yet wrapped; reach them via `bokio_raw_get`.
- API reference: <https://docs.bokio.se> · specs: <https://github.com/bokio/bokio-api>

## Contributing

`main` is protected — external changes land via pull request.

1. Fork, branch, commit.
2. Ensure `pnpm exec biome ci`, `pnpm run typecheck`, `pnpm test`, `pnpm run build`, and `pnpm run smoke` all pass (CI runs the same on Node 22).
3. Open a PR against `main`. CI must be green and a maintainer (@diblaze, per `CODEOWNERS`) must approve before merge.

Toolchain: TypeScript + pnpm, [Biome](https://biomejs.dev) for lint/format, [Vitest](https://vitest.dev) for tests.
