## Purpose
Defines the checks a contribution to this repository must pass before it can be committed locally or merged through a pull request: commit-message convention, formatting and lint of staged files, lint of workflow files, and automatic activation of the local hooks.

## ADDED Requirements

### Requirement: Commit messages follow Conventional Commits
The system SHALL reject a commit whose message does not satisfy the Conventional Commits convention (`type(scope)?: subject`, header at most 100 characters, body lines at most 100 characters), both when the commit is created locally and for every commit in a pull request's range.

#### Scenario: Non-conventional message is rejected locally
- **GIVEN** the local hooks are installed
- **WHEN** a commit is attempted with the message `bad message`
- **THEN** the commit is not created and the output names the violated rule

#### Scenario: Conventional message is accepted
- **GIVEN** the local hooks are installed
- **WHEN** a commit is attempted with the message `feat: ok`
- **THEN** the message check passes

#### Scenario: Pull request with a non-conventional commit fails CI
- **GIVEN** a pull request whose range contains one commit with subject `cleanup: tidy`
- **WHEN** CI runs for the pull request
- **THEN** the required build check fails and the failure names that commit

#### Scenario: Pre-existing history is not re-linted
- **GIVEN** `main` already contains commits with non-conventional subjects
- **WHEN** CI runs for a pull request whose own commits are all conventional
- **THEN** the commit-message check passes

### Requirement: Staged files pass formatting and lint before a commit is created
The system SHALL run the project formatter and linter on the staged files at commit time, apply safe fixes and re-stage them, and SHALL block the commit when an unfixable lint error remains.

#### Scenario: Safe fixes are applied and staged
- **GIVEN** a staged source file whose only defect is formatting
- **WHEN** the pre-commit check runs
- **THEN** the file is rewritten in project format, the fix is staged, and the check passes

#### Scenario: Unfixable lint error blocks the commit
- **GIVEN** a staged source file with a lint error that has no safe fix
- **WHEN** the pre-commit check runs
- **THEN** the check fails and the commit is not created

### Requirement: Workflow files are linted
The system SHALL check every GitHub Actions workflow file for syntax, expression and shell-script errors in CI, and locally when a workflow file is staged and the workflow linter is available.

#### Scenario: Invalid workflow fails the check
- **GIVEN** a workflow file whose `run:` block contains a shell error or whose expression references an unknown context
- **WHEN** the workflow lint runs
- **THEN** it exits non-zero and names the file and line

#### Scenario: Repository workflows pass the check
- **GIVEN** the workflow files in the repository
- **WHEN** the workflow lint runs
- **THEN** it exits zero

#### Scenario: Workflow lint is skipped locally when the linter is absent
- **GIVEN** the workflow linter is not on PATH
- **WHEN** the pre-commit check runs with a staged workflow file
- **THEN** the workflow lint step is skipped and the remaining checks still run

### Requirement: Hooks are installed by dependency installation
The system SHALL install the `pre-commit` and `commit-msg` git hooks as part of installing the project's dependencies, without any additional command.

#### Scenario: Fresh install activates the hooks
- **GIVEN** a fresh clone
- **WHEN** dependencies are installed
- **THEN** the `pre-commit` and `commit-msg` hooks exist in the repository's git hooks directory and the hook configuration validates
