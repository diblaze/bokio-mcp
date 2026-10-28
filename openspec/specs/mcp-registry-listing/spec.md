# mcp-registry-listing Specification

## Purpose
Defines how the package identifies itself to the official MCP Registry, which server metadata it publishes there, and when a released version is listed.

## Requirements

### Requirement: Published package declares its registry name
The system SHALL publish a package manifest that declares the registry name `io.github.diblaze/bokio-mcp`. The server metadata SHALL use the same name and point at this npm package with stdio transport.

#### Scenario: Registry name matches the package manifest
- **GIVEN** the repository at a release commit
- **WHEN** the package manifest and the server metadata are compared
- **THEN** the manifest's registry name and the metadata name are both `io.github.diblaze/bokio-mcp`, and the metadata's single package is the npm package `bokio-mcp` with stdio transport

### Requirement: Registry metadata version equals the package version
The system SHALL keep the server metadata's version and its package version equal to the package manifest version, and every release SHALL update all three together.

#### Scenario: Registry metadata version equals package version
- **GIVEN** the default branch, or a release pull request
- **WHEN** the server metadata versions are compared with the package manifest version
- **THEN** all three are identical, and the release configuration updates both metadata version fields

### Requirement: Registry metadata lists the configuration variables
The system SHALL list in the server metadata every environment variable the server reads. The token SHALL be the only variable that is both required and secret.

#### Scenario: Registry metadata lists the documented variables
- **GIVEN** the server metadata, the user-facing configuration table and the variables the source reads
- **WHEN** their variable names are compared
- **THEN** the three name sets are equal, `BOKIO_TOKEN` is required and secret, and no other variable is secret

### Requirement: Publisher tool is pinned and verified
The system SHALL run a publisher tool of a fixed version whose archive matches a recorded SHA-256 hash. If the archive does not match, the system SHALL stop before logging in.

#### Scenario: Tampered or unpinned publisher is rejected
- **GIVEN** the registry workflow downloads the publisher archive
- **WHEN** the archive's SHA-256 differs from the recorded hash
- **THEN** the step fails before login or publish, and the download URL names a fixed release, not `latest`

### Requirement: Only versions live on npm are listed
The system SHALL list a version only after npm serves it, and SHALL NOT itself publish to npm.

#### Scenario: Unapproved npm version is not listed
- **GIVEN** the package version in the metadata is staged on npm but not yet approved
- **WHEN** an approved registry run publishes
- **THEN** the registry rejects the publish because the version is not found, the run fails, and the existing listing is unchanged

### Requirement: Registry publish starts on release and waits for maintainer approval
The system SHALL start the registry publish when a release is published, and when a maintainer starts it by hand on the default branch. No run SHALL publish until a maintainer approves it. The workflow SHALL use the job's short-lived identity and no stored secret.

#### Scenario: Release starts a held registry publish
- **GIVEN** a release that has just been published for tag `vX.Y.Z`
- **WHEN** GitHub evaluates workflow triggers
- **THEN** the registry workflow starts from that tag, and its publish job waits for a maintainer's approval before any step runs

#### Scenario: Unapproved run publishes nothing
- **GIVEN** a registry run that waits for approval
- **WHEN** a maintainer rejects it or it expires
- **THEN** no step runs and the listing is unchanged

#### Scenario: Release run publishes the released metadata
- **GIVEN** a registry run started by the release of tag `vX.Y.Z`
- **WHEN** it reads the server metadata
- **THEN** it reads the metadata at that tag, whose version is `X.Y.Z`

#### Scenario: Dispatch from another branch is refused
- **GIVEN** a maintainer dispatches the registry workflow on a branch or tag other than the default branch
- **WHEN** the workflow evaluates its publish job
- **THEN** the job is skipped and nothing is published

#### Scenario: Publish authenticates without a stored secret
- **GIVEN** the registry workflow
- **WHEN** it logs in to the registry
- **THEN** it uses the GitHub OIDC identity of the job and references no repository secret
