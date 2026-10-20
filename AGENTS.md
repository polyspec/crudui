# Development
<!-- doc-id: agents -->

The working principles of every polyspec repository are [PRINCIPLES.md](PRINCIPLES.md), a copy of kit; this file states
only the rules of crudui.

## Tests and runs

- Each test case has its own timeout; a whole suite has none. Every test reports its start, its completion, its result
  and its elapsed time. A long operation (a build, an install, a toolchain setup, a browser close, a server stop, a whole
  suite) prints step logs and has no time limit: its result is judged from its observed outcome and errors. A test that
  runs for tens of minutes, or that prints only its start and its end, is a defect.
  Enforced by: `make test-markers-check`
- During development only the unit tests that own the change run. The end-to-end checks (browsers, containers, the form
  comparison, the native and cross-check suites, full builds), `make owner-check` and the full run run in CI on the push
  to `main`. A failure that CI reports gets a task like any other defect.
  Enforced by: none, which unit tests a developer runs before a commit is a procedure that no check reads.
- `make ci` reproduces the CI workflow on this machine on request, and `make crudui-check` runs the checks of kit
  (`CHECK_TARGETS`). Both run under the full-run guard of `@polyspec/kit`, once per committed tree: the guard refuses a run
  while a task is `[~]`, while tracked changes are uncommitted, and when `var/full-run.json` already records a full run of
  the current tree. `make rerun-failed` reruns only the targets of the current tree that did not pass
  (`docs/operations/testing.md`).
  Enforced by: `make kit-check`
- A push happens only when no task of the checklist is `[~]`, neither in a pushed commit nor in the working tree. The
  tracked pre-push hook `.githooks/pre-push` runs `make push-gate-hook`, which refuses such a push and names each task in
  progress. Every `make` run sets `core.hooksPath` to `.githooks`, and `make hooks-check` fails while the hook is not
  installed. The job `push-gate` of `.github/workflows/push-gate.yml` runs `make push-gate-commit` on every pushed commit
  and then `make records-check`.
  Enforced by: `make hooks-check`
- While the version is 0.x there is no pull request, merge queue or GitHub ruleset. Work is committed locally, one
  checklist row per commit, and the owning unit tests pass before the row becomes `[o]`. `main` is pushed once, when every
  row of the checklist is `[o]`. A tag is created only after the CI check `ci-passed` and the push check `push-gate`
  succeeded for the commit on `main`; a release is made from that tag (`docs/operations/repository.md`).
  Enforced by: none, the order of pushes and tags is a procedure that no check reads.

## Tools and dependencies

- The shared tools are the package `@polyspec/kit`, a devDependency that `package.json` pins to the release asset of a
  tag of polyspec/kit and `package-lock.json` pins with its integrity. A checkout runs `make install-tools TOOLS=npm` and
  `make install-packages` before any other target. The files that `kit.copies` of the package lists
  (`scripts/kit/kit-bootstrap.mk`, `scripts/kit/bootstrap/`, the release workflow, `PRINCIPLES.md`,
  `config/layout.kit.yml` and the lint configurations) are written by `make kit-sync` and compared by `make kit-check`.
  They are changed only in polyspec/kit, never edited here. Code imports a kit module only through an export of the
  package.
  Enforced by: `make kit-check`
- Every tool runs at the exact release that the checkout records (`mise.toml` with `mise.lock`, `rust-toolchain.toml`,
  `config/toolchain.json`, `packageManager` of `package.json`). An image is named by its digest, its Debian packages by a
  snapshot date, an action by its commit SHA and a browser by the build that the locked package pins. No run queries a
  registry for a latest release or a channel, and no tool installs another release on its own
  (`RUSTUP_AUTO_INSTALL=0`, `GOTOOLCHAIN=local`). A tool of the repository is installed into the checkout (`var/tools` by
  `make install-tools`), never into the machine. While the polyspec versions are 0.0.x, a development checkout links the
  installed polyspec packages to their source as `docs/plans/local-links.md` of kit describes; links are never committed.
  Enforced by: `make toolchain-check`
- The configuration of this repository is `config/*.json` (`toolchain`, `dependency-policy`, `dependency-review`,
  `checklist`, `documents`, `owner-checks`, `rebuild`, `release`) and `config/layout.yml`, which name the exceptions of
  `config/layout.kit.yml`, each with its reason.
  Enforced by: `make layout-check`

## Layout, documents and changes

- Keep contracts in `docs/spec/`, implementation and deployment status in `docs/features.md`, procedures in
  `docs/operations/`, planned tasks with their verification and completion in `docs/plans/execution-checklist/checklist.md`, and
  actual changes in `CHANGELOG.md`. Every change belongs to a task of the checklist; add the task before the work when it
  is missing.
  Enforced by: `make layout-check`
- Each completed feature is recorded in `CHANGELOG.md` and `CHANGELOG.ko.md` in the commit that completes it, as an entry
  `### <date> — <title> (<task ID>)` at the top of the section `## Unreleased`. Uncommitted changes stay within one feature.
  Enforced by: `make records-check`
- Every path has an owner in `config/owner-checks.json`, with the paths that each check reads. A new path gets its owner in
  that file in the same change.
  Enforced by: `make owner-validate`
- Write comments, documentation, change records and user-facing text as direct descriptions of current behavior. Name the
  subject, operation, target and result; state a necessary cause in one sentence. Do not use metaphors, personification or
  conversational wording. Do not record external source, copying or adaptation history. Name an external project only when
  its identity, API or path is required by the current contract or procedure.
  Enforced by: `make records-check`
- Keep personal preferences and conversation context outside the repository.
  Enforced by: none, which context belongs outside the repository is a judgement.

## Design

- Separate structure compilation, instance data, rendering and validation.
  Enforced by: none, the separation is a design judgement.
- Record the repository paths that this repository creates relative to the repository. Runtime code resolves repository
  inputs from its declared root or module location, either declaratively (a path named in a tracked file) or by discovery
  (a stated discovery rule). Require an explicit path or one authoritative discovery record for external inputs. In what
  this repository creates, reject symbolic links, missing records and ambiguous discovery results. Links that an outside
  tool creates are accepted as that tool behaves.
  Enforced by: none, the path rules are a design judgement.
- Use owned events, promises or process completion to determine readiness and success. Do not use sleep intervals or
  periodic state reads when the producer can publish completion. A time limit may only turn missing completion into a
  failure; elapsed time never establishes success.
  Enforced by: `make test-markers-check`
- Use a default only when the current contract defines a value for an omitted optional input. Do not replace malformed
  input, a missing dependency or a failed operation with another path, implementation or result.
  Enforced by: `make lint-ts`
- Generated files are never tracked in Git. This covers dependency installs (`node_modules/`, `vendor/`, virtual
  environments), build output (`dist/`, `target/`, `*.tsbuildinfo`), caches, test run artifacts and tool downloads
  (`var/`). The tracked exceptions are the lock files (`package-lock.json`, `composer.lock`, `Cargo.lock`, uv locks,
  `mise.lock`), the committed generated documents that this file names, and test fixtures. A new generator adds its
  ignore entry in the same commit.
  Enforced by: `make layout-check`

## Checklist

- This repository has one checklist, `docs/plans/execution-checklist/checklist.md`. Split a task into sub-items or add tasks to it;
  do not create another checklist.
  Enforced by: `make docs-check`
- A task has one of four states: `[ ]` waiting, `[~]` in progress, `[o]` done, `[!]` bypassed. A task is `[o]` only after
  its verification passed on the committed tree. `[!]` is used only when the next task cannot proceed without bypassing
  this one; the task records the cause and the condition for retrying it, and `[!]` is not done.
  Enforced by: `make docs-check`
- Each wave is a heading `## Wave <n> — <title>` followed by a table with the columns ID, Task, Verification and Status.
  A task ID has the form `C<wave>.<number>`, and a task row starts with it. The state marker appears only at the start of
  the Status cell of a task row. `docs/plans/execution-checklist/plan.md` holds the dependencies of each wave.
  Enforced by: `make docs-check`
- A new problem gets a new task. A problem related to a task that is `[o]` gets a sub-item with the next derived ID
  (`C1.2-1`, `C1.2-2`) that goes through `[~]` and `[o]`; the `[o]` task keeps its state.
  Enforced by: `make docs-check`
- The Verification column of a task names the commands that own the task, never `make ci` or the full suite.
  Enforced by: `make docs-check`
- Independent tasks may run in parallel, but finishing a task in progress comes before starting a new one. Uncommitted
  changes never span more than one task.
  Enforced by: `make records-check`
- A received instruction is classified first: a task of the checklist, a rule of this file, or an answer only. Unless the
  instruction states that it is urgent, record it as a task with its priority and continue the task in progress. Rules
  belong in this file, never in the checklist or the changelog.
  Enforced by: none, the triage of an instruction is a judgement.

## Idempotency

The same tree gives the same result on every date and machine, and a failed run shows what failed and why.

- Inputs: a check reads only outputs that it or its declared preparation creates in the same run (a build through
  `require-current-build`, a reinstalled copy, its own records), never the leftover of another command or run.
  Enforced by: none, the reads of a check are declared in `config/owner-checks.json` and reviewed there.
- Publication: a shared output that another run may read is written to a path of its run and renamed into place.
  Enforced by: none, the publication path is a design judgement.
- Failures: every independent check runs after an earlier one failed (`|| status=1` and `exit $status`), and the run fails
  after the last one with each failure; `&&` joins only steps whose later step reads the output of the earlier.
  Enforced by: `make lint-ts`
- Messages: every failure states the expected value, the actual value and the error of the tool, with the command, the
  path and the limit concerned; a timeout names the command, its limit and the elapsed time.
  Enforced by: none, the wording of a message is a judgement.
- Empty selections: a run, a selection or a check list that checks nothing fails (`ran no test case`, `ran no command`,
  an empty list of a check).
  Enforced by: none, each runner reports an empty selection by its own rule.
- Processes: a run starts its processes in a group of their own, stops the whole tree and waits until it is gone, and
  releases what it holds in `finally`.
  Enforced by: none, the process handling is reviewed in the code of each run.
- Assertions: a test asserts the structured result of an external tool (its exit status, report, events), never its
  human-readable output, whose wording changes with its version, its locale or a parent process. The commands of a
  Makefile target are read only through `makeDryRun` of `tests/build/make-dry-run.mts`.
  Enforced by: `make test-markers-check`
- Shared resources: a resource that runs share is held by a lease (holder-lock of `@polyspec/kit`), or each run uses a
  directory, name or port of its own. A port is taken by the server that listens on it (port 0) and announced, never
  probed before.
  Enforced by: none, the lease use is reviewed in the code of each run.

# Releases

- A release is a tag of a commit of `main`, which passed the full suite of CI: `vX.Y.Z` for the repository,
  `<directory>/vX.Y.Z` for the Go module of that directory. Only the maintainer creates, moves or pushes a tag.
  Enforced by: `make release-verify`
- After the CI check `ci-passed` succeeded for the pushed `main`, the commit `chore(release): Release X.Y.Z (#<task ID>)`
  comes first: it sets the version of every manifest that `config/release.json` lists (`package.json`, `Cargo.toml`,
  `pyproject.toml`, the `composer.json` of `packages/`), and of every dependency on a package of the repository, to X.Y.Z,
  and renames `## Unreleased` of `CHANGELOG.md` and `CHANGELOG.ko.md` to `## X.Y.Z` below a new empty `## Unreleased`.
  Enforced by: `make release-verify`
- The maintainer then tags the commit and pushes the tag. `.github/workflows/release.yml`, the copy of kit, runs
  `make release-tools`, `make release-verify`, `make release-versions`, `make release-assets`, `make release-publish`,
  `make release-proof` and `make release-undraft` (the release tool of `@polyspec/kit`). It requires the commit on `main`
  with the checks `push-gate` and `ci-passed` concluded success, the version of the tag in every manifest and the section
  `## X.Y.Z`; it creates the GitHub Release as a draft with that section as its notes and the archives of `packages/`,
  proves the draft from outside the checkout and then makes it public. A section over 125000 characters, the limit of a
  release body, is replaced by one line that links the section of `CHANGELOG.md` at the tag. A crate is not released as an
  archive; it is consumed by git tag. A Go module tag builds and attaches nothing (`docs/operations/repository.md`).
  Enforced by: `make release-verify`
