# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/). Entries from 0.4.0 on are generated from commit messages by release-please.

## [0.7.0](https://github.com/diblaze/bokio-mcp/compare/v0.6.0...v0.7.0) (2026-10-31)


### Added

* **tools:** computed tools state defaults, siblings ([3f27637](https://github.com/diblaze/bokio-mcp/commit/3f2763714d88fdfbd7f9ec3209c903e96e664b55))
* **tools:** get and download tools state results ([2114456](https://github.com/diblaze/bokio-mcp/commit/2114456101891dbdfeaba80fca35ee643233835f))
* **tools:** list tools state filters and paging ([0f71072](https://github.com/diblaze/bokio-mcp/commit/0f71072b5828fce04deab6558a0429c4ab85ab29))
* **tools:** write tools state result and next tool ([c3f9480](https://github.com/diblaze/bokio-mcp/commit/c3f94809752df3d9cf2a68d71f5070081abee2cd))

## [0.6.0](https://github.com/diblaze/bokio-mcp/compare/v0.5.0...v0.6.0) (2026-10-28)


### Added

* **cache:** add read cache cleared by writes ([79258c0](https://github.com/diblaze/bokio-mcp/commit/79258c02500e318e34bc3edc0403aebd0e481ce8))
* **dist:** declare MCP Registry name and server.json ([ee070a1](https://github.com/diblaze/bokio-mcp/commit/ee070a1d569c20fd346290141000bda4762f0ba2))
* **sie:** reuse fiscal years and exports 5 min ([2eedf62](https://github.com/diblaze/bokio-mcp/commit/2eedf623a4a20e8386b7eb4b4c89747fd215aa4f))


### Fixed

* **raw:** keep raw_get path inside /v1 ([d4ab0c3](https://github.com/diblaze/bokio-mcp/commit/d4ab0c32e56a67ec9d0b1c63aa0603ae01c06577))
* **sie:** decode preview by declared encoding ([da5ab88](https://github.com/diblaze/bokio-mcp/commit/da5ab88d4931e52a62f037e5b23b22797865430a))

## [0.5.0](https://github.com/diblaze/bokio-mcp/compare/v0.4.0...v0.5.0) (2026-10-26)


### Added

* **tools:** describe every tool parameter ([f00d130](https://github.com/diblaze/bokio-mcp/commit/f00d1301b1b71e7317c2f6bd3ac83e4675dcc8d5))
* **tools:** rewrite tool descriptions for agents ([c00e008](https://github.com/diblaze/bokio-mcp/commit/c00e008b2094c3a5c8b53661025084e0c95a6644))

## [0.4.0](https://github.com/diblaze/bokio-mcp/compare/v0.3.0...v0.4.0) (2026-10-21)


### Added

* **server:** send usage instructions at initialize ([8e7fbfa](https://github.com/diblaze/bokio-mcp/commit/8e7fbfab2dba59c5de84d9d887954b0039881c1d))

## 0.3.0 — 2026-10-21

### Added
- Computed read-only tools, calculated in code (whole öre) from the SIE export so the client never adds up rows itself: `bokio_account_balances` (balance per account at a date), `bokio_account_ledger` (one account's lines with running balance), `bokio_find_duplicates` (likely double bookings) `bokio_reconcile_bank` (bank statement rows against the ledger by exact amount within a day tolerance), `bokio_vat_summary` (VAT and sales account totals for a period, no tax-return boxes) `bokio_profit_and_loss` (result per BAS class or account) and `bokio_open_items` (unpaid receivables or supplier debt with age, by exact-amount matching on the ledger). Annulled verifications are recognised and net to zero.

## 0.2.0 — not published (shipped in 0.3.0)

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
