<!-- doc-id: rebuild-build-stamp -->
# Rebuild record: build-stamp

[한국어](build-stamp.ko.md)

Verdict: **none fits**; crudui keeps its own implementation. Measured on 2026-10-20.

## Covers

- `scripts/require-current-build.mts`
- `scripts/repeat-build.mts`
- `scripts/package-outputs.mts`

## Requirement

Several commands (the native generator suite, the form suites, the package install check, the contract tests) need the same
built workspace packages. A build runs only when the digests of the sources and outputs no longer match the working tree, so
one verification builds the packages once. A second check builds the packages twice and fails with every output file whose
bytes differ, are missing in one build or appear in one build only (reproducible build). Both read only outputs of the same run.

## Tools evaluated

| Tool | State | Verdict |
|---|---|---|
| make | installed | decides by modification time; a checkout or a restored file changes times without changing bytes, and the check reads digests |
| `tsc --build` (incremental) | installed | knows the TypeScript projects only; the packages are built by tsup, API Extractor and the Vue and Svelte tools |
| Nx, Turborepo | not installed | hash the inputs of each task and cache the output, which would add a build system over 7 packages; neither builds twice and compares the bytes |
| diffoscope | not installed | compares two outputs in depth; it builds nothing and is not in the toolchain of mise |

## Why none fits

The stamp is the digest of the sources and of the outputs of 7 packages built by different tools; the available tools either
decide by time or add a build system for the whole repository, and none compares two builds of the same tree.

## Retry condition

Revisit when the packages build with one tool that has an incremental mode, or when kit provides a build stamp.
