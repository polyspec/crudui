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

The check verifies the manifest shape, package paths, package entries, fixture
links, test links and document links.

Each package lists under `entries` every JavaScript entry of its `package.json`
`exports` map (`"."` and any other code subpath; stylesheets and `package.json`
are not code) with a `visibility` and the exact list of its value exports in
code-unit order; types are not listed. A `public` entry is application API. An
`internal` entry serves CRUDUI's own packages only and is unsupported for
applications. The check reads the value exports of each entry's source file
(`./dist/<name>.js` is built from `src/<name>.ts`) with the TypeScript compiler,
resolving aliases and re-exports, and fails when:

- a `package.json` code entry has no manifest entry, or a manifest entry has no
  `package.json` code entry;
- the value exports differ from the declared list in either direction, an export
  cannot be resolved, or the list is not sorted;
- a function named in an implemented feature's `signature` is not in the public
  `"."` list of its owner;
- an error class named in an implemented feature's `errors` (a name ending in
  `Error`) is neither a JavaScript built-in error nor in the public `"."` list of
  a CRUDUI package;
- a file outside the code of the CRUDUI packages under `packages/` imports an
  `internal` entry. Examples, tests, documents and package READMEs use public
  entries only;
- a file of a package under `packages/` imports a file of another package by a
  relative path (in an import, export, `require`, dynamic import or Vitest module
  mock). A package uses another package only through its entries by name.

[`tests/build/contract-manifest.test.mjs`](../tests/build/contract-manifest.test.mjs)
proves each failure on a synthetic repository and runs the check on this
repository. The CLI can print the same contract
for tools that need a compact machine-readable or Markdown description.

## Interface messages

[`interface-messages.json`](interface-messages.json) holds the interface text of
every supported language: form control labels, counts and summaries
([form markup](../docs/spec/form-markup.md#interface-messages)). It is the only
place the text is written. Each runtime embeds a source generated from it by its
own script and has a test that fails when the embedded text differs from the file;
after editing the file, run every runtime's script:

- TypeScript: `node packages/generator-core/scripts/generate-interface-messages.mjs`
- Go: `go generate` in `packages/generator-go`
- Rust: `node packages/generator-rust/tools/generate-interface-messages.mjs`
- PHP: `php packages/generator-php/scripts/generate-interface-messages.php`
- PHP extension: `node packages/php-ext/tools/generate-interface-messages.mjs`
