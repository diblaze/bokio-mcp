# Design

## Context
- E1 `package.json:26` — `"prepare": "git config core.hooksPath .githooks"` — the only hook wiring today; replaced by lefthook's own install.
- E2 `.githooks/pre-commit:3` — `node scripts/ensure-claude-imports.mjs` — bridge maintainer; scope change says bridges are obsolete, so hook + script + bridges go.
- E3 `git ls-files '*CLAUDE.md'` → `CLAUDE.md`, `src/CLAUDE.md`, `test/CLAUDE.md`, each exactly `<!-- Auto-generated … -->\n@AGENTS.md` — pure bridges, safe to delete.
- E4 `AGENTS.md:54` — `**AGENTS.md ↔ CLAUDE.md:** every AGENTS.md has a sibling CLAUDE.md … (.githooks/pre-commit → scripts/ensure-claude-imports.mjs, activated by pnpm install via prepare)` — paragraph to delete. `AGENTS.md:38` Check line and `AGENTS.md:22-23` Key Files rows need the new checks.
- E5 `CONTRIBUTING.md:24-25` — `1. Fork, branch, commit.` / `2. Make sure pnpm exec biome ci … pass` — add the commit convention and that hooks come with `pnpm install`.
- E6 `.github/workflows/ci.yml:20` `uses: actions/checkout@v4` (default depth 1); `:33` `run: pnpm exec biome ci`; `:48` `run: pnpm run pack:check`; `:9` `permissions: contents: read`. Single job `build`, matrix node [22, 24].
- E7 Branch protection (gh api): `contexts: ["build (22)","build (24)"]`, `strict: true`, `linear: false`, `admins: false`. Repo: `allow_squash_merge: true`, `allow_merge_commit: true`, `allow_rebase_merge: true`. A new job would need an owner `gh api` step to become required; a step inside `build` is covered already.
- E8 `pnpm-workspace.yaml:2-3` — `allowBuilds:\n  esbuild: true`. pnpm docs (settings/build): `strictDepBuilds` defaults true → install fails with `ERR_PNPM_IGNORED_BUILDS` for an unlisted dependency that has build scripts.
- E9 `pnpm view lefthook` 2.2.2: `scripts.postinstall = node postinstall.js`; binary comes from `optionalDependencies` (`lefthook-linux-x64` …, no scripts). `postinstall.js`: returns early when `CI` is set and `LEFTHOOK` is not, else `spawnSync(getExePath(), ["install"])`. Found during execute: pnpm's side-effects cache restores the built package without re-running postinstall, so after a reinstall (or in a second project sharing the store) no hooks are installed. Postinstall is not a reliable installer.
- E10 `pnpm view @commitlint/cli` 21.2.4 depends on `@commitlint/config-conventional`; CLI reference: `--default-config  use built-in default config (@commitlint/config-conventional) when no rules are found`; `--edit`, `--from`, `--to`, `--last`. One devDep, zero config files.
- E11 `git log --format=%s`: 26 commits; `cleanup: extract filterQuery…` and `harden: fetch timeout…` fail `type-enum`; longest header 83 < 100. CI must lint `base.sha..head.sha` only, never history.
- E12 lefthook docs: `commit-msg` job `run: … commitlint --edit {1}`; `pre-commit` `stage_fixed: true` re-adds `{staged_files}`; `glob` without a files template filters `{staged_files}` and skips the job when none match; `skip: - run: <cmd>` skips when `<cmd>` exits 0; `LEFTHOOK=0 git commit` bypasses hooks.
- E13 Biome git-hooks recipe (lefthook section): `biome check --write --no-errors-on-unmatched --files-ignore-unknown=true {staged_files}` + `stage_fixed: true`. `biome.json:9` `"includes": ["src/**", "test/**", "scripts/**"]` — `--no-errors-on-unmatched` covers staged files outside those globs.
- E14 actionlint docs/usage: `uses: docker://rhysd/actionlint:{version}` runs in the checkout; image bundles shellcheck + pyflakes; `shellcheck` is pre-installed on ubuntu runners; latest release `v1.7.12`. Local: `actionlint`, `shellcheck` not on PATH here (`which`), `docker` 27 is.
- E15 `scripts/pack-check.mjs:6` — `!/^(dist\/|README\.md$|LICENSE$|package\.json$)/` — tarball guard; `package.json:9` `files: ["dist","README.md"]` keeps `lefthook.yml` out.
- E16 wagoid/commitlint-github-action README: `uses: wagoid/commitlint-github-action@v6`, needs `pull-requests: read`, default `configFile: commitlint.config.mjs`, falls back to config-conventional when absent; lints PR commits via GitHub API. raven-actions/actionlint README: `uses: raven-actions/actionlint@v2`, inputs `version` (default `latest`), `shellcheck`, `matcher`, `cache`. reviewdog/action-actionlint: needs `pull-requests: write`. amannn/action-semantic-pull-request: validates the PR **title** only, intended for squash-merge.

## Goals / Non-Goals
**Goals:**
- Every commit that reaches `main` through a PR is Conventional; local feedback at `commit-msg`, authoritative check in the required CI job (E7, E11).
- Staged files are Biome-clean at commit time; workflow files are actionlint/shellcheck-clean in CI.
- Remove the CLAUDE.md bridge machinery and its docs (E2–E4).
- Shortest diff: 2 devDeps, 1 new file (`lefthook.yml`), 1 line in `pnpm-workspace.yaml`, 2 steps + 1 `with:` in `ci.yml`, doc edits.

**Non-Goals:**
- Lint commits on `push` to `main` — reopen when the owner stops using admin bypass for direct pushes (E7 `admins: false`).
- Separate `commitlint`/`actionlint` jobs or workflows — reopen if the owner picks an off-the-shelf action in Open Questions (then also add the job to required checks).
- PR-title linting (amannn) — reopen only if the repo switches to squash-merge (E16).
- `commit-msg` rules beyond config-conventional (scope enum, `Closes #n` footer) — reopen when a wrong scope actually lands.
- `lefthook-local.yml`, `.gitignore` entry — reopen when a contributor needs per-machine overrides.
- CHANGELOG entry — contributor tooling, not package behaviour; reopen if the owner wants dev changes logged.

## Decisions
- **lefthook via `prepare: "lefthook install"`, `allowBuilds: lefthook: false`** — `prepare` runs on every install of the root project, so hooks are always (re)installed; the postinstall route was dropped during execute because pnpm's side-effects cache skips it (E9). `false` keeps pnpm 11's strict build check satisfied (E8) without a second installer. `lefthook install` also runs in CI; harmless, CI makes no commits.
- **commitlint = `@commitlint/cli` + `--default-config`, no config file** — the CLI already ships config-conventional and the flag loads it (E10). Alternative `commitlint.config.mjs` + explicit `@commitlint/config-conventional` devDep lost: two more artefacts, same rules. Rules are config-conventional as-is (owner constraint).
- **CI commit lint as a step inside `build`, `if: github.event_name == 'pull_request'`, `--from "$(git merge-base base.sha head.sha)" --to head.sha`, checkout `fetch-depth: 0`** — covered by the existing required checks without touching protection (E7); PR range only, so E11's two legacy subjects never fail a build. Runs on both matrix nodes; the cost is a sub-second step. Off-the-shelf alternative in Open Questions.
- **actionlint as `uses: docker://rhysd/actionlint:1.7.12` step inside `build`** — official image, pinned, bundles shellcheck, zero third-party action maintainers, covered by required checks (E7, E14). Alternatives in Open Questions.
- **`lefthook.yml` jobs:** `pre-commit`: Biome recipe verbatim with `stage_fixed: true` (E13); `actionlint {staged_files}` with `glob: ".github/workflows/*.{yml,yaml}"` and `skip: [run: "! command -v actionlint >/dev/null"]` (E12, E14 — binary absent locally, so the job must self-skip rather than fail). `commit-msg`: `pnpm exec commitlint --default-config --edit {1}` (E10, E12). No custom scripts remain; every line is upstream-documented config.
- **Remove bridges wholesale** — all three CLAUDE.md are byte-identical pure bridges (E3); script and hook have no other caller (`rg ensure-claude` → only `.githooks/pre-commit`, `AGENTS.md:54`).
- **Hook bypass is accepted** — `LEFTHOOK=0` and fork contributors without hooks exist (E12); CI is the gate, hooks are feedback.

## Risks / Trade-offs
- commitlint's default ignores let `fixup!`/`squash!`/`amend!` and merge commits through (`@commitlint/is-ignored` defaults); `--default-config` cannot turn that off. Accepted: fixups are autosquashed before a PR opens (owner workflow) and the reviewer sees them; reopen with a `commitlint.config.mjs` setting `defaultIgnores: false` if one lands on `main`.
- The CI range starts at `git merge-base base.sha head.sha`, so commits pushed straight to `main` after the PR's base was recorded are not attributed to the PR.
- `prepare` uses `lefthook install --reset-hooks-path` because clones that ran the old prepare still have `core.hooksPath=.githooks`, which makes a plain `lefthook install` exit 1.
- `fetch-depth: 0` makes checkout slower on a large history; 26 commits today — negligible.
- `docker://` step pulls the image per run (~tens of MB) and cannot run on non-Linux runners; matrix is `ubuntu-latest` only.
- Biome pre-commit uses lefthook's stash of unstaged changes; partial-file staging can conflict — upstream behaviour, documented in the Biome recipe.
- Config-conventional `subject-case` rejects `Sentence case` subjects; current history is lowercase (E11), low friction.

## Open Questions
1. **CI commit lint — which tool?** (a) *recommended* `pnpm exec commitlint --default-config --from … --to …` step in `build`: reuses the devDep already needed for the hook, covered by required checks, no new permissions. (b) `wagoid/commitlint-github-action@v6` in its own job: maintained Docker action, PR-aware via API, no `fetch-depth: 0`; costs `pull-requests: read`, a new job the owner must add to required checks (E7), and a second commitlint install path. (c) `amannn/action-semantic-pull-request`: title-only — does not fit rebase-merge; listed to close it.
2. **Workflow lint — which runner?** (a) *recommended* `uses: docker://rhysd/actionlint:1.7.12` step in `build`: official, pinned, shellcheck bundled. (b) `raven-actions/actionlint@v2`: native binary, cached, GitHub annotations via matcher; third-party maintainer, `version: latest` by default. (c) `reviewdog/action-actionlint`: inline PR review comments; needs `pull-requests: write`, heaviest. (d) upstream `download-actionlint.bash` via `curl | bash` from `main`: unpinned script fetch — not recommended.
3. **Disable squash-merge (and merge-commit)?** Repo allows all three (E7). Rebase-merge is the workflow and the commit lint assumes every commit lands; recommend `gh api -X PATCH repos/diblaze/bokio-mcp -f allow_squash_merge=false -f allow_merge_commit=false`. Owner step, outside this change.
4. **Require linear history on `main`?** `required_linear_history.enabled: false` today (E7). With squash/merge-commit disabled it is redundant but cheap insurance against admin merge-commits; recommend enabling. Owner step.
5. **Local actionlint job: keep with self-skip, or CI-only?** Recommend keep: zero cost when the binary is absent, immediate feedback for whoever installs it. Dropping it removes four YAML lines.

## Decisions (owner, 2026-10-21)
- Q1: (a) commitlint step in `build`.
- Q2: (a) `docker://rhysd/actionlint:1.7.12` step in `build`.
- Q3: squash and merge commits disabled (done outside this change).
- Q4: linear history not required.
- Q5: local actionlint job kept with self-skip.
