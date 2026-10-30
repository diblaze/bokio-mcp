## MODIFIED Requirements

### Requirement: Tool descriptions are short plain sentences
The system SHALL describe every tool in at most four sentences and at most 400 characters, not counting the `WRITE.` marker, and all listed tool descriptions together SHALL total at most 14,000 characters. The first sentence SHALL say what the tool does. No description SHALL contain the shouting words IMPORTANT, MUST, NEVER, ALWAYS or NOTE. Every write tool SHALL keep the `WRITE.` marker.

#### Scenario: Descriptions stay short and plain
- **GIVEN** the server with writes enabled
- **WHEN** a client lists tools
- **THEN** every description, with `WRITE.` removed, has at most four sentences and at most 400 characters
- **AND** the descriptions of all listed tools total at most 14,000 characters
- **AND** no description contains a shouting word
- **AND** every tool with `readOnlyHint` false contains `WRITE.`

## ADDED Requirements

### Requirement: Descriptions name an alternative tool
The system SHALL name, in every tool description, at least one other listed tool to use instead or next.

#### Scenario: List tools name an alternative
- **GIVEN** the server with writes enabled
- **WHEN** a client lists tools
- **THEN** every tool with a `query` input names another listed `bokio_*` tool in its description

#### Scenario: Tools with a result schema name an alternative
- **GIVEN** the server with writes enabled
- **WHEN** a client lists tools
- **THEN** every read tool with an output schema names another listed `bokio_*` tool in its description

#### Scenario: Every read tool names an alternative
- **GIVEN** the server with writes enabled
- **WHEN** a client lists tools
- **THEN** every tool with `readOnlyHint` true names another listed `bokio_*` tool in its description

#### Scenario: Write tools name the next or alternative tool
- **GIVEN** the server with writes enabled
- **WHEN** a client lists tools
- **THEN** every tool with `readOnlyHint` false names another listed `bokio_*` tool in its description

### Requirement: List descriptions state paging and filtering
The system SHALL state, in the description of every tool with a `query` input, an example filter condition in Bokio's query syntax, and for tools that also take `page`, the default page size of 100.

#### Scenario: List descriptions state paging and filter syntax
- **GIVEN** the server with writes enabled
- **WHEN** a client lists tools
- **THEN** every description of a tool with a `query` input mentions `query` and contains a condition using `==`, `>=`, `<=` or `~`
- **AND** every such tool that also takes `page` mentions 100 in its description

### Requirement: Descriptions state the result when no output schema does
The system SHALL say what comes back in the description of every tool that declares no output schema.

#### Scenario: Read tools without an output schema state their result
- **GIVEN** the server with writes enabled
- **WHEN** a client lists tools
- **THEN** every tool with `readOnlyHint` true and no output schema contains "return" in its description

#### Scenario: Write tools state their result
- **GIVEN** the server with writes enabled
- **WHEN** a client lists tools
- **THEN** every tool with `readOnlyHint` false contains "return" in its description
