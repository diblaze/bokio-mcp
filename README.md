# bokio-mcp

[![CI](https://github.com/diblaze/bokio-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/diblaze/bokio-mcp/actions/workflows/ci.yml)

Model Context Protocol server for the [Bokio](https://www.bokio.se/) accounting API.

- **Auth:** private integration token, one per company, created by each user in Bokio. OAuth (public integrations) is a possible future addition.
- **Scope:** journal entries, invoices, credit notes, customers, suppliers, supplier invoices, items, uploads, bank payments (read-only), chart of accounts, fiscal years, SIE export.
- **Safety:** all write operations are blocked unless `BOKIO_ALLOW_WRITES=1`.

For small companies and consultants who keep their own books in Bokio. Read-only by default, so it is safe to point at live accounting data.

## Prerequisites

1. A Bokio private integration token: **Bokio → [Integrations](https://app.bokio.se/integrations) → Create integration → copy token**. Limits: 5,000 requests per company per month, 200 per minute.
2. Your company id — copy it from the Bokio browser URL (`.../companies/<companyId>/...`).
3. Node.js ≥ 22.

## Quick start

The server runs straight from npm, no clone needed:

```bash
npx -y bokio-mcp
```

It speaks MCP over stdio, so you normally let your MCP client start it.

### Claude Code

```bash
claude mcp add --transport stdio --scope user \
  --env BOKIO_TOKEN=your_token \
  --env BOKIO_COMPANY_ID=your_company_id \
  bokio -- npx -y bokio-mcp
```

### Claude Desktop and other MCP clients

Add to the client's `mcpServers` config (Claude Desktop: `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bokio": {
      "command": "npx",
      "args": ["-y", "bokio-mcp"],
      "env": {
        "BOKIO_TOKEN": "your_token",
        "BOKIO_COMPANY_ID": "your_company_id",
        "BOKIO_ALLOW_WRITES": ""
      }
    }
  }
}
```

Leave `BOKIO_ALLOW_WRITES` empty for read-only. Set it to `1` only when you intend to change the books.

> Keep the token out of files you commit or share. Clients that support it (such as Claude Code) can expand `${BOKIO_TOKEN}` from your shell environment instead.

## Environment

| Var | Required | Purpose |
|-----|----------|---------|
| `BOKIO_TOKEN` | yes (at call time) | Private Bearer token |
| `BOKIO_COMPANY_ID` | default company | Omit a tool's `companyId` to use this |
| `BOKIO_ALLOW_WRITES` | no | `1`/`true`/`yes`/`on` enables writes; otherwise blocked |
| `BOKIO_DOWNLOAD_DIR` | recommended | Directory for SIE, PDF and upload downloads. Without it, downloads are confined to the server's working directory (for Claude Desktop that is often `/`, so set this). Paths outside are rejected; existing files are never overwritten |
| `BOKIO_BASE_URL` | no | Defaults to `https://api.bokio.se/v1` |

## Tools

**Meta:** `bokio_company_info`, `bokio_list_fiscal_years`, `bokio_get_fiscal_year`, `bokio_chart_of_accounts`, `bokio_get_account`, `bokio_download_sie`

**Journal:** `bokio_list_journal_entries` (`from`/`to`/`query`), `bokio_get_journal_entry`, `bokio_create_journal_entry` *(write)*, `bokio_reverse_journal_entry` *(write)*

**Invoices:** `bokio_list_invoices`, `bokio_get_invoice`, `bokio_create_invoice` *(write)*, `bokio_update_invoice` *(write)*, `bokio_delete_invoice` *(write)*, `bokio_publish_invoice` *(write)*, `bokio_record_invoice` *(write)*, `bokio_create_invoice_payment` *(write)*, `bokio_download_invoice` (PDF), `bokio_list_invoice_payments`, `bokio_list_invoice_settlements`, `bokio_create_invoice_settlement` *(write)*

**Credit notes:** `bokio_list_credit_notes`, `bokio_get_credit_note`, `bokio_download_credit_note` (PDF), `bokio_create_credit_note` *(write, from an invoice)*, `bokio_update_credit_note` *(write)*, `bokio_publish_credit_note` *(write)*, `bokio_record_credit_note` *(write)*, `bokio_delete_credit_note` *(write, drafts only)*

**Suppliers:** `bokio_list_suppliers`, `bokio_get_supplier`, `bokio_create_supplier` *(write)*, `bokio_update_supplier` *(write)*

**Supplier invoices:** `bokio_list_supplier_invoices`, `bokio_get_supplier_invoice`, `bokio_create_supplier_invoice` *(write)*, `bokio_update_supplier_invoice` *(write)*

**Customers:** `bokio_list_customers`, `bokio_get_customer`, `bokio_create_customer` *(write)*, `bokio_update_customer` *(write)*

**Items:** `bokio_list_items`, `bokio_get_item`, `bokio_create_item` *(write)*, `bokio_update_item` *(write)*

**Uploads:** `bokio_list_uploads`, `bokio_get_upload`, `bokio_upload_file` *(write)*, `bokio_download_upload`

**Bank payments (read-only):** `bokio_list_bank_payments`, `bokio_get_bank_payment`. Bokio only returns payments created by the same integration. Creating payments is deliberately not exposed: they move money once signed with BankID.

**Computed (read-only, from the SIE export):** `bokio_account_balances`, `bokio_account_ledger`, `bokio_find_duplicates`, `bokio_reconcile_bank` (pass your bank statement as `{date, amount, text}` rows), `bokio_vat_summary` (account totals only, not mapped to VAT-return boxes), `bokio_profit_and_loss`. The server downloads the SIE export of each fiscal year involved (one request per year), parses it and does the arithmetic in whole öre, so answers are exact and repeatable. Amounts are in ledger sign: debit positive, credit negative. A verification and its `Annullering av …` reversal cancel out.

**Escape hatch:** `bokio_raw_get` — GET any Bokio path (read-only).

## Notes

- Journal entries are double-entry: debit total must equal credit total.
- SIE download is handy for reconciling the ledger against another system.
- Not wrapped yet: tag groups, projects, journal-entry comments and tags, invoice attachments. Read them with `bokio_raw_get`.
- API reference: <https://docs.bokio.se> · specs: <https://github.com/bokio/bokio-api>
- Building from source and pull requests: [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md). Changes: [CHANGELOG.md](CHANGELOG.md).
