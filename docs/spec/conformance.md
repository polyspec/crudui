# Conformance evidence

[한국어](conformance.ko.md).

[`contracts/features.json`](../../contracts/features.json) is the standard every runtime is
measured against. Each feature declares the runtimes that support it (`pass`, `partial` or
`unsupported`) and the shared fixtures that prove it. The manifest's `fixtures` list registers
every fixture: a `cases.json` family, or a module fixture with its declared `cases` or the module
export that lists them.

## Runtime keys

| Key | Implementation |
| --- | --- |
| `javascript` | `@crudui/validator` and the `@crudui/generator-core` model |
| `javascript-html` | the `@crudui/generator-html` string renderer |
| `javascript-dom` | the `@crudui/generator-core` DOM binding over `@crudui/generator-html` markup |
| `react`, `vue`, `svelte` | the framework packages |
| `php`, `go`, `rust` | the server libraries |
| `php-native` | the PHP C extension |

JavaScript has two keys for server output because its model and its string renderer are separate
packages; PHP, Go and Rust ship both in one library and prove model and HTML features under one
key.

## Evidence

A test that runs a shared fixture case records one line for each feature the case proves:
`{"feature", "fixture", "runtime", "case", "passed"}`. `passed` is true only when every assertion
of that case succeeded. The recorders are
[`tests/conformance/evidence.mjs`](../../tests/conformance/evidence.mjs),
[`tests/conformance/evidence.php`](../../tests/conformance/evidence.php), the Go package
`validator/internal/conformance` and the Rust test module `tests/common`. They write only when
`CRUDUI_CONFORMANCE_EVIDENCE` names a directory.

[`scripts/check-conformance.mjs`](../../scripts/check-conformance.mjs) reads that directory and
fails when:

- a supported runtime has no evidence, or failing evidence, for a case of a fixture its feature
  names;
- evidence exists for a feature, fixture, runtime or case the standard does not declare, such as
  a test for a runtime declared `unsupported`;
- a directory under `tests/fixtures` has no registered fixture, or a registered case fixture is
  proven by no feature;
- a feature names a fixture that is not a registered case fixture.

Server runtimes are compared byte for byte with the JavaScript reference output by
[`tests/native-generators/run.mjs`](../../tests/native-generators/run.mjs); client renderers are
compared with the fixture's normalized HTML, where only differences a framework itself causes are
normalized.

`make conformance` clears the directory, runs every suite that records evidence and runs the
check. CI uploads each job's evidence and runs the check once over all of it.
