# Proposal

Status: done
Issue: diblaze/bokio-mcp#10

## Why
Main is rebase-merged, so every commit lands on `main` as-is; the history is already Conventional Commits by habit, but nothing enforces it, workflow files are never linted, and the only git hook is a bespoke script that maintains CLAUDE.md bridges Claude Code no longer needs.

## What Changes
- Commit messages must follow Conventional Commits: rejected locally at `commit-msg` and, for pull requests, by CI over the PR's commit range only (existing history is not re-linted).
- Staged files are formatted and linted by Biome before a commit is created; safe fixes are applied and re-staged, unfixable errors block the commit.
- GitHub workflow files are linted (actionlint, with shellcheck on `run:` blocks) in CI inside the existing `build` job, and locally when a workflow file is staged and `actionlint` is on PATH.
- Git hooks are managed by lefthook and installed by `pnpm install`; no manual hook setup.
- **BREAKING** (contributors only): the CLAUDE.md bridge mechanism is removed — `CLAUDE.md`, `src/CLAUDE.md`, `test/CLAUDE.md`, `scripts/ensure-claude-imports.mjs`, `.githooks/`, the old `prepare` script (now `lefthook install`) and every doc mention of them.

## Capabilities
### New Capabilities
- `contribution-checks`: what a contributor's commit and pull request must pass — commit-message convention, staged-file formatting/lint, workflow-file lint — and that the hooks arrive with dependency installation.
### Modified Capabilities
- none

## Impact
- Code/config: `package.json` (devDeps `lefthook`, `@commitlint/cli`; `prepare: lefthook install`), `pnpm-workspace.yaml` (`allowBuilds: lefthook: false`), new `lefthook.yml`, `.github/workflows/ci.yml` (checkout `fetch-depth: 0`, two steps added to `build`).
- Removed: `CLAUDE.md`, `src/CLAUDE.md`, `test/CLAUDE.md`, `scripts/ensure-claude-imports.mjs`, `.githooks/pre-commit`.
- Docs: `AGENTS.md` (Check line, Key Files, bridge paragraph), `CONTRIBUTING.md` (Pull requests).
- No runtime dependencies, no tarball change (`files` already limits it), no required-status-check change (new steps run inside `build (22)` / `build (24)`).
