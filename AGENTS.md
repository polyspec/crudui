# Development

- Update the authoritative specification before changing behavior or direction.
- Name branches `{type}/{shortname}-{checklist ID}` and worktrees
  `{project}-{shortname}-{checklist ID}`. After integrating a branch into `main`, verify its commits
  or equivalent changes are present and its worktree is clean. Before removal, preserve any files
  excluded by `.gitignore` that exist only in that worktree and are still needed. Then remove the
  worktree and local branch immediately.
  Preserve unintegrated or active work.
- Before committing the related feature, cherry-pick useful commits from a test-only branch that
  cannot be integrated into `main`, discard the remaining test-only changes, and remove its worktree
  and branch. If removal is impossible, first add a numbered sub-item to the owning checklist with
  the cause and exact removal condition.
- Update the corresponding `.ko.md` files with the same information.
- Record each completed feature in `CHANGELOG.md` in the same commit that completes it, and keep
  uncommitted changes within one feature. A received instruction is triaged first: finish the
  feature in progress unless the instruction is explicit and urgent, then place the new work by
  priority before starting it.
- Write commit messages in English as `type(scope): subject (#issue)`: a subject of at most 50
  characters, capitalized, imperative, without a trailing period; a blank line; a body wrapped
  near 72 characters explaining what changed and why; an optional footer for references. The
  type is one of feat, fix, docs, style, refactor, test or chore.
- While a task is in development, run only the Red and Green tests that own the change. The full
  suite runs exactly once, when every active task of the checklist is done; it never runs after
  each fix or each task. Every test reports its own running, completion, success or failure with
  its elapsed time. Each test case is a short verification unit and has its own timeout; a
  whole-suite timeout is not used. A long operation (a build, an install, a toolchain setup, a
  browser close, a server stop, a whole suite) prints detailed step logs and has no timeout, no
  inactivity limit included: its success or failure is judged from its observed result and errors,
  and its end is the event of that result. A test that runs for tens of minutes, or that prints only
  its start and its end, is a defect.
- The guard `scripts/full-run.mjs` enforces the single full run before any step: `make ci` is
  refused while a task is `[~]`, while tracked changes are uncommitted, and when `var/full-run.json`
  records a full run of the current tree, and while the pre-push hook is not installed;
  `make rerun-failed` reruns only the commands of the current tree that did not pass
  (`docs/operations/testing.md`).
- A push happens only when no task of the checklist is `[~]`, neither in a pushed commit nor in the
  working tree. The tracked pre-push hook `.githooks/pre-push` runs
  `node scripts/push-gate.mjs hook`, which refuses such a push and names each task in progress.
  Every `make` run sets `core.hooksPath` to `.githooks` when it reads the Makefile; `make hooks`
  installs and checks the hook, and `make hooks-check` fails while it is not installed. The job
  `push-gate` of `.github/workflows/push-gate.yml` runs `node scripts/push-gate.mjs commit <sha>`
  on every pushed commit and pull request and fails with the same message for a push that passed
  no hook.
- Keep contracts in `docs/spec/`, implementation and deployment status in
  `docs/features.md`, procedures in `docs/operations/`, planned tasks with their
  verification and completion in `docs/plans/execution-checklist.md`, and actual
  changes in `CHANGELOG.md`. Every change belongs to a task of the checklist; add the
  task before the work when it is missing.
- Use the simplest implementation that meets the current contract. Remove
  replaced runtime paths instead of adding compatibility or migration code.
- Separate structure compilation, instance data, rendering and validation.
- Record repository paths relative to the repository. Runtime code resolves
  repository inputs from its declared root or module location. Require an
  explicit path or one authoritative discovery record for external inputs.
  Reject symbolic links, missing records and ambiguous discovery results.
- Use owned events, promises or process completion to determine readiness and
  success. Do not use sleep intervals or periodic state reads when the producer
  can publish completion. A time limit may only turn missing completion into a
  failure; elapsed time never establishes success.
- Use a default only when the current contract defines a value for an omitted
  optional input. Do not replace malformed input, a missing dependency or a
  failed operation with another path, implementation or result.
- Inspect changes before reverting them. Remove harmful, incorrect or unnecessary
  changes. Describe retained changes by their actual purpose.
- Reproduce an observed defect with a tracked failing test. For a plausible defect
  not yet observed, first write a deterministic failing case whose input and required
  result would expose it. Confirm the intended failure before implementation,
  correct the cause, and confirm the same case and relevant use tests pass.
  Investigate a case that cannot expose the problem instead of weakening the criterion.
- Run the tests that own the change. Before a commit, run `make owner-check`: it runs the checks
  that `scripts/owner-checks.json` declares as owners of the changed paths, never the full suite,
  and fails for a path that no rule owns and for a path that a check reads (`inputs`) when no rule
  of the path selects that check. A new path gets its owner in that file in the same change. Record
  results for the current code separately from deployment status.
- Write comments, documentation, change records and user-facing text as direct
  descriptions of current behavior. Name the subject, operation, target and
  result. State a necessary cause in one sentence.
- Do not use metaphors, personification or conversational wording. Do not record
  external source, copying or adaptation history. Name an external project only
  when its identity, API or path is required by the current contract or procedure.
- Keep personal preferences and conversation context outside the repository.

# Checklist

- This repository has one checklist, `docs/plans/execution-checklist.md`. Split a task into
  sub-items or add tasks to it; do not create another checklist. Every repository keeps its own
  checklist.
- A task has one of four states: `[ ]` waiting, `[~]` in progress, `[o]` done, `[!]` bypassed.
  A task is `[o]` only after its verification passed on the committed tree.
- A task state marker, also an x or a capital X between brackets as Markdown task lists write it,
  appears in the checklist only as the state of a task row, at the start of its last cell. The checklist has no legend; its texts name states in words.
  `scripts/check-documents.mjs` fails for any other marker and names its file, line and column.
- The checklist holds only headings and task tables, and `scripts/check-documents.mjs` fails for any
  other line with its file, line and column. Each wave is a heading `## Wave <n> — <title>`, whose
  wave name links the section `wave-<n>` of `docs/plans/waves.md`, followed by a table with the
  columns ID, Task, Verification and Status. A task ID has the form `C<wave>.<number>`, and a task
  row starts with it. `docs/plans/waves.md` holds the dependencies and the background of each wave;
  a wave starts when the waves that it names as dependencies are done.
- A task changes the specification first, then adds failing tests, then changes the implementation.
- `[!]` is used only when the next task cannot proceed without bypassing this one. The task records
  the cause and the condition for retrying it; when that condition holds, resume the task without
  waiting for approval. `[!]` is not done. An audit covers only the `[!]` tasks with their causes and
  retry conditions and does not repeat unrelated full test runs.
- A new problem gets a new task. A problem related to a task that is `[o]` gets a sub-item with the
  next derived ID (`C1.2-1`, `C1.2-2`) that goes through `[~]` and `[o]`; the `[o]` task keeps its
  state.
- A task reproduces a problem, or a stated assumed problem, with a failing test first, confirms the
  failure, changes the implementation and confirms the same test passes.
- The Verification column of a task names the commands that own the task, never `make ci` or the
  full suite.
- Independent tasks may run in parallel, but finishing a task in progress comes before starting a
  new one: the number of `[o]` tasks grows, not the number of `[~]` tasks.
- Uncommitted changes never span more than one task. When a task becomes `[o]`, its changelog entry
  and its commit are made in the same unit of work.
- A received instruction is classified first: a task of the checklist, a rule of this file, or an
  answer only. Unless the instruction states that it is urgent, record it as a task with its priority
  and continue the task in progress. Rules belong in this file without duplication, never in the
  checklist or the changelog.
- Korean documents write technical terms in English and only the surrounding text in Korean.

# Idempotency

The same tree gives the same result on every date and machine, and a failed run shows what failed and why.

- Tools and dependencies: every tool runs at the exact release that the checkout records (`.node-version`,
  `.go-version`, `rust-toolchain.toml`, `config/toolchain.json`, `packageManager` of `package.json`), and
  `node scripts/check-toolchain.mjs` fails for another; an image is named by its digest and its Debian packages by a
  snapshot date, an action by its commit SHA, a browser by the build that the locked package pins. No run queries a
  registry for a latest release or a channel, and no tool installs another release on its own
  (`RUSTUP_AUTO_INSTALL=0`, `GOTOOLCHAIN=local`). A tool of the repository is installed into the checkout
  (`.tools`), never into the machine, which other checkouts share.
- Inputs: a check reads only outputs that it or its declared preparation creates in the same run (a build through
  `require-current-build`, a reinstalled copy, its own records), never the leftover of another command or run.
- Publication: a shared output that another run may read is written to a path of its run and renamed into place.
- Failures: every independent check runs after an earlier one failed (`|| status=1` and `exit $status`), and the run
  fails after the last one with each failure; `&&` joins only steps whose later step reads the output of the earlier.
- Messages: every failure states the expected value, the actual value and the error of the tool, with the command,
  the path and the limit concerned; a timeout names the command, its limit and the elapsed time.
- Empty selections: a run, a selection or a check list that checks nothing fails (`ran no test case`,
  `ran no command`, an empty list of a check).
- Processes: a run starts its processes in a group of their own, stops the whole tree and waits until it is gone,
  and releases what it holds in `finally`.
- Assertions: a test asserts the structured result of an external tool (its exit status, report, events), never its
  human-readable output, whose wording changes with its version, its locale or a parent process; the commands of a
  Makefile target are read only through `makeDryRun` of `tests/build/make-dry-run.mjs`.
- Owners: every path has an owner in `scripts/owner-checks.json`, with the paths that each check reads, and
  `make owner-check` runs before every commit.
- Shared resources: a resource that runs share is held by a lease (`scripts/holder-lock.mjs`) or each run uses a
  directory, name or port of its own; a port is taken by the server that listens on it (port 0) and announced, never
  probed before.
