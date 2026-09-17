# Test execution

[한국어](testing.ko.md).

Run from the repository root. Install Node dependencies with
`npm ci --strict-allow-scripts`, install the PHP package's Composer dependencies,
and make PHP, Go and Cargo available on `PATH`. Build JavaScript packages before
checking their compiled exports.

The Rust validator release profile uses `strip = "none"`. This keeps release builds independent
of the toolchain's optional `rust-objcopy`/`libLLVM.dylib` strip pairing; a build must not leave a
strip warning after reporting a successful validator binary.

```sh
composer --working-dir=packages/validator-php install
npm run build
npm test --workspace @crudui/validator
composer --working-dir=packages/validator-php test
node scripts/run-tests.mjs go --cwd packages/validator-go -- ./...
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml
npm test --workspace @crudui/cli
npm run test:forms
npm run test:packages
make docs-check
```

Validator package suites cover their current and legacy cases. Current conformance
checks use the shared fixtures described in the [fixture contract](../spec/test-fixtures.md).
Compare the expected validation result or complete failure record, not only
agreement between implementations. Package checks verify exported files, declarations,
consumer compilation and production rendering.

## Test runner

Every test runs through `scripts/run-tests.mjs`:

```sh
node scripts/run-tests.mjs <node|vitest|go|cargo|phpunit> [--timeout <seconds>] [--cwd <directory>] [--] [<arguments>]
```

The runner prints each test's start, a line while it is still running, its result and its
elapsed time. Every test has its own timeout, 30 seconds unless `--timeout` sets another.
Package scripts, Composer scripts and Makefile targets call test tools only through this runner.

`tests/build/test-commands.test.mjs`, run by `npm run test:runtimes`, fails when:

- a package script, Composer script, Makefile target or CI step calls a test tool directly;
- a CI job has no `timeout-minutes`;
- a script that a test command starts does not print through `scripts/test-progress/progress.mjs`;
- a `node:test` file is run by no project command;
- a TypeScript package has no `typecheck` script, or CI does not run `npm run typecheck`.

`make conformance` runs every suite that records conformance evidence and checks that evidence
against the feature contract; see [conformance evidence](../spec/conformance.md).

## Legacy comparison

Root `npm test` runs `tests/runner/compare-all.js` against
`tests/fixtures/legacy-validate/cases.json`; `--suite <suite>` selects one suite.
It is a legacy comparison, not the current API conformance suite. JavaScript loads
the explicit compiled legacy entry; PHP uses the legacy stdin worker. Go and Rust
legacy executables are rebuilt before their selected comparisons.

```sh
npm run build
npm test
node scripts/run-tests.mjs node -- tests/runner/compare-all.test.cjs
node tests/runner/compare-all.js --js-only --suite required
```

Every selected implementation must execute, match each expected result and agree
with the others. A subprocess failure, unreadable suite or differing expectation
fails the command. A single-language run checks expectations but does not establish
cross-language agreement. Regression tests verify that process failures and
incorrect successful responses cannot pass the runner.

## Forms and reports

Use the [form verification procedure](verification.md) for raw HTML, DOM, styles,
control state, repeated injection and browser interactions. JSON order and HTTP
save/load checks are separate from validator package tests.

Record the revision, commands, results and deployment status in
[feature status](../features.md). A test result applies to the code and inputs
actually executed. Test counts alone do not establish coverage or deployment.
