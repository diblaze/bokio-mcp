# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## 0.3.0 — unreleased

### Added
- Computed read-only tools, calculated in code (whole öre) from the SIE export so the client never adds up rows itself: `bokio_account_balances` (balance per account at a date), `bokio_account_ledger` (one account's lines with running balance), `bokio_find_duplicates` (likely double bookings) `bokio_reconcile_bank` (bank statement rows against the ledger by exact amount within a day tolerance), `bokio_vat_summary` (VAT and sales account totals for a period, no tax-return boxes) and `bokio_profit_and_loss` (result per BAS class or account). Annulled verifications are recognised and net to zero.

## 0.2.0 — unreleased

### Added
- Credit notes: list, get, PDF download, create from an invoice, update, publish, record, delete (drafts).
- Suppliers and supplier invoices: list, get, create, update. Updating a supplier invoice replaces its line items and is marked destructive.
- Invoice PDF download, invoice payments list, invoice settlements list and create.
- Bank payments: list and get, read-only. Creating payments is deliberately not exposed.
- `npx -y bokio-mcp` install, `claude mcp add` and Claude Desktop setup in the README.
- LICENSE, CONTRIBUTING.md, SECURITY.md, this changelog.

### Changed
- `pageSize` is capped at 100, matching Bokio.
- `query` filter on chart of accounts, items and uploads.
- Error hints name Bokio's documented causes: Integrations page for 401, scope or monthly quota for 403, rate limit or concurrent write for 429.
- The server reports the version from `package.json`.
- Publish and record tools are marked destructive (they cannot be undone through the API), so MCP clients ask before running them.
- Path ids (and `companyId`) must be plain ids; values with `/`, `?` or `..` are rejected before any request.
- Downloads are always confined: to `BOKIO_DOWNLOAD_DIR`, or the working directory when it is unset.

### Fixed
- Filters (including `from`/`to` on journal entries) were joined with `and`, which Bokio ignores, so date-bounded lists came back empty. They now use `&&`.
- The server did not start when launched through a symlink, which is how npm and npx run installed bins.
- Downloads now check `savePath` before calling Bokio, so a rejected path costs no request.
- `dist/index.js` is executable after build.
- Download tools no longer overwrite existing files.

## 0.1.0

Initial release: journal entries, invoices, customers, items, uploads, chart of accounts, fiscal years and SIE export, with writes behind `BOKIO_ALLOW_WRITES`.
