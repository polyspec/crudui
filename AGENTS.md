# Development

- Update the authoritative specification before changing behavior or direction.
- English documents are authoritative. Update the corresponding `.ko.md` files
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
- Use direct descriptions of operations in comments and documentation. Keep
  personal preferences and conversation context outside the repository.
