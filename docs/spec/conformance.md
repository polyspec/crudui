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
| `javascript` | `@polyspec/crudui-validator` and the `@polyspec/crudui-generator-core` model |
| `javascript-html` | the `@polyspec/crudui-generator-html` string renderer |
| `javascript-dom` | the `@polyspec/crudui-generator-core` DOM binding over `@polyspec/crudui-generator-html` markup |
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

## Suite runs

A missing case does not tell whether its suite failed, did not finish or did not run, so each run of
a suite that records evidence also leaves a run record in `runs/` of the evidence directory:
[`scripts/run-tests.mjs`](../../scripts/run-tests.mjs) for the test command it runs and
[`tests/native-generators/run.mjs`](../../tests/native-generators/run.mjs) for itself, through
[`tests/conformance/runs.mjs`](../../tests/conformance/runs.mjs). A record
`{"program", "tool", "cwd", "args", "started", "status"}` is written with `status` `null` when the run
starts and again with the exit status when its process exits, so a stopped run keeps `null`. The
Python suites write theirs through [`tests/conformance/runner.py`](../../tests/conformance/runner.py),
which names itself as the program of each record, so the record does not depend on the Python
executable that runs the suite.

`evidenceSuites` of the check declares each suite with the command that runs it and the runtimes it
proves. For each feature, fixture and runtime with missing or failing evidence, the check names every
suite that proves the runtime with its state: `did not run` when no record matches its command,
`did not finish` when a record has no status, `ended with failure (exit <status>)` or `passed`. The
latest record of each matching command decides, and a suite run by several commands takes the worst
state of them. Every runtime that a feature supports is proven by a declared suite.

Server runtimes are compared byte for byte with the JavaScript reference output by
[`tests/native-generators/run.mjs`](../../tests/native-generators/run.mjs); client renderers are
compared with the fixture's normalized HTML, where only differences a framework itself causes are
normalized.

`make conformance` clears the directory, runs every suite that records evidence and runs the
check. CI uploads each job's evidence under an artifact name of its own and runs the check once
over all of it: the conformance job downloads each artifact into a directory of its own, and the
check reads the evidence files and the `runs/` records of the directory and of its subdirectories,
so no file of one job replaces a file of the same name from another job.
