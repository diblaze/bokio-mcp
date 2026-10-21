# release-automation Specification

## Purpose
Defines how a version of the package travels from merged commits on the default branch to a release pull request, a tagged GitHub Release and an npm version that waits for maintainer approval before it becomes installable.

## Requirements

### Requirement: Release pull request is derived from commit history
The system SHALL, after a push to the default branch that contains at least one releasable commit (`feat`, `fix` or a breaking change) since the last release, open or update one release pull request that sets the next version according to Conventional Commits semantics and prepends the matching changelog entry.

#### Scenario: Feature commit proposes a minor bump
- **GIVEN** the last release is 0.3.0 and the default branch has gained a `feat` commit since
- **WHEN** the release automation runs
- **THEN** a release pull request proposes version 0.4.0 with the package manifest, release manifest and changelog updated

#### Scenario: Breaking change before 1.0.0 bumps the minor version
- **GIVEN** the last release is below 1.0.0 and a commit marked as breaking has landed since
- **WHEN** the release automation runs
- **THEN** the proposed version bumps the minor component, not the major

#### Scenario: Non-releasable commits open no release
- **GIVEN** every commit since the last release is of a non-releasable type (`docs`, `chore`, `ci`, `build`, `test`)
- **WHEN** the release automation runs
- **THEN** no release pull request is opened and no release is created

### Requirement: Merging the release pull request publishes a tagged release
The system SHALL, when a release pull request is merged, create the git tag `v<version>` and a GitHub Release named after it whose notes are the changelog entry for that version.

#### Scenario: Tag name matches the existing scheme
- **GIVEN** a merged release pull request for version 0.4.0
- **WHEN** the release automation runs on the resulting push
- **THEN** the tag is `v0.4.0`, with no component prefix, and a GitHub Release for it exists

### Requirement: Published package is staged for maintainer approval
The system SHALL, when a release has been created, build the package and submit it to the npm registry as a staged version using the workflow's short-lived identity, so that no registry token is stored and the version is not installable until a maintainer approves it with two-factor authentication.

#### Scenario: Release created stages the package
- **GIVEN** the release automation has just created a release
- **WHEN** the publish job runs
- **THEN** it builds from the release commit and submits the package to staging without any stored registry token

#### Scenario: No release, no publish
- **GIVEN** a push to the default branch that creates no release
- **WHEN** the release workflow runs
- **THEN** the publish job is skipped

#### Scenario: Publish never runs for pull requests or other branches
- **GIVEN** a pull request, or a push to a branch other than the default branch
- **WHEN** GitHub evaluates workflow triggers
- **THEN** the release workflow does not run

### Requirement: Default-branch version equals the latest release
The system SHALL keep the package version on the default branch equal to the latest released version; only the release pull request changes it.

#### Scenario: Package version matches the release manifest
- **GIVEN** the default branch
- **WHEN** the package manifest version and the release manifest version are compared
- **THEN** they are identical

### Requirement: Generated changelog entries sit above the hand-written history
The system SHALL prepend generated changelog entries under the changelog header while keeping the hand-written entries for 0.3.0 and earlier unchanged, with no duplicate or unreleased version heading.

#### Scenario: Hand-written history preserved, no unreleased block
- **GIVEN** the changelog on the default branch
- **WHEN** it is read
- **THEN** the `0.3.0 — 2026-10-21` entry is present, no heading says `unreleased`, and the header states that later entries are generated from commit messages
