## REMOVED Requirements
### Requirement: Registry publish runs only on maintainer request from the default branch
**Reason**: A release now starts the registry publish by itself, so scenario "Release does not publish to the registry by itself" is reversed.
**Migration**: Replaced by "Registry publish starts on release and waits for maintainer approval". Its other two scenarios carry over unchanged in meaning.

## ADDED Requirements
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

## MODIFIED Requirements
### Requirement: Only versions live on npm are listed
The system SHALL list a version only after npm serves it, and SHALL NOT itself publish to npm.

#### Scenario: Unapproved npm version is not listed
- **GIVEN** the package version in the metadata is staged on npm but not yet approved
- **WHEN** an approved registry run publishes
- **THEN** the registry rejects the publish because the version is not found, the run fails, and the existing listing is unchanged
