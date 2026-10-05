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
- Run the tests that own the change. Run `make docs-check` only when a document or the API
  documentation of a public package changed. Record results for the current code separately
  from deployment status.
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
