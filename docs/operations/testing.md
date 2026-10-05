# Test execution

[한국어](testing.ko.md).

Run from the repository root. Install Node dependencies with
`npm ci --strict-allow-scripts`, install the PHP package's Composer dependencies,
and make PHP, Go and Cargo available on `PATH`, with `php-fpm` and `nginx` for the PHP record
servers of the comparison example (Homebrew: `brew install php nginx`; Debian and Ubuntu:
`php8.x-fpm` and `nginx`, with `php-fpm` linked to the versioned binary). Build JavaScript packages before
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
install compilation and production rendering.

## Lint

`npm run lint` runs ESLint over the whole repository (`eslint . --max-warnings 0`); CI's build,
lint and types job and `make ci` call it. `eslint.config.mjs` applies one rule set to every
JavaScript, TypeScript, Vue and Svelte source: packages, examples, tests, scripts, tools and the
root configuration files. It ignores only generated or installed output (`dist`, `out`,
`.svelte-kit`, `node_modules`, `vendor`, `target`, the documentation web's build and generated API
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
The runner stops a Go, Cargo or PHPUnit test at its timeout, and PHPUnit sets no time limit of its
own; `node --test` and Vitest stop a test at its timeout only when the test waits, so they cannot
stop synchronous work.
PHPUnit runs with `--teamcity`: the runner counts each TeamCity test, never a test class or a data
provider method, and prints every line that is not a TeamCity message, such as an error about a
missing test file or the summary with its warnings.

Every failure of a run is printed with its test file and elapsed time, including a failure outside
a test: a hook that fails or runs out of time and an error of a test file. A file or a suite whose
hook fails is printed as failed with the cause, even when every test in it passed; for `node --test`
the failed hook of a file is printed as `{file} › hook`. The summary line names the failed groups,
so a run whose tests all passed and whose tool exits with a nonzero code shows the failure that
caused the code. `tests/build/run-tests.test.mjs` runs a timed-out after hook under `node --test`
and under Vitest.

A setup (a browser launch, a server start, a stylesheet compile, a build) and a teardown (a
browser close, a server stop, a directory removal) are long operations, not test cases. A
`node:test` file registers them with `setup` and `teardown` of `scripts/test-progress/hooks.mjs`, a
`before` or `after` hook of the file, of a suite or of one test (`{ context: t }`) with the timeout
`Infinity`: each ends when its operation settles (the browser launched, the server listens, the
close resolved, the process exited), its error fails the file, and it prints its start, a line
every five seconds while it runs and its end with the elapsed time. A Vitest setup or teardown is a
`beforeAll` or `afterAll` hook with the timeout `Infinity`. A test opens pages of a browser that a
setup launched instead of launching one. `tests/build/hooks.test.mjs` runs files whose setup or
teardown takes 1.5 seconds under a test timeout of one second.

## Time and load

A test never compares an elapsed time with a limit or with another elapsed time, because the
load of the machine changes elapsed time. It checks the cause instead: an event, a result that only
the expected path produces, or an operation that never ends unless the code under test stops it,
under the test's own timeout. `tests/build/test-commands.test.mjs` fails on an assertion that bounds
an elapsed time. A check that an operation takes linear time does one of
two things:

- It counts a deterministic quantity. The JavaScript checks of the validator count reads of the
  data with getters and of the text with a counting `codePointAt`, and fail at the first read
  beyond the reads of a linear walk, because a JavaScript test runner cannot stop synchronous work.
- It runs an input so large that a quadratic or exponential implementation does not end before
  the test's timeout, while the linear implementation ends within a few seconds. The PHP, Go and
  Rust validator checks and the PHP extension engine fixtures do this.

`tests/build/validator-test-clocks.test.mjs`, run by `npm run test:runtimes`, fails when a
validator test or a PHP extension engine fixture reads a clock.

`tests/build/test-commands.test.mjs`, run by `npm run test:runtimes`, fails when:

- a package script, Composer script, Makefile target or CI step calls a test tool directly;
- a CI job or step has `timeout-minutes`. A step runs tests or a long operation (a checkout, a
  toolchain setup, an install, a build, a lint or type check, an upload, a deployment). The runner
  bounds each test case of a test step; a long operation prints its logs and has no time limit. A
  step runs tests when its command calls `scripts/run-tests.mjs` or reaches, through npm scripts,
  Composer scripts and Makefile targets, a test command or the runner;
- a script that a test command starts does not print through `scripts/test-progress/progress.mjs`;
- a `node:test` file is run by no project command;
- a TypeScript package has no `typecheck` script, or CI does not run `npm run typecheck`.

## Commands of long operations

A script that runs other commands runs each of them to its end through `scripts/run-command.mjs`:
the declared commands of `npm run manifest:test` (`scripts/run-contract-tests.mjs`), the package
build of `scripts/require-current-build.mjs`, each tool command of `scripts/gen-api-docs.mjs`, each
benchmark driver of `tools/bench/run.js` and each driver build of `tools/bench/build-drivers.mjs`.
A command has no time limit: its exit ends it and its exit status decides the result, and the
script prints the command with its elapsed time. The command starts in its own process group; when
it exits, the processes it left in the group are stopped, so a process that keeps an output pipe
open cannot hold the script. An interrupted script stops its running commands.
`tests/build/run-command.test.mjs`, run by `npm run test:build`, runs each script with a command
that ends after 1.2 seconds, and checks with the close of the script's output that a child the
command left behind was stopped.

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

`npm run test:forms` checks the stylesheet layout in Chromium, Firefox and WebKit on the host and
the custom properties of the stylesheet (`tests/style-properties.test.mjs`).
`make test-form-styles-linux` runs the same checks on Linux in the official Playwright image of
the pinned version, as the CI job does, so an engine difference on Linux is found before a push.
The image takes about 10 GB: a run that pulled it removes it when it ends, successful or not, and
leaves an image that was already present.

Record the revision, commands, results and deployment status in
[feature status](../features.md). A test result applies to the code and inputs
actually executed. Test counts alone do not establish coverage or deployment.
