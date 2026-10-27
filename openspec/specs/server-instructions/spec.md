# server-instructions Specification

## Purpose
Defines the usage instructions the server hands to every MCP client during the initialize handshake, so that a client model follows the server's safety and accuracy rules without reading the README: they must always be present, stay short, and name the rules that most often go wrong.

## Requirements

### Requirement: Usage instructions are sent at initialize
The system SHALL include usage instructions in the initialize response to every client, regardless of whether writes are enabled, and the instructions SHALL be at most 2,000 characters.

#### Scenario: Instructions are present in the initialize result
- **GIVEN** the server connected over an in-memory transport
- **WHEN** the client completes initialization and reads the server instructions
- **THEN** a non-empty instructions string is returned and it is at most 2,000 characters long

#### Scenario: Built entry sends instructions over stdio
- **GIVEN** a fresh build started as a program with writes not enabled
- **WHEN** the client sends initialize
- **THEN** the result carries a non-empty instructions string

### Requirement: Instructions state the write rules
The system SHALL state in the instructions that write tools exist only when the operator enabled writes, that a write is never to be reported as done unless the tool call succeeded, and that irreversible writes are marked destructive and need the user's confirmation.

#### Scenario: Instructions cover the write gate
- **GIVEN** the server connected over an in-memory transport
- **WHEN** the client reads the server instructions
- **THEN** they name the write opt-in setting and the word "destructive"

### Requirement: Instructions state the accuracy and cost rules
The system SHALL state in the instructions that figures come from the computed tools, not from summing journal entries; that amounts are in ledger sign and annulled verifications net to zero; that revenue booked as journal entries is absent from the invoice list; that each computed call lists the fiscal years and downloads one export per year touched, within Bokio's request limits; and the raw GET escape hatch. Every tool name in the instructions SHALL be a registered tool.

#### Scenario: Instructions cover computed tools, ledger sign and export cost
- **GIVEN** the server connected over an in-memory transport
- **WHEN** the client reads the server instructions
- **THEN** they contain the words "debit positive, credit negative", the per-fiscal-year export cost and the raw GET tool, and every `bokio_*` name in them is a tool the server lists

### Requirement: Instructions state the reuse window
The system SHALL state in the instructions that the fiscal-year listing and exports are reused for five minutes, that writes made through this server clear them, and that changes made in Bokio itself can take up to five minutes to show.

#### Scenario: Instructions state the five-minute reuse
- **GIVEN** the server connected over an in-memory transport
- **WHEN** the client reads the server instructions
- **THEN** they contain "5 minutes" and "Bokio itself"
