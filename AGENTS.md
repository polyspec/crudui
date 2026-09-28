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
- The repository's full test suite runs once, when every feature is complete.
- During development run only the tests of the modified area; run the full suite once, when the
  feature is completed. Every test reports its own running, completion, success or failure with
  its elapsed time and has its own timeout; a whole-suite timeout is not used. A long
  operation gets detailed step logs instead of a timeout, so its process and result stay
  observable.
- Keep contracts in `docs/spec/`, implementation and deployment status in
  `docs/features.md`, procedures in `docs/operations/`, and actual changes in
  `CHANGELOG.md`.
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
- Run relevant tests and `make docs-check`. Record results for the current code
  separately from deployment status.
- Write comments, documentation, change records and user-facing text as direct
  descriptions of current behavior. Name the subject, operation, target and
  result. State a necessary cause in one sentence.
- Do not use metaphors, personification or conversational wording. Do not record
  external source, copying or adaptation history. Name an external project only
  when its identity, API or path is required by the current contract or procedure.
- Keep personal preferences and conversation context outside the repository.
