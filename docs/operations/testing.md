# Test execution

[한국어](testing.ko.md).

Run from the repository root. Every tool runs at the release that the checkout records
(`docs/spec/package-build.md`, "Runtime and dependency versions"): `make install` installs the
recorded npm, the npm and Composer dependencies, the Rust toolchain of `rust-toolchain.toml`, the
crates of every Cargo.lock with the OrderedJSON checkout of the comparison (`make install-crates`) and
the phpDocumentor release that `scripts/install-phpdocumentor.sh` checks by its SHA-256,
and `make toolchain-check` names every tool that runs at another release with the expected one.
Install the npm release that `packageManager` of `package.json`
records into the checkout with `node scripts/install-npm.mjs`, which never changes the npm of the
machine; make puts its `.tools/npm/node_modules/.bin` first on `PATH`, and a shell that runs npm
itself puts it there with `export PATH="$PWD/.tools/npm/node_modules/.bin:$PATH"`. Install Node
dependencies with `npm ci --strict-allow-scripts`, install the PHP package's Composer dependencies,
and make PHP, Go and Cargo available on `PATH`, with `php-fpm` and `nginx` for the PHP record
servers of the comparison example (Homebrew: `brew install php nginx`; Debian and Ubuntu:
`php8.x-fpm` and `nginx`, with `php-fpm` linked to the versioned binary). Build JavaScript packages before
checking their compiled exports.

The release profile of the cross-check console's Rust validator program uses `strip = "none"`.
This keeps release builds independent of the toolchain's optional `rust-objcopy`/`libLLVM.dylib`
strip pairing; a build must not leave a strip warning after reporting a successful binary.
Every crate that declares a release profile sets `strip = "none"`;
`tests/build/rust-release-profile.test.mjs`, run by `npm run test:runtimes`, fails otherwise.

During development, run only the unit tests that own the change: its Red and Green cases.
End-to-end checks (browsers, containers, the form comparison, the native and cross-check suites,
full builds), `make owner-check` and the full run `make ci` run in CI on the pull request, and no rule
requires a local check before a push or a commit; the pre-push hook only refuses a push while a
checklist task is `[~]` (below). `make ci` and `make owner-check` remain available on request.

Every step of the workflows runs a make target: the installs (`make install-npm`,
`make install-node-modules`, `make install-composer`, `make install-rust`, `make install-crates`,
`make install-browsers BROWSERS="..."`), the tool check (`make toolchain-check TOOLS="..."`) and each
check (`make test-runtimes`, `make lint`, `make test-forms` and the others of `CI_COMMANDS`), so the
recipes start every tool with the offline settings, `$(NPM)` and the toolchains of the checkout.
`tests/build/ci-local.test.mjs` fails for a step that starts node, npm, npx, cargo, go, php,
composer, rustup, python3 or sh without make.

`make ci` runs every checking command of the CI workflow in the workflow's order, collects the
conformance evidence and checks it as the final CI job does; `tests/build/ci-local.test.mjs` fails
when the list differs from `.github/workflows/ci.yml`.

A failure never stops the later checks, so one run reports every failure. Each CI job runs its
checks in one step, `make ci-targets TARGETS="..."`, which runs every target to its end, and that
step has `if: ${{ !cancelled() }}`, so a failed preparation does not skip the checks of its job;
`tests/build/ci-local.test.mjs` fails with the job and the step of each checking step without it. A Makefile target never takes a target that runs tests as a prerequisite, because
make stops at the first prerequisite that fails; a target that runs several test targets, such as
`make test-native` and `make docs-check`, runs each with `$(MAKE) <target> || status=1` and exits
with the collected status. Make also stops at the first recipe line that fails, so the recipe line
that runs the first check of a target is its last line and runs each check with `|| status=1`,
ending with `exit $$status`, as `make docs-check-documents` and `make format-check` do. Preparation
lines before it, such as a build or an install, still stop the target, and a chain joined by `&&`
whose later steps read the result of the earlier ones, as in `make docs-verify-idempotent`, is one
check. A package script and a CI step follow the same rule: several independent checks run as
`status=0; <check> || status=1; ...; exit $status`, as `npm run test:forms` and
`npm run test:form-comparison:pipeline` do after `node scripts/require-current-build.mjs || exit 1`,
and an `&&` chain puts no step after a check.
`scripts/run-contract-tests.mjs` runs every declared command, also after an earlier one failed, and
fails after the last one.

`make ci` runs once per committed tree, when no task of `docs/plans/execution-checklist.md` is
`[~]`. Before any command it starts `scripts/full-run.mjs`, which prints its decision with the
reason (`[full-run] run: ...` or `[full-run] refuse: ...`) and refuses with status 1 while a task
row of the checklist is `[~]`, listing each active ID with its task; while the pre-push hook is not
installed (`node scripts/push-gate.mjs hooks-check`, below); while tracked files have
uncommitted changes (`git status --porcelain --untracked-files=no`), because a full run verifies a
committed tree; when `var/full-run.json` records a full run of the current tree (`git rev-parse
HEAD^{tree}`), naming that run with its commit, its start time and its result; and while the process
of an `incomplete` record still runs.

The commands run in `var/full-run/clone`, a fresh clone of the committed commit: the guard clones
the checkout into it, checks out the commit and runs `make install` there, so no ignored build
output, run record or untracked file of the working tree reaches a check. A rerun of the same commit
reuses the clone when its installs completed; a failed `make install` stops the run before any
command and names the clone and the commit.

A target of the guard is one command of `CI_COMMANDS`, named by its text. A full run removes the
conformance evidence of earlier runs, runs each command with `sh -c` to its end, also after a
command fails, and prints `[full-run] start <command> (<n>/<total>)` and `[full-run] <command>
passed|failed in <seconds> s`; no command has a time limit. It writes `var/full-run.json` before and
after each command: the tree, the commit, the process, the start and end times, the result
(`incomplete` until the last command ends, then `passed` or `failed`), the failed commands and each
command with its status (`pending`, `running`, `passed`, `failed`), its times and its elapsed
milliseconds. A run that is stopped therefore stays recorded as `incomplete`, with the command that
was running. `var/` is ignored by Git, so each checkout and worktree has its own record. A commit
that changes the tree permits a new full run when no task is `[~]`.

`make rerun-failed` reruns only the commands of the current tree that did not pass: the failed
commands and the commands that an `incomplete` run did not finish. It keeps the conformance evidence
of the commands that passed, which `node scripts/check-conformance.mjs` reads. It is refused like
`make ci` for a task in progress, uncommitted changes and a running process, and also when there is
no record, when the record belongs to another tree and when the full run of the tree passed. It
writes each rerun into `reruns` of the record; when every command has passed, the result of the tree
becomes `passed`.

The CI workflow runs the same commands in its jobs on each pull request, each merge group and each manual run
(`workflow_dispatch`) and does not run `make ci`, so the guard does not decide CI runs. A new checkout, as in CI, has no record, so `make ci`
runs there when no task is `[~]` and the tree is clean.

The native suites run in three CI jobs, so no job waits for a suite that another runtime needs:
`php-engine` runs `make test-php-engine` once with Node.js and the C compiler, `native-generators`
runs `make test-native-generators` and `make test-bench` once, and `php-api` runs `make test-php-api`
for each PHP release of its matrix. `make test-native` runs the three targets in one command
(`docs/operations/native-generators.md`).

On request, `make owner-check` runs the checks that own the changed paths: the uncommitted
changes and new files, the paths of `PATHS`, or the paths changed since `BASE`. `scripts/owner-checks.json`
names, for globs of paths, the make targets, the root npm scripts, the test scripts of workspaces and
package directories and the node test files that own them, and for a check the paths that it reads
(`inputs`). `scripts/owner-check.mjs` fails before any check runs for a path that no rule owns, a glob
without a path, a target of the full suite, an unknown script or test, and a path that a check reads
when no rule of the path selects that check; it runs every selected check, also after one failed, and
never the full suite. `tests/build/owner-check.test.mjs` checks the selection, the refusals and the
declaration of the repository.

A test that reads the commands of a Makefile target runs `makeDryRun` of
`tests/build/make-dry-run.mjs`: `make --no-print-directory -n <target>` with `MAKEFLAGS=w` and without
`MAKELEVEL`, `GNUMAKEFLAGS`, `MAKEFILES` and `MFLAGS` of a parent make, so GNU Make 3.81 and GNU Make 4,
also inside another make, print only the commands. `tests/build/make-dry-run.test.mjs` fails for a dry
run of make outside it.

A push happens only when no task of the checklist is `[~]`. The tracked pre-push hook
`.githooks/pre-push` runs `node scripts/push-gate.mjs hook` with the refs that Git pushes. The check
reads the checklist of every pushed commit (`git show <sha>:docs/plans/execution-checklist.md`) and
of the working tree with `activeItems` of the guard, and refuses the push with status 1 while one of
them has a task in progress. It prints `push refused: checklist tasks are in progress`, one line per
task with the pushed ref and commit or `working tree`, its ID and its title, the reason and the
remedy: complete the task, or mark it `[!]` with its cause and retry condition. A pushed commit
without the checklist, a Git error and an error of the check also refuse the push, naming the cause; a
deleted ref pushes no commit and is checked by the working tree alone.

Git does not version hooks. Every `make` run sets `core.hooksPath` to `.githooks` when it reads the
Makefile and the setting differs, so a checkout that runs any make target has the hook. `make hooks`
installs it and runs `node scripts/push-gate.mjs hooks-check`, which `make hooks-check` also runs:
it fails while `core.hooksPath` is not `.githooks` or `.githooks/pre-push` is not an executable
file, and names the fix. The guard of `make ci` refuses for the same reasons.

A clone without the hook, or a push that skips it, still reaches GitHub. The job `push-gate` of
`.github/workflows/push-gate.yml` runs on every push to any branch but the branches of the merge
queue, on every pull request and on every merge group, checks out the pushed commit (the head
commit of a pull request, the commit of a merge group) and runs
`node scripts/push-gate.mjs commit HEAD`. It fails while the checklist of that commit has a task in
progress, when the commit has no checklist and when it does not track `.githooks/pre-push` as an
executable file (mode `100755`); it prints the refusal through the progress lines, each line as an
error annotation, and in the job summary. The same step runs `make records-check`: `scripts/check-documents.mjs`
and the checklist, link, changelog, writing, example and fixture README tests, which need Node.js alone and read
neither the network nor the history, so a commit that breaks the document or checklist rules fails the check that
the ruleset `main` requires ([Repository settings](repository.md#publishing-main)). `make docs-check-documents`
runs `make records-check` with the rest of its document checks.

The individual commands are:

```sh
composer --working-dir=packages/validator-php install
npm run build
npm test --workspace @polyspec/crudui-validator
composer --working-dir=packages/validator-php test
node scripts/run-tests.mjs go --cwd packages/validator-go -- ./...
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml
npm test --workspace @polyspec/crudui-cli
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

Every registered case of a `node:test` file runs, or the file fails. `node --test` runs with
`--test-force-exit`, which ends a file's process when its known tests end, so a test that leaves a
handle open cannot hold the run; a test that the module registers after that end never runs. Three
checks close that gap:

- The runner preloads `scripts/test-progress/load-check.mjs` into every test file's process. A
  process that ends before its module finished evaluating, top-level `await`s included, fails the
  file with `the process ended before the module finished loading; tests registered later did not
  run`.
- A file that reports no case, neither passed, failed nor skipped, fails with `the file ran no test
  case`, for example when `--test-name-pattern` selects none of its tests.
- The lint rule `crudui/no-await-after-test-registration` of `scripts/lint/node-test-rules.mjs`
  rejects a top-level `await` after the first `node:test` registration of a module, so every case
  is registered before the module's first wait and the first check does not depend on how long the
  earlier cases take.

`tests/build/run-tests.test.mjs` runs files for the first two checks and
`tests/build/test-commands.test.mjs` runs the lint rule on fixtures.

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
- a Makefile target takes a target that runs tests as a prerequisite;
- a recipe line follows the line that runs the first check of its target, a check ends the recipe
  with `|| exit`, or a check of that line does not set `status=1` before the next check;
- a package script or a CI step puts a step after a check in an `&&` chain, or runs several checks
  of which one does not set `status=1` before the command exits with the collected status.

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
the pinned version, as the CI job does after a push, when an engine difference on Linux needs a local run.
The image takes about 10 GB and every checkout of the user account uses the same one, so a run
keeps it, and its container runs under the user-wide holder lock of the image (see
[Shared resources](#shared-resources)). `make remove-form-styles-image` removes the image under the
same lock and is refused while a check runs.

Record the revision, commands, results and deployment status in
[feature status](../features.md). A test result applies to the code and inputs
actually executed. Test counts alone do not establish coverage or deployment.

## Reports

Every CI job leaves the reason of each failure. `make ci-targets TARGETS="..."`
(`scripts/ci-targets.mjs`) runs each target as `make -k <target>` to its end, also after an earlier
target failed, prints its output and writes it to `var/report/ci-targets/targets/<target>.log`;
`summary.md` names each target with its result and time and, for each failed target, its first
failure lines and its log (`scripts/target-report.mjs`), and the same text goes to the job summary of
GitHub Actions. The run holds the lock `var/report/ci-targets.lock`, so two runs never write one
report, and ends with status 1 when a target failed. Each job uploads `var/report/ci-targets` as the
artifact `report-<job>` (with the PHP minor of a matrix job) under `if: ${{ !cancelled() }}` with
`if-no-files-found: error`. `tests/build/ci-local.test.mjs` fails for a job that runs a check outside
`make ci-targets` or uploads no report, and `tests/build/target-report.test.mjs` runs a failing and a
passing probe target and finds both logs, the failure line in the summary and the job summary.

## Shared resources

Runs of different checkouts run on one machine at the same time. A resource that one
run can own is created for that run: a temporary directory from `mktemp -d` or `mkdtemp`, a port
the operating system assigns, or a name that contains the run's identity. A resource that is single
for the machine or the checkout is used under a holder lock of `scripts/holder-lock.mjs`:

- One run holds the lock at a time. The lock file holds the holder's record: the checkout of the
  code that took it, the pid, the start time of that process, the time the lock was taken, the
  command and a random token. The record is written completely to a private file and linked to the
  lock path, and the link fails when the lock exists, so the lock is taken atomically and a reader
  never sees a partial record.
- A run that finds the lock held fails with the holder's record.
- A lock whose holder process no longer runs, or whose pid now belongs to a process with another
  start time, is reported with its record and kept. Remove it explicitly with
  `node scripts/holder-lock.mjs remove-dead <lock file>`, which refuses a running holder.
- Only the holder releases the lock; the release checks the token of the record first.
- `node scripts/holder-lock.mjs hold <lock file> -- <command>` runs a command while holding the
  lock, passes SIGINT, SIGTERM and SIGHUP to it, releases the lock when it exits and exits with its
  status. It prints the acquisition and the release.

The lock of a resource of one checkout is `var/locks/<name>.lock` in that checkout; the lock of a
resource that every checkout of the user account shares is `~/.local/state/crudui/locks/<name>.lock`.
`tests/build/holder-lock.test.mjs`, run by `npm run test:runtimes`, checks the record, the refusal,
concurrent runs, the report and the removal of a lock whose holder no longer runs, and the release.

| Resource | Use by one run |
|---|---|
| Snapshots of `make docs-verify-idempotent` | A directory from `mktemp -d`, removed at the run's exit |
| Playwright image of `make test-form-styles-linux` | User-wide lock `playwright-v<version>-noble`; the run keeps the image, and `make remove-form-styles-image` removes it under the lock |
| Comparison deployment of `make deploy` and `make deploy-verify` | User-wide lock `form-comparison-deployment`, taken before any other step |
| `dist` of each built package | Checkout lock `dist-<package folder>`, held by the package's whole build and by every pack; the build writes `dist.next` and replaces `dist` with it |
| The build stamp, the PHP modules and their build records, the OrderedJSON checkout, `.tools/npm` | Written to a path of the run and renamed into place (`tests/build/atomic-publish.test.mjs`) |

The build script of every built package is `node ../../scripts/package-dist.mjs build '<command>'`,
which runs the build command under the package's `dist` lock. The command writes into `dist.next`,
which `CRUDUI_DIST` names, and a complete build replaces `dist` with two renames, so a test or a
program that reads `dist` during a build finds the previous output or the new one, never an emptied
directory; a failed build leaves `dist` as it was. `node scripts/package-dist.mjs pack
<package directory> <destination directory>` checks under the same lock that `dist` holds output
and runs `npm pack`, whose JSON report it prints on standard output; the package install check and
repositories that install CRUDUI archives pack through it, so a pack never reads a `dist` that a
build has emptied. On Linux the lock reads the start time of a process from `/proc`, since minimal
container images such as the toolchain image of the comparison have no `ps`.

`tests/build/shared-resources.test.mjs`, run by `npm run test:runtimes`, checks the documentation,
image and `dist` rows; it checks the `dist` lock on a fixture package that it builds in a temporary
checkout, so it reads no build output of the repository and runs before `npm run build`;
`examples/form-comparison/check-deployment-lock.test.mjs`, run by
`npm run test:form-comparison:source`, checks the deployment.
