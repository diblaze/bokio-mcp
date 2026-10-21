## Purpose
Defines what an external user receives when installing the published npm package: a runnable executable, a version that matches the package manifest, and a tarball limited to runtime files and licence.

## ADDED Requirements

### Requirement: Built entry point is directly executable
The system SHALL produce a build output whose entry file can be executed directly by the operating system (shebang plus execute permission) so that `npx -y bokio-mcp` starts the server.

#### Scenario: Smoke check spawns the built entry directly
- **GIVEN** a fresh build
- **WHEN** the built entry file is spawned as a program (not via an explicit interpreter) and asked to initialize and list tools
- **THEN** the MCP handshake succeeds and the expected read-only tool surface is listed

#### Scenario: Entry point starts when invoked through a symlink
- **GIVEN** a fresh build and a symlink to the built entry file (as npm creates in `node_modules/.bin`)
- **WHEN** the symlink is spawned as a program and asked to initialize
- **THEN** the MCP handshake succeeds

### Requirement: Server reports the package version
The system SHALL report, in the MCP initialize response, the same version string as the package manifest.

#### Scenario: Server version equals package version
- **GIVEN** the server connected over an in-memory transport
- **WHEN** the client reads the server version
- **THEN** it equals the version in the package manifest

### Requirement: Published tarball contains only runtime files and licence
The system SHALL publish a tarball containing the built output, README, LICENSE and package manifest, and nothing else.

#### Scenario: Dry-run pack lists only allowed files
- **GIVEN** the repository at the release commit
- **WHEN** a dry-run pack is performed
- **THEN** every listed file is under the build output or is README.md, LICENSE or package.json, and LICENSE is present
