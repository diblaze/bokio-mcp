# tool-definitions Specification

## Purpose
Defines the quality rules for the tool definitions every client receives from `tools/list`. An agent needs the definitions to pick the right tool and fill in its parameters. A person reading the source needs to be able to read them as well.

## Requirements

### Requirement: Tool definitions pass the deterministic quality lint
The system SHALL list tools with a description for every parameter. The TDQS reference lint SHALL report no error-level finding on the listed tools, and no warning-level finding except structural shadow candidates.

#### Scenario: Lint reports nothing but shadow candidates
- **GIVEN** the server with writes enabled, connected over an in-memory transport
- **WHEN** the TDQS lint runs over the listed tools
- **THEN** every tool has 100% parameter description coverage
- **AND** no finding has severity error
- **AND** every warning-level finding is a `shadow-candidate`

### Requirement: Tool descriptions are short plain sentences
The system SHALL describe every tool in at most three sentences, not counting the `WRITE.` marker. The first sentence SHALL say what the tool does. No description SHALL contain the shouting words IMPORTANT, MUST, NEVER, ALWAYS or NOTE. Every write tool SHALL keep the `WRITE.` marker.

#### Scenario: Descriptions stay short and plain
- **GIVEN** the server with writes enabled
- **WHEN** a client lists tools
- **THEN** every description, with `WRITE.` removed, has at most three sentences
- **AND** no description contains a shouting word
- **AND** every tool with `readOnlyHint` false contains `WRITE.`

### Requirement: Id parameters name where the id comes from
The system SHALL name a listed tool that returns the id in the description of every id parameter, except `companyId`. The `companyId` description SHALL name its `BOKIO_COMPANY_ID` fallback.

#### Scenario: Id parameters name the tool that lists them
- **GIVEN** the server with writes enabled
- **WHEN** a client lists tools
- **THEN** every input property whose name ends in `Id`, other than `companyId`, has a description naming a listed `bokio_*` tool
- **AND** `companyId` describes `BOKIO_COMPANY_ID`

### Requirement: Save paths state where files land
The system SHALL say in the save-path parameter description of every download tool that the file is written inside `BOKIO_DOWNLOAD_DIR` (or the working directory) and that an existing file is never overwritten.

#### Scenario: Save path states where files land
- **GIVEN** the server with writes enabled
- **WHEN** a client lists tools
- **THEN** every `savePath` property description mentions `BOKIO_DOWNLOAD_DIR` and that existing files are not overwritten
