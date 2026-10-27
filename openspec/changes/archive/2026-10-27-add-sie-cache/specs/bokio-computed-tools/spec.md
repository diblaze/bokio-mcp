## ADDED Requirements

### Requirement: Fiscal years and exports are reused for five minutes
The system SHALL reuse, for five minutes from when it was fetched, the fiscal-year listing and each parsed export that a computed tool loaded for a company. Within that time, another computed call for the same company SHALL make no request for them. Calls for the same data while its load is in flight SHALL share that load. Only successful loads SHALL be reused.

#### Scenario: Second computed call within five minutes makes no request
- **GIVEN** a computed tool has just loaded the fiscal-year listing and one export
- **WHEN** a different computed tool runs over the same range within five minutes
- **THEN** no request is made and its figures come from the same data

#### Scenario: Cached copy expires after five minutes
- **GIVEN** a computed tool loaded the fiscal-year listing and one export more than five minutes ago
- **WHEN** a computed tool runs over the same range
- **THEN** the listing and the export are requested again

#### Scenario: Cache is per company
- **GIVEN** a computed tool has just loaded data for one company
- **WHEN** a computed tool runs over the same range for another company id
- **THEN** that company's listing and export are requested

#### Scenario: Parallel loads share one request
- **GIVEN** nothing is cached
- **WHEN** two calls for the same data run at the same time
- **THEN** the data is loaded once and both calls get it

#### Scenario: Parallel computed calls share one download
- **GIVEN** nothing is cached
- **WHEN** two computed tools run at the same time over the same range
- **THEN** one fiscal-year listing request and one export download are made

#### Scenario: Failed load is not cached
- **GIVEN** a load that failed with an error
- **WHEN** the same data is requested again
- **THEN** it is loaded again instead of reusing the failure

### Requirement: A write clears the cache
The system SHALL drop every reused listing and export once a write request to Bokio completes, whether or not Bokio accepted it. Reads and writes blocked by the write gate SHALL leave the cache as it is.

#### Scenario: Successful write clears cached data
- **GIVEN** cached data and writes enabled
- **WHEN** a write request succeeds
- **THEN** the next request for that data loads it again

#### Scenario: Failed write also clears cached data
- **GIVEN** cached data and writes enabled
- **WHEN** a write request fails with an HTTP error
- **THEN** the next request for that data loads it again

#### Scenario: Blocked write leaves cached data
- **GIVEN** cached data and writes not enabled
- **WHEN** a write request is blocked by the write gate
- **THEN** the next request for that data reuses it and no HTTP request is made

#### Scenario: Read in flight across a write is not reused
- **GIVEN** a load that started before a write request
- **WHEN** the write completes and then the load finishes
- **THEN** the load's result is returned to its caller but not reused, and the next request loads again

## MODIFIED Requirements

### Requirement: Computed tools are read-only and derive from the bookkeeping export
The system SHALL expose every computed tool as read-only. It SHALL obtain its data from the bookkeeping export of each fiscal year the request touches, either by downloading it or by reusing a copy as the five-minute reuse requirement allows. It SHALL list fiscal years first only when no fiscal year id is given, and SHALL never call a mutating endpoint.

#### Scenario: Computed tools are listed as read-only
- **GIVEN** the server starts with writes not enabled
- **WHEN** a client lists tools
- **THEN** all seven computed tools are present and each declares it is read-only

#### Scenario: One export request per fiscal year
- **GIVEN** nothing is cached, a date range that lies inside one fiscal year, and no fiscal year id
- **WHEN** a computed tool runs
- **THEN** exactly one fiscal-year listing request and one export download are made

#### Scenario: Export fetched by fiscal year id without a listing
- **GIVEN** nothing is cached and a fiscal year id is passed
- **WHEN** a computed tool runs
- **THEN** only the export download for that id is requested
