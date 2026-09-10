# Development

- Update the authoritative specification before changing behavior or direction.

  with the same information.
- Keep contracts in `docs/spec/`, implementation and deployment status in
  `docs/features.md`, procedures in `docs/operations/`, and actual changes in
  `CHANGELOG.md`.
- Use the simplest implementation that meets the current contract. Remove
  replaced runtime paths instead of adding compatibility or migration code.
- Separate structure compilation, instance data, rendering and validation.
- Use repository-relative paths. Require explicit paths for external inputs.
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
