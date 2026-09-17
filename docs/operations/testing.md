# Test execution

[한국어](testing.ko.md).

Run from the repository root. Install Node dependencies with
`npm ci --strict-allow-scripts`, install the PHP package's Composer dependencies,
and make PHP, Go and Cargo available on `PATH`. Build JavaScript packages before
checking their compiled exports.

The release profile of the cross-check console's Rust validator program uses `strip = "none"`.
This keeps release builds independent of the toolchain's optional `rust-objcopy`/`libLLVM.dylib`
strip pairing; a build must not leave a strip warning after reporting a successful binary.

`make ci` runs every checking command of the CI workflow in the workflow's order, collects the
conformance evidence and checks it as the final CI job does; `tests/build/ci-local.test.mjs` fails
when the list differs from `.github/workflows/ci.yml`. The individual commands are:

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

Validator package suites run the shared fixtures described in the
[fixture contract](../spec/test-fixtures.md).
Compare the expected validation result or complete failure record, not only
agreement between implementations. Package checks verify exported files, declarations,
consumer compilation and production rendering.

## Lint

`npm run lint` runs ESLint over the whole repository (`eslint . --max-warnings 0`); CI's build,
lint and types job and `make ci` call it. `eslint.config.mjs` applies one rule set to every
JavaScript, TypeScript, Vue and Svelte source: packages, examples, tests, scripts, tools and the
root configuration files. It ignores only generated or installed output (`dist`, `out`,
`.svelte-kit`, `node_modules`, `vendor`, `target`, the documentation site's build and generated API
pages, and the native build directories). Per-file settings state only where code runs: browser
globals for browser code, both Node and browser globals for Node programs that hand functions to a
browser page or a DOM environment, CommonJS for the root package's `.js` scripts, and the Svelte
parser and rules for Svelte components. A rule is turned off only for the lines where it does not
apply, with a disable comment that names the rule and gives the reason.

`tests/build/lint-coverage.test.mjs`, run by `npm run test:build`, asks ESLint about every source
that Git tracks or would add and fails when one lies outside the paths `npm run lint` passes, or
when the configuration ignores it or no configuration entry matches it.

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

## Root test command

Root `npm test` runs the test script of every workspace package
(`npm test --workspaces --if-present`), each through the test runner. Build the
JavaScript packages first; the generator suites read the built output.

```sh
npm run build
npm test
```

## Forms and reports

Use the [form verification procedure](verification.md) for raw HTML, DOM, styles,
control state, repeated injection and browser interactions. JSON order and HTTP
save/load checks are separate from validator package tests.

Record the revision, commands, results and deployment status in
[feature status](../features.md). A test result applies to the code and inputs
actually executed. Test counts alone do not establish coverage or deployment.
