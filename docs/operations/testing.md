# Test execution

[한국어](testing.ko.md).

Run from the repository root. Install Node dependencies with
`npm ci --strict-allow-scripts`, install the PHP package's Composer dependencies,
and make PHP, Go and Cargo available on `PATH`. Build JavaScript packages before
checking their compiled exports.

The release profile of the cross-check console's Rust validator program uses `strip = "none"`.
This keeps release builds independent of the toolchain's optional `rust-objcopy`/`libLLVM.dylib`
strip pairing; a build must not leave a strip warning after reporting a successful binary.
Every crate that declares a release profile sets `strip = "none"`;
`tests/build/rust-release-profile.test.mjs`, run by `npm run test:runtimes`, fails otherwise.

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

## Command limits

A script that runs other commands gives each of them a time limit through
`scripts/bounded-command.mjs`: the declared commands of `npm run manifest:test`
(`scripts/run-contract-tests.mjs`, 600 seconds each), the package build of
`scripts/require-current-build.mjs` (600 seconds), each tool command of `scripts/gen-api-docs.mjs`
(600 seconds) and each benchmark driver of `tools/bench/run.js` (600 seconds). The command starts in
its own process group. At the limit the group receives SIGTERM, and SIGKILL once the command ends or
two seconds later, so the wrapper the script started (npm, `go run`, `cargo run`, `/bin/sh`) and
every process under it stop, including one that ignores SIGTERM. The script then fails and names
the limit. Each command prints its elapsed time. `CRUDUI_COMMAND_LIMIT_SECONDS` replaces the limit
for a slower machine. `tests/build/bounded-commands.test.mjs`, run by `npm run test:build`, runs
each script with a command that never ends and a one-second limit.

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

`npm run test:forms` checks the stylesheet layout in Chromium, Firefox and WebKit on the host.
`make test-form-styles-linux` runs the same checks on Linux in the official Playwright image of
the pinned version, as the CI job does, so an engine difference on Linux is found before a push.
The image takes about 10 GB: a run that pulled it removes it when it ends, successful or not, and
leaves an image that was already present.

Record the revision, commands, results and deployment status in
[feature status](../features.md). A test result applies to the code and inputs
actually executed. Test counts alone do not establish coverage or deployment.
