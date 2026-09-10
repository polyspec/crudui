# Development

- Update the authoritative specification before changing behavior or direction.

  with the same information.
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
- Run relevant tests and `make docs-check`. Record results for the current code
  separately from deployment status.
- Write comments, documentation, change records and user-facing text as direct
  descriptions of current behavior. Name the subject, operation, target and
  result. State a necessary cause in one sentence.
- Do not use metaphors, personification or conversational wording. Do not record
  external source, copying or adaptation history. Name an external project only
  when its identity, API or path is required by the current contract or procedure.
- Keep personal preferences and conversation context outside the repository.
