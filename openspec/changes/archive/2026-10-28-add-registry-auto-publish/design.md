# Design
## Context
- E1 `.github/workflows/mcp-registry.yml:6-7` — `on:` / `  workflow_dispatch:` — the only trigger today.
- E2 `.github/workflows/mcp-registry.yml:13` — `if: github.ref == 'refs/heads/main'`. On a `release` event `github.ref` is `refs/tags/vX.Y.Z`, so this guard alone would skip every release run.
- E3 `.github/workflows/mcp-registry.yml:22-24` — `- uses: actions/checkout@v7` / `persist-credentials: false`. There is no `ref:`, so checkout uses `github.ref`: the tag on a release run, and `main` on a dispatch.
- E4 `.github/workflows/mcp-registry.yml:3-5` — `# Run by hand after approving the staged release:` — this header comment becomes stale.
- E5 `.github/workflows/release-please.yml:42-45` — `concurrency:` / `group: release-please` / `cancel-in-progress: false`. If a job in this workflow waited for approval, every later push to `main` would queue behind it.
- E6 `.github/workflows/release-please.yml:55-59` — `googleapis/release-please-action@v5` with `token: ${{ secrets.RELEASE_PLEASE_TOKEN }}`. Releases are created with a PAT, so `release: published` triggers workflows. Events created with `GITHUB_TOKEN` would not.
- E7 `.github/workflows/release-please.yml:85-86` — `# Trusted publishing (OIDC): no token. The owner approves the staged version on npm with 2FA.` / `- run: npm stage publish`. The npm trusted publisher is bound to this file, so it stays untouched.
- E8 registry `internal/api/handlers/v0/auth/github_oidc.go:293`: the namespace comes from the `repository_owner` claim. An `environment:` subject is only recorded, so OIDC login works inside an environment.
- E9 `openspec/specs/mcp-registry-listing/spec.md:118-124` — `### Requirement: Registry publish runs only on maintainer request from the default branch` … `#### Scenario: Release does not publish to the registry by itself`. This change reverses that requirement.
- E10 `openspec/specs/mcp-registry-listing/spec.md:147-150` — `**WHEN** the maintainer dispatches the registry workflow`. That trigger wording is now too narrow.
- E11 `AGENTS.md:28` — `| \`.github/workflows/mcp-registry.yml\` | Manual dispatch on \`main\` only: …`. `AGENTS.md:60` — `then runs \`gh workflow run mcp-registry.yml --ref main\``. `CONTRIBUTING.md:38` — `After approving, the owner runs \`gh workflow run mcp-registry.yml --ref main\``. These docs describe the manual step.
- E12 GitHub environments: a job that names a missing environment auto-creates it **unprotected**. Required reviewers work on public free-plan repos. A pending deployment waits up to 30 days.

## Goals / Non-Goals
**Goals:**
- Every release queues a registry publish that runs only after the owner approves it.
- Keep manual dispatch from `main` as a fallback.

**Non-Goals:**
- Approval-free publish that polls npm until the version is live. Reopen when two approvals per release (npm + environment) feel like too much.
- `concurrency` on the registry workflow. Reopen when two releases are pending at the same time.
- Separate gating of manual dispatch (environment only on release runs). Reopen if approving your own dispatch gets annoying.

## Decisions
- Add `release: types: [published]` to `mcp-registry.yml` instead of adding a job to `release-please.yml`. A pending job there would hold the `release-please` concurrency group (E5) and touch the file the npm trusted publisher is bound to (E7). The extra trigger is 2 lines. (E1, E5, E6, E7)
- Job `if: github.ref == 'refs/heads/main' || (github.event_name == 'release' && startsWith(github.ref, 'refs/tags/v'))`. The old guard would skip every release run (E2). A dispatch on a tag stays refused.
- Keep checkout without `ref:`. On a release run it checks out the tag, whose `server.json` is the released version (E3).
- `environment: mcp-registry` on the job for every trigger. The approval gate is GitHub's native one, so there is no code to write (E12). A conditional environment expression lost because it adds complexity to save one click on a rare manual run.
- The owner creates the environment before merge, as a repo setting outside the diff. It has required reviewer `diblaze`, `prevent_self_review: false`, and the deployment refs `main` (branch) and `v*` (tag). The release actor is the PAT owner, so self-review must stay allowed. Without this setting, the first release run would auto-create an unprotected environment and publish without approval (E12). Task 1.1 checks that the environment exists, so the plan cannot merge without it.

## Risks / Trade-offs
- The owner approves the deployment before the npm approval. The registry then returns 404 and the run fails with no change (scenario "Unapproved npm version is not listed"). Fix: approve npm first, then "Re-run failed jobs" on the run, or dispatch on `main`.
- The environment is missing or unprotected at merge time, so the next release publishes unapproved. Only the 1.1 check (`gh api`) prevents this. CI cannot see it.
- Approving a deployment is one more click per release. The owner asked for that.

## Open Questions
- None. The owner approved creating the environment with the `gh api` commands in task 1.1, and it was created before merge.
