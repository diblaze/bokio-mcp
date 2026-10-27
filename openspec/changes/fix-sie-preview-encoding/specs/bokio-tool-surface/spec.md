## ADDED Requirements
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
