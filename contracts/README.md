# CRUDUI contract manifest

[한국어](README.ko.md).

[`features.json`](features.json) connects each feature with its owner package,
input, output, state changes, errors, support matrix, tests and documentation.
The manifest does not copy widget or validation catalogs. Those catalogs remain
derived from the live registries and schema.

Validate the manifest from the repository root:

```sh
npm run manifest:check
```

The check verifies the manifest shape, package paths, public source exports,
fixture links, test links and document links. The CLI can print the same contract
for tools that need a compact machine-readable or Markdown description.
