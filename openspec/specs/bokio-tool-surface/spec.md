# bokio-tool-surface Specification

## Purpose
Defines which Bokio Company API resources the server exposes as MCP tools, how mutating tools are hidden and blocked unless the operator opts in, how tool inputs are bounded and validated, how file downloads are confined, and what guidance API errors carry.

## Requirements

### Requirement: Mutating tools are hidden and blocked without explicit opt-in
The system SHALL register mutating tools only when the operator has enabled writes, and SHALL refuse any mutating request at the HTTP client when writes are not enabled, regardless of tool annotations.

#### Scenario: Write tools absent in read-only mode
- **GIVEN** the server starts with writes not enabled
- **WHEN** a client lists tools
- **THEN** no mutating tool is present and every listed tool declares it is read-only

#### Scenario: Write request blocked at the client when gate off
- **GIVEN** writes are not enabled
- **WHEN** a mutating request is attempted through the HTTP client
- **THEN** it fails with a message naming the opt-in setting and no network request is made

### Requirement: Credit notes are exposed as tools
The system SHALL provide read tools to list, get and download published credit notes, and gated write tools to create a credit note from an invoice, update, publish, record and delete a draft credit note, with destructive and idempotent hints matching the action.

#### Scenario: Credit note tools registered with correct hints
- **GIVEN** writes are enabled
- **WHEN** a client lists tools
- **THEN** list/get/download credit-note tools are read-only, the update tool is idempotent, the delete tool is destructive, and all write tools are non-read-only

### Requirement: Suppliers and supplier invoices are exposed as tools
The system SHALL provide read tools to list and get suppliers and supplier invoices, and gated write tools to create and update them whose inputs enforce Bokio's required fields and payment-detail variants.

#### Scenario: Supplier bodies validate required fields
- **GIVEN** the supplier and supplier-invoice input schemas
- **WHEN** a body omits the supplier name, or gives payment details of a type without that type's identifier, or omits the supplier reference, invoice date, due date or total amount on a supplier invoice
- **THEN** validation fails, and a body with all required fields passes

### Requirement: Irreversible writes are marked destructive
The system SHALL annotate as destructive every write that cannot be undone through the API: reverse, delete, publish, record, and the supplier-invoice update (Bokio removes line items left out of the body). The supplier-invoice update SHALL NOT accept `uploadRef`, which Bokio's update schema lacks.

#### Scenario: Supplier invoice update replaces line items
- **GIVEN** writes are enabled
- **WHEN** the client lists tools and calls the supplier-invoice update with `uploadRef`
- **THEN** the update, publish and record tools have `destructiveHint` true, the update body schema has no `uploadRef`, and the call with `uploadRef` is rejected without a request

### Requirement: Invoice payments and settlements are exposed as tools
The system SHALL provide read tools to list payments and settlements of an invoice, and a gated write tool to create a settlement whose type is one of the creatable types and whose details match that type.

#### Scenario: Settlement body validates type and details
- **GIVEN** the settlement input schema
- **WHEN** the type is not one of currency, bankFee or paymentServiceFee, or the type is paymentServiceFee without a VAT scheme
- **THEN** validation fails, and a bankFee settlement with date and amount passes

### Requirement: Bank payments are read-only
The system SHALL provide tools to list and get bank payments created by the integration and SHALL NOT provide any tool that creates bank payments, even when writes are enabled.

#### Scenario: No bank payment creation tool exists
- **GIVEN** writes are enabled
- **WHEN** a client lists tools
- **THEN** every bank-payment tool is read-only and no tool creates bank payments

### Requirement: Downloads validate the save path before any network request
The system SHALL resolve and validate the local save path of every download tool (SIE, upload, invoice PDF, credit-note PDF) before contacting Bokio, SHALL reject paths that escape the configured download directory (the working directory when none is configured), and SHALL NOT overwrite an existing file.

#### Scenario: Traversing save path makes no request
- **GIVEN** a download directory is configured
- **WHEN** a download tool is called with a save path that escapes that directory
- **THEN** the tool returns an error naming the directory and no HTTP request is made

#### Scenario: Downloads stay in the working directory by default
- **GIVEN** no download directory is configured
- **WHEN** a save path is absolute or climbs out of the working directory
- **THEN** it is rejected

#### Scenario: Existing file is not overwritten
- **GIVEN** a file already exists at the resolved save path
- **WHEN** a download tool is called with that save path
- **THEN** the tool returns an error, the file is unchanged and no HTTP request is made

#### Scenario: Write bodies match the Bokio request shape
- **GIVEN** writes are enabled
- **WHEN** a settlement is created or a credit note is updated
- **THEN** the settlement is sent as `{type, invoiceSettlementDetails}` and the credit-note update carries the credit note's `id`

### Requirement: List inputs respect Bokio's pagination bounds
The system SHALL reject a page size above 100 before making a request, and SHALL accept a filter query on every list tool whose endpoint supports one.

#### Scenario: pageSize above 100 is rejected before any request
- **GIVEN** any list tool
- **WHEN** it is called with pageSize 101
- **THEN** the call fails validation and no HTTP request is made

### Requirement: API errors carry hints matching Bokio's documented error contract
The system SHALL append to failed-request errors a hint that points 401 to the Bokio Integrations page, explains 403 as missing scope or exhausted monthly quota, and explains 429 as the per-minute rate limit or a concurrent write, without ever including the token.

#### Scenario: 401, 403 and 429 hints name the documented causes
- **GIVEN** Bokio answers 401, 403 or 429
- **WHEN** a request fails
- **THEN** the error mentions the Integrations page for 401, quota for 403, rate limit for 429, and contains no token value

### Requirement: Filters use Bokio's query syntax
The system SHALL combine filter conditions, including the `from`/`to` date bounds on journal entries, with Bokio's `&&` operator.

#### Scenario: Date bounds joined with &&
- **GIVEN** a list call with a raw filter and from/to dates
- **WHEN** the query string is built
- **THEN** the conditions are joined with `&&`, not with the word `and`

### Requirement: Path ids cannot change the request path
The system SHALL accept only plain ids (letters, digits, `-`, `_`) for every id spliced into a request path, including `companyId` from arguments or `BOKIO_COMPANY_ID`, and SHALL reject anything else before any request.

#### Scenario: Path ids cannot change the request path
- **GIVEN** a tool that takes an id
- **WHEN** it is called with an id containing `/`, `?`, `..` or nothing
- **THEN** the tool returns an error and no HTTP request is made

### Requirement: SIE text preview decodes the export's declared encoding
The system SHALL return the SIE export text preview decoded as PC8 (CP437) when the export declares PC8, as UTF-8 when it starts with a byte-order mark, and as Latin-1 otherwise.

#### Scenario: PC8 preview keeps Swedish letters
- **GIVEN** an export declaring PC8 whose account name contains å, ä and ö encoded as CP437 bytes
- **WHEN** a client downloads the export without a save path
- **THEN** the returned text contains the account name with å, ä and ö intact

#### Scenario: BOM preview decodes as UTF-8
- **GIVEN** an export starting with a UTF-8 byte-order mark whose account name contains å, ä and ö
- **WHEN** a client downloads the export without a save path
- **THEN** the returned text contains the account name with å, ä and ö intact and no byte-order mark

#### Scenario: Undeclared preview decodes as Latin-1
- **GIVEN** an export without a PC8 declaration or byte-order mark whose account name contains å, ä and ö as Latin-1 bytes
- **WHEN** a client downloads the export without a save path
- **THEN** the returned text contains the account name with å, ä and ö intact

### Requirement: Raw GET path stays inside the API
The system SHALL accept a raw GET path only when it is built from letters, digits, `/`, `-`, `_`, `.`, `{` and `}` and contains no `..`, and SHALL reject any other path before any request with an error that says query values belong in the separate query parameters.

#### Scenario: Raw path leaving the API is rejected
- **GIVEN** a company id is configured
- **WHEN** the raw GET tool is called with `/../x`, `/companies/{companyId}/../../x`, `/%2e%2e/x` or `/..\x`
- **THEN** the tool returns an error and no HTTP request is made

#### Scenario: Raw path carrying a query is rejected
- **GIVEN** a company id is configured
- **WHEN** the raw GET tool is called with `/a?b=1` or `/a#f`
- **THEN** the tool returns an error that names the query parameters argument, and no HTTP request is made

#### Scenario: Raw path with the company placeholder resolves
- **GIVEN** the company id is `co`
- **WHEN** the raw GET tool is called with `/companies/{companyId}/tag-groups` and query parameters `{ page: 2 }`
- **THEN** exactly one GET is sent to `<base>/companies/co/tag-groups?page=2`

### Requirement: List tools default to 100 items per page
The system SHALL request 100 items per page from Bokio when a paged list tool is called without `pageSize`, and the page size given otherwise.

#### Scenario: List call without pageSize asks for 100
- **GIVEN** a paged list tool and a stubbed Bokio API
- **WHEN** it is called without `pageSize`
- **THEN** the request carries `pageSize=100`
