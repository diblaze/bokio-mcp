## ADDED Requirements

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
