# bokio-mcp

[![CI](https://github.com/diblaze/bokio-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/diblaze/bokio-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/bokio-mcp)](https://www.npmjs.com/package/bokio-mcp)

An MCP server for the [Bokio](https://www.bokio.se/) accounting API. Connect it to Claude or any other MCP client and you can ask about your books in plain language: what is on the bank account at a given date, which customer invoices are still unpaid, what the VAT for last quarter adds up to, whether anything has been booked twice.

It is built for small companies and consultants who keep their own books in Bokio. By default it only reads: write tools stay hidden until you turn them on, so it is safe to point at live accounting data.

## What it covers

The server wraps the Bokio API for one company: journal entries, invoices, credit notes, customers, suppliers, supplier invoices, items, uploads, bank payments (read only), chart of accounts, fiscal years and the SIE export.

It also has computed tools that work on the SIE export: balances at a date, a ledger for one account, VAT and profit and loss for a period, open items, possible double bookings, and reconciliation against a bank statement. The server does that arithmetic in whole öre and hands the client finished numbers, so the same question gives the same answer every time.

## Before you start

You need three things:

1. A Bokio private integration token. In Bokio, go to [Integrations](https://app.bokio.se/integrations), create an integration and copy the token. Bokio allows 5,000 requests per company per month and 200 per minute.
2. Your company id. It is in the Bokio URL: `.../companies/<companyId>/...`.
3. Node.js 22 or later.

## Install

The server runs straight from npm, with no clone needed. It speaks MCP over stdio, so your MCP client starts it for you.

Using an AI agent? Paste https://raw.githubusercontent.com/diblaze/bokio-mcp/main/LLM.md into it and ask it to install bokio-mcp.

### Claude Code

```bash
claude mcp add --transport stdio --scope user \
  --env BOKIO_TOKEN=your_token \
  --env BOKIO_COMPANY_ID=your_company_id \
  bokio -- npx -y bokio-mcp
```

### Claude Desktop and other MCP clients

Add this to the client's `mcpServers` config (for Claude Desktop, `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bokio": {
      "command": "npx",
      "args": ["-y", "bokio-mcp"],
      "env": {
        "BOKIO_TOKEN": "your_token",
        "BOKIO_COMPANY_ID": "your_company_id",
        "BOKIO_DOWNLOAD_DIR": "/path/for/downloads",
        "BOKIO_ALLOW_WRITES": ""
      }
    }
  }
}
```

Keep the token out of files you commit or share. Clients that support it, such as Claude Code, can read `${BOKIO_TOKEN}` from your shell environment instead.

### Configuration

| Variable | Required | Purpose |
|-----|----------|---------|
| `BOKIO_TOKEN` | yes, when a tool is called | Private Bearer token |
| `BOKIO_COMPANY_ID` | default company | Used when a tool call leaves out `companyId` |
| `BOKIO_ALLOW_WRITES` | no | `1`, `true`, `yes` or `on` enables write tools; anything else keeps them hidden and blocked |
| `BOKIO_DOWNLOAD_DIR` | recommended | Where SIE, PDF and upload downloads are saved. Without it, downloads go to the server's working directory, and they are rejected when that is `/`, as it often is for Claude Desktop. Paths outside the directory are rejected and existing files are never overwritten |
| `BOKIO_BASE_URL` | no | Defaults to `https://api.bokio.se/v1` |

## Reading and writing

Set `BOKIO_ALLOW_WRITES=1` when you want the server to create or change things in Bokio, and leave it empty the rest of the time. Write tools are marked *(write)* below.

Bank payments are read only on purpose. Creating one would move money once it is signed with BankID, so the server does not offer it.

## Tools

**Company and ledger:** `bokio_company_info`, `bokio_list_fiscal_years`, `bokio_get_fiscal_year`, `bokio_chart_of_accounts`, `bokio_get_account`, `bokio_download_sie`

**Journal:** `bokio_list_journal_entries` (`from`/`to`/`query`), `bokio_get_journal_entry`, `bokio_create_journal_entry` *(write)*, `bokio_reverse_journal_entry` *(write)*

**Invoices:** `bokio_list_invoices`, `bokio_get_invoice`, `bokio_create_invoice` *(write)*, `bokio_update_invoice` *(write)*, `bokio_delete_invoice` *(write)*, `bokio_publish_invoice` *(write)*, `bokio_record_invoice` *(write)*, `bokio_create_invoice_payment` *(write)*, `bokio_download_invoice` (PDF), `bokio_list_invoice_payments`, `bokio_list_invoice_settlements`, `bokio_create_invoice_settlement` *(write)*

**Credit notes:** `bokio_list_credit_notes`, `bokio_get_credit_note`, `bokio_download_credit_note` (PDF), `bokio_create_credit_note` *(write, from an invoice)*, `bokio_update_credit_note` *(write)*, `bokio_publish_credit_note` *(write)*, `bokio_record_credit_note` *(write)*, `bokio_delete_credit_note` *(write, drafts only)*

**Suppliers:** `bokio_list_suppliers`, `bokio_get_supplier`, `bokio_create_supplier` *(write)*, `bokio_update_supplier` *(write)*

**Supplier invoices:** `bokio_list_supplier_invoices`, `bokio_get_supplier_invoice`, `bokio_create_supplier_invoice` *(write)*, `bokio_update_supplier_invoice` *(write)*

**Customers:** `bokio_list_customers`, `bokio_get_customer`, `bokio_create_customer` *(write)*, `bokio_update_customer` *(write)*

**Items:** `bokio_list_items`, `bokio_get_item`, `bokio_create_item` *(write)*, `bokio_update_item` *(write)*

**Uploads:** `bokio_list_uploads`, `bokio_get_upload`, `bokio_upload_file` *(write)*, `bokio_download_upload`

**Bank payments:** `bokio_list_bank_payments`, `bokio_get_bank_payment`. Bokio only returns payments created by the same integration.

**Computed:** `bokio_account_balances`, `bokio_account_ledger`, `bokio_find_duplicates`, `bokio_reconcile_bank` (pass your bank statement as `{date, amount, text}` rows), `bokio_vat_summary` (account totals, not mapped to VAT-return boxes), `bokio_profit_and_loss`, `bokio_open_items` (also works when revenue is booked as manual journal entries instead of through the invoice module). Each call downloads the SIE export for the fiscal years it needs, one request per year. Amounts are in ledger sign, debit positive and credit negative, and a verification cancels out against its `Annullering av …` reversal.

**Anything else:** `bokio_raw_get` sends a GET to any Bokio path.

## Limits

- Journal entries are double entry, so the debit total must equal the credit total.
- Tag groups, projects, journal-entry comments and tags, and invoice attachments have no tools yet. Read them with `bokio_raw_get`.
- Bokio's API reference is at <https://docs.bokio.se> and the OpenAPI specs at <https://github.com/bokio/bokio-api>.

## Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers building from source, running the tests and the smoke check, and what a pull request needs. In short: commits follow [Conventional Commits](https://www.conventionalcommits.org), `pnpm install` sets up git hooks that check formatting and commit messages, and CI has to pass on Node 22 and 24 before a maintainer reviews. Adding a tool has its own checklist in the same file.

Report security issues privately as described in [SECURITY.md](SECURITY.md), not in a public issue. Release notes are in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
