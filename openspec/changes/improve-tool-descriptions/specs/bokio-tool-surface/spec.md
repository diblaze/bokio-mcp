## ADDED Requirements

### Requirement: List tools default to 100 items per page
The system SHALL request 100 items per page from Bokio when a paged list tool is called without `pageSize`, and the page size given otherwise.

#### Scenario: List call without pageSize asks for 100
- **GIVEN** a paged list tool and a stubbed Bokio API
- **WHEN** it is called without `pageSize`
- **THEN** the request carries `pageSize=100`
