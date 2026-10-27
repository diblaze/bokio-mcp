## ADDED Requirements

### Requirement: Instructions state the reuse window
The system SHALL state in the instructions that the fiscal-year listing and exports are reused for five minutes, that writes made through this server clear them, and that changes made in Bokio itself can take up to five minutes to show.

#### Scenario: Instructions state the five-minute reuse
- **GIVEN** the server connected over an in-memory transport
- **WHEN** the client reads the server instructions
- **THEN** they contain "5 minutes" and "Bokio itself"
