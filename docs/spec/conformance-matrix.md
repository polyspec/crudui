# Conformance matrix

[한국어](conformance-matrix.ko.md).

`contracts/conformance-matrix.json` is the executable inventory for cross-language and
cross-renderer conformance. It is not a report written after a manual review. The inventory
declares each target group, shared fixture family, expected fixture count and test entry point.

The matrix has four independent target groups:

- validation gateway: JavaScript, PHP, Go and Rust, with every form, list-structure and
  detail-structure fixture sent through every language;
- validation extension: the PHP extension, with the same validation fixture families;
- render gateway: HTML, React, Svelte and Vue, with every form, list and detail render fixture;
- native generator: JavaScript, HTML, PHP, Go, Rust and the PHP extension, with every native
  form, list and detail check.

Browser-session targets are recorded separately because DOM interaction is not a native CLI
operation. A feature may declare `pass` only when its target appears in the corresponding
matrix group. `tests/build/conformance-coverage.test.mjs` fails when a fixture count, target,
test link or supported-target declaration drifts. The test is part of `npm run test:runtimes`,
which CI runs before the language suites.

A target selection is never evidence of complete conformance. Complete evidence requires the
unfiltered runner and every target in its group to finish successfully. A missing executable,
missing native module, missing test link or changed fixture inventory is a failure, not an
unsupported result.
