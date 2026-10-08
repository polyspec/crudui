# Changes
<!-- doc-id: changelog -->

## Unreleased

### 2026-10-09 — Rust toolchain before the tool install in CI jobs (C14.1-2-1)

- Every job of `ci.yml`, `pages.yml`, `release.yml` and `dependency-review.yml` that runs `make install-tools` installs the Rust toolchain first (`make install-rust`) and checks `rust` with `make toolchain-check`, because `make install-tools` builds cargo-audit with the cargo of `rust-toolchain.toml`.

### 2026-10-09 — Owner check of kit and the rules of the 0.x workflow (C14.1-6)

- `config/owner-checks.json` declares the owner of every tracked path (`make owner-validate`), with owners for the vendored copy (`make kit-check`, `make kit-test`), the configuration files and `scripts/repository-files.mjs`; the target `owner-check` takes `cargo-downloads-check` as a prerequisite. `scripts/owner-check.mjs`, `scripts/owner-checks.json` and the test of the owner check are removed.
- The PHP suites run the PHPUnit of the root `vendor/` through `COMPOSER_VENDOR_DIR=../../vendor` in the Composer scripts and the make targets, because `scripts/kit/run-tests.mjs phpunit` reads `<cwd>/vendor` by default; `composer.lock` records the changed script of `packages/validator-php`.
- `AGENTS.md` and `AGENTS.ko.md` state that `main` is pushed once, when every checklist row is `[o]`, that a tag is created after the CI check `ci-passed` succeeded for the commit, that the shared tools are vendored copies of polyspec/kit that change only in polyspec/kit, and that the repository differs from the other repositories only in `config/*.json`. The rules of the pull request, the merge queue and the ruleset are removed.

### 2026-10-09 — Release tool and 0.x workflows (C14.1-5)

- `config/release.json` declares the 9 archives of the release (7 npm packages as `<package>-npm-<version>.tgz`, 2 Composer packages as `<package>-php-<version>.zip`), the manifests that a tag covers, the Go modules `packages/generator-go` and `packages/validator-go`, the consumer projects `tests/release-install/npm` and `tests/release-install/composer`, and the install of the two crates and two Python packages from the tag. `make release-assets` builds the packages first, and `release.yml` runs `make release-consumer` between the archives and the release. `scripts/release.mjs`, `scripts/release-install.mjs` and their tests are removed; `tests/build/python-git-pins.test.mjs` requires every git pin on this repository in a `pyproject.toml` to name the version of `package.json`. The consumer projects `tests/release-install/npm` and `tests/release-install/composer` name the 0.0.4 archives in the form of the kit (the `artifact` repository `artifacts`, archive names with the language, `polyspec/crudui-validator` as a smoke package so that no zip hash is locked): `release-assets`, `release-consumer-lock` and `release-consumer` wrote and checked them in a scratch clone with a local tag, which this repository does not hold.
- The repository has no pull request, merge queue or ruleset while the version is 0.x: `ci.yml` runs on a push to `main` and on a manual run and never cancels the run of an earlier commit, and `push-gate.yml` runs on every push. `.github/repository.json`, `scripts/github-repository.mjs` and `tests/build/github-repository.test.mjs` are removed. `docs/operations/repository.md` describes the push of `main`, the workflows and the release.
- The CI target `release-install-head`, which installed the archives of `HEAD` before a tag existed, is removed: `scripts/kit/release.mjs assets` builds the archives of an existing tag only, and `make release-consumer` runs in the release workflow before the release is created.

### 2026-10-09 — Document check and commit message rules of kit (C14.1-4)

- `config/documents.json` selects the Markdown documents of the repository (75 pairs), the status table of `docs/features.md` and `CHANGELOG.md`; `config/commits.json` declares the types, the 50 characters of a subject and the 72 characters of a body line. Each English document and its Korean twin hold the marker `<!-- doc-id: <path of the English file> -->`, and the Korean twin holds `<!-- source-sha256: <sha256 of the English file> -->`, which `scripts/generate-feature-contract-docs.mjs` writes for the generated feature contract pages. `scripts/check-documents.mjs`, `scripts/checklist-markers.mjs` and its test are removed.
- The check found four differences between the English and the Korean documents, which are corrected: the code blocks of `examples/cross-check-console/README.md` named three frameworks and the old README link, the Korean release command named `<main의 commit>`, a link text of `docs/spec/form-markup.ko.md` broke across a line, and `tests/build/README` linked two headings that do not exist.

### 2026-10-09 — Push check, full run and CI report tools of kit (C14.1-3)

- `config/checklist.json` declares `docs/plans/execution-checklist.md` with its Korean twin and the hook `pre-push`; `.githooks/pre-push` is the hook that `make hooks` writes (`scripts/kit/git-hooks.mjs`) and runs `scripts/kit/push-gate.mjs`. `make ci` starts `scripts/kit/full-run.mjs` with `conformance-reset`, which removes the conformance evidence of earlier runs, and the make targets of `CI_TARGETS`; a full run no longer runs in a fresh clone of the commit.
- `scripts/package-dist.mjs` and the record servers of the form comparison take the lock of `var/locks` from `scripts/kit/holder-lock.mjs`, whose commands are `run` and `clear`; the lock of the user account (`userLockFile`) is removed. `scripts/push-gate.mjs`, `scripts/full-run.mjs`, `scripts/holder-lock.mjs`, `scripts/ci-targets.mjs`, `scripts/ci-passed.mjs`, `scripts/target-report.mjs` and their tests are removed.

### 2026-10-09 — Toolchain, dependency and test runner tools of kit (C14.1-2)

- `config/toolchain.json` follows `scripts/kit/schema/toolchain.schema.json`; `make install-tools` installs npm, Go and cargo-audit into `var/tools`, and the Makefile puts `var/tools/bin` first on `PATH`. `scripts/install-npm.mjs`, `scripts/checkout-npm.mjs`, `scripts/check-toolchain.mjs`, `scripts/check-cargo-downloads.mjs` and `scripts/install-cargo-audit.mjs` are removed.
- `config/dependency-policy.json` follows the kit shape: `composerPlatforms` names `./composer.json` with PHP `8.4.1` (the lowest PHP release that the locked PHPUnit 13.4.1 supports; `config.platform.php` of `composer.json` and `platform-overrides` of `composer.lock` record it), `taggedNpmPackages` names the OrderedJSON tag `v0.0.3`, and the four React exceptions keep their reason and removal condition. `make dependency-review RECORD=1` wrote `config/dependency-review.json` for the npm, Composer and Cargo locks: 85 registry dependencies and 8 locks, no advisory and the same versions as before. The six Go modules require only modules of the checkout through `replace`, so they add no Go dependency. `scripts/dependency-state.mjs`, `scripts/dependency-review.mjs` and `scripts/check-dependencies.mjs` are removed.
- `scripts/kit/run-tests.mjs` and `scripts/kit/test-progress.mjs` replace `scripts/run-tests.mjs` and `scripts/test-progress`; `tests/conformance/run-suite.mjs` starts the runner for the suites of `scripts/check-conformance.mjs` and leaves their run record. ESLint and the repository rules do not read the vendored copy (`scripts/repository-files.mjs`).

### 2026-10-09 — Vendored tools of polyspec/kit v0.0.4 (C14.1-1)

- `kit.json`, `.kit/kit.lock.json`, `scripts/kit` and `tests/kit` hold the files of the tag `v0.0.4`, and the Makefile includes `scripts/kit/kit.mk`. `make kit-sync KIT_TAG=v0.0.4` wrote the lock and printed `unchanged` on the second run; `make kit-test` passed 322 of 322 tests.

- C13.1-38: the dependencies are at their latest stable release (puppeteer 25.13.0, playwright 1.64.0, vite 8.3.4), their install scripts are approved by exact version, and the review record is written again.
- C13.1-37: the npm lock records the repository packages at 0.0.4 in its dependency entries, as the version bump requires.
### 2026-10-09 — Dependency review record of the 0.0.4 locks (C13.1-36)

- `config/dependency-review.json` records the sha256 of the eight locks that the version bump changed, with no advisory. The review reports four newer stable releases without an exception (`puppeteer`, `playwright` and `vite`); they are raised in a separate change.

### 2026-10-09 — Consumer fixture locks of 0.0.4 (C13.1-35)

- `tests/release-install` names the 0.0.4 archives in its `package.json`, `package-lock.json`, `composer.json` and `composer.lock`. `make release-install-lock` wrote them from the archives of `make release-assets TAG=v0.0.4 RELEASE_COMMIT=HEAD`, so the consumer install check reads the archives of the version of `package.json`.

## 0.0.4

### 2026-10-09 — Stale git pins in the release version check (C13.1-23)

- `scripts/release.mjs` rejects a `pyproject.toml` whose git pin `polyspec/crudui@vX.Y.Z` names a version other than the release version. The problem names the file, the pin and the tag, so `make release-versions` fails before the tag of a Python package release is created.

### 2026-10-08 — Evidence of partial runtimes in the conformance check (C13.1-32)

- `scripts/check-conformance.mjs` accepts the recorded cases of a `partial` runtime: each recorded case must pass, and no case is required. A case outside the fixture of a partial runtime is still reported. The CI job `conformance evidence against the standard` no longer rejects the Python evidence of `createForm`.

### 2026-10-08 — Python conformance suites in the evidence check (C13.1-31)

- `scripts/check-conformance.mjs` declares the suites `validator Python` and `generator Python`, which run through `tests/conformance/runner.py` and prove the runtime `python`. The test `every runtime that a feature supports is proven by a declared suite` passes.

### 2026-10-08 — Python suite run records with the runner exit status (C13.1-33)

- `tests/conformance/runner.py` runs the unittest suite of one test directory and writes its run record with the program `tests/conformance/runner.py` and the exit status of the suite. The make targets `test-validator-python` and `test-generator-python` run it, so the run record of each Python suite is no longer `did not finish`.
- `tests/conformance/runs.py` takes the program, tool, directory and arguments of a run from its caller, and `tests/conformance/evidence.py` no longer records a run at import.

### 2026-10-08 — Stale-pin check deferred to the version-bump pull request (C13.1-23)

- The release check of stale git pins in `pyproject.toml` is not added to `feat/python-C13.1`. The pin `v0.0.4` of `packages/generator-python` names a tag that is created after the version-bump pull request merges, so the check belongs to that pull request. The row C13.1-23 is open and waits for it.

### 2026-10-08 — Node.js setup and Python matrix in the python CI job (C13.1-30)

- The CI job `python` sets up the Node.js release of `.node-version` and checks `node python` with `make toolchain-check`, because its `make ci-targets` run needs Node.js. The toolchain policy test accepts the lowest `requires-python` minor (3.11) as a matrix leg beside the recorded minor.

### 2026-10-08 — Python module names in the generator script docstrings (C13.1-29)

- The docstrings of `packages/generator-python/scripts/generate_interface_messages.py` and `packages/validator-python/scripts/generate_unicode_data.py` name their modules by dotted names, so the package-name rule passes in the CI job `build, lint and types`.

### 2026-10-08 — Python target in the native command of the make-tool-path test (C13.1-28)

- `tests/build/make-tool-path.test.mjs` expects the target list `javascript,html,go,rust,python` of `make test-native`, the list that the Makefile runs, so the test passes in the CI job `build, lint and types`.

### 2026-10-08 — Python 3.11 import of the validator resolver (C13.1-27)

- `packages/validator-python/src/polyspec/crudui/validator/resolver.py` imports the alias `Node` from `parser` and defines the alias `Context` above the annotations that name it, so Python 3.11 imports the module. The CI job `python` failed on 3.11 with `NameError: name 'Node' is not defined`. The validator and generator suites pass on Python 3.11.

### 2026-10-08 — Python implementation of the validator and the generator (C13.1)

- `polyspec-crudui-validator` and `polyspec-crudui-generator` are implemented in Python with the standing of the other language implementations: the shared fixtures run in the Python unit tests with evidence, the feature contracts state the Python support, the CI workflow runs the Python suites in a `python` job, and both packages pass `mypy --strict`.

### 2026-10-08 — Done marker of C13.1-11 restored (C13.1-22)

- The status cell of C13.1-11 holds the done marker in both checklists, and `scripts/check-documents.mjs` passes, exit 0.

### 2026-10-08 — Type hints of the Python packages (C13.1-17)

- Every public definition of `packages/validator-python` and `packages/generator-python` has parameter and return types: the AST count of public definitions without annotations is 0 in both packages. Both packages pass `mypy --strict` with exit 0.

### 2026-10-08 — Type hints of the generator package initializer and the strict check of both packages (C13.1-17-11)

- The `Generator` operations and their helpers have parameter and return types. `mypy --strict` exits 0 on both `packages/validator-python/src` (15 files) and `packages/generator-python/src` (21 files). The validator suite passes 23 tests and the generator suite 11 tests.

### 2026-10-08 — Type hints of the form module (C13.1-17-10)

- The module `form` of `packages/generator-python` has parameter and return types with no `mypy --strict` error. The generator unit tests pass (11 tests), and the native Python checks exit 0.

### 2026-10-08 — Type hints of the binding module (C13.1-17-9)

- The module `binding` of `packages/generator-python` has parameter and return types with no `mypy --strict` error. The generator unit tests pass (11 tests), and the native Python checks exit 0.

### 2026-10-08 — Type hints of the details and form render modules (C13.1-17-8)

- The modules `details` and `form_render` of `packages/generator-python` have parameter and return types with no `mypy --strict` error. The generator unit tests pass (11 tests), and the native Python checks exit 0.

### 2026-10-08 — Type hints of the lists module (C13.1-17-7)

- The module `lists` of `packages/generator-python` has parameter and return types with no `mypy --strict` error. The generator unit tests pass (11 tests), and the native Python checks pass 741 cases, exit 0.

### 2026-10-08 — Type hints of the widget module (C13.1-17-6)

- The module `widget` of `packages/generator-python` has parameter and return types with no `mypy --strict` error. A date or date-time value that is not a string is no longer passed to the date parser; it stays the value of the control. The generator unit tests pass: 11 tests.

### 2026-10-08 — Type hints of the rendering and display declaration modules (C13.1-17-5)

- The modules `rendering` and `display_declaration` of `packages/generator-python` have parameter and return types with no `mypy --strict` error. The generator unit tests pass: 11 tests.

### 2026-10-08 — Type hints of the buttons and choice list modules (C13.1-17-4)

- The modules `buttons` and `choice_list` of `packages/generator-python` have parameter and return types with no `mypy --strict` error. The generator unit tests pass: 11 tests.

### 2026-10-08 — Type hints of the value, design and template modules (C13.1-17-3)

- The modules `value`, `design` and `template` of `packages/generator-python` have parameter and return types with no `mypy --strict` error. The generator unit tests pass: 11 tests.

### 2026-10-08 — Type hints of the foundation generator modules (C13.1-17-2)

- The modules `errors`, `messages`, `input_text`, `numbers`, `dates` and `style` of `packages/generator-python` have parameter and return types with no `mypy --strict` error. The generator unit tests pass: 11 tests.

### 2026-10-08 — Type hints of the validator package (C13.1-17-1)

- Every function of `packages/validator-python/src` has parameter and return types, and the package passes `mypy --strict` with exit 0 (15 source files). The validator unit tests pass: 23 tests. The changes are committed under C13.1-17.

### 2026-10-08 — Generator behavior kept from an earlier session (C13.1-21)

- The generator modules `binding`, `lists`, `value`, `widget`, `__init__`, `dates` and `style` carry the behavior left uncommitted by an earlier session, committed apart from their type annotations. At this state the generator unit tests pass (11 tests) and `node tests/native-generators/run.mjs --target python` reports 741 passed, exit 0.

### 2026-10-08 — Python job in the CI workflow (C13.1-7)

- The `python` job of the CI workflow has a matrix of 3.11 and the recorded release 3.14, runs the validator and generator unit tests through make targets listed in `CI_COMMANDS`, preserves the conformance evidence of the recorded release, and is needed by `conformance` and `ci-passed`. The CI command mapping test passes 15 tests, exit 0. The job itself runs in CI after the push.

### 2026-10-08 — CI mapping test of the native command with the Python target (C13.1-7-3)

- The CI mapping test pins the native generator command of `make test-native-generators` with the python target. `tests/build/ci-local.test.mjs` passes 15 tests, exit 0.

### 2026-10-08 — Python version and feature support of the packages (C13.1-6)

- `.python-version` names Python 3.14 and the recorded toolchain names the same release; the CI workflow sets up 3.14 for the Python job; the owner checks map `.python-version` and the Python package paths; the feature contracts give the Python support of each feature (C13.1-6-1). `make toolchain-check TOOLS=python` exit 0, `make test-ordered-json` exit 0, `tests/build/contract-manifest.test.mjs` 12 passed. `tests/build/runtime-version-policy.test.mjs` fails in this environment on the npm version (`make install-npm` installs the recorded release) and on the Rust toolchain on PATH, not on the Python version.

### 2026-10-08 — Python support of the feature contracts (C13.1-6-1)

- The feature contracts give the Python support of each feature from the recorded evidence: 12 features `pass` (every case of their JSON fixtures has a passing Python record, 0 mismatches), `createForm` is `partial`, four outline and session features are `unsupported` and four client-side features are not applicable. The feature documents and the README pairs name the Python packages; `scripts/check-documents.mjs` passes, exit 0.

### 2026-10-08 — State markers kept out of the record text (C13.1-20)

- The records of C13.1-10 and C13.1-11 write the state markers as words, and `scripts/check-documents.mjs` passes its 53 document pairs, exit 0.

### 2026-10-08 — Python program in the native generator checks (C13.1-7-2)

- The native generator checks run the Python program: `node tests/native-generators/run.mjs --target python` reports 741 passed, exit 0. `make test-native-generators` includes the python target; in this environment that make target stops at its cargo prerequisite check before the checks run.

### 2026-10-08 — Form.setData rejects data that is not an object (C13.1-19)

- `Form.setData` fails with `INVALID_FORM_INPUT` and `Form data must be an object` for data that is not an object. The native generator checks of the Python target pass: 741 passed, exit 0, including `action-failure-keeps-state`.

### 2026-10-08 — Conformance evidence of the Python unit tests (C13.1-7-1)

- The Python unit tests record the conformance evidence of each shared case they run: 1637 records, none failed. Records are written only when CRUDUI_CONFORMANCE_EVIDENCE names a directory.

### 2026-10-08 — Python validator in the cross-check console (C13.1-5)

- The cross-check console runs the Python validator process beside the JavaScript, PHP, Go and Rust processes, and its request comparison requires the five to agree. The server test suite passes: 1267 tests, exit 0.

### 2026-10-08 — Records name commits by checklist id (C13.1-18)

- The records of C13.1-1, C13.1-2, C13.1-3, C13.1-4, C13.1-10 and C13.1-11 name each commit by the checklist id of the task it implements.

### 2026-10-08 — PHP extension built for the architecture of its PHP executable (C13.1-16)

- The PHP extension builder reads the architecture of the PHP executable with
  `lipo -archs` and passes it with `-arch` to the compile and link commands.
  The builder fails when the linked module has another architecture.
  Red: the architecture unit test failed on the missing export. Green: the
  architecture unit test passes (5 tests in `tests/build/php-extensions.test.mjs`),
  `make build-php-extension` builds an arm64 module that loads, and the
  cross-check vitest suite passes: 1267 tests, including the `php-native` process.

### 2026-10-08 — Scope of the form-outline fixture for Python (C13.1-15)

- The row C13.1 declares `tests/fixtures/form-outline` out of scope of the Python
  validator and generator: the reference products of C13.1 do not read it.

### 2026-10-08 — Python version file in the wave plans (C13.1-14)

- The wave plans state that `.python-version` does not exist until C13.1-6 is done.

### 2026-10-08 — Validator test file count in the checklist (C13.1-13)

- The row C13.1-2 counts the five validator test files that `discover` selects
  with the pattern `test_*.py`.

### 2026-10-08 — Validator public names in the shared camelCase surface (C13.1-12)

- `polyspec.crudui.validator` exports `validateList`, `validateDetail` and
  `hiddenPaths`, the names of the shared surface, in place of `validate_list`,
  `validate_detail` and `hidden_paths`. The validator unit tests pass: 23 tests.

### 2026-10-08 — Recorded facts of the committed Python history (C13.1-11)

- The rows C13.1-1, C13.1-3 and C13.1-4 record that no commit adds a `[~]` line
  for C13.1-1 to C13.1-4 before its `[o]`, the committer of the commits
  the C13.1-1 fix commit, the C13.1-3 package commit and the C13.1-4 test commit, and the body of the C13.1-1 fix commit, which
  describes the names before its fix.

### 2026-10-08 — Recorded import cause of the committed Python trees (C13.1-10)

- The rows C13.1-2 and C13.1-4 record that the test directory of
  `packages/validator-python` and of `packages/generator-python` was added by
  the commit that verifies it. Before those commits the directory does not
  exist, and the discover command raises `ImportError: Start directory is not
  importable`.

### 2026-10-08 — Dependencies of the Python generator (C13.1-9)

- `packages/generator-python` no longer declares `polyspec-ordered-json`: no
  generator module imports it. It declares `polyspec-crudui-validator` by the
  tag URL `v0.0.4` of this repository, `packages/validator-python`, because
  the generator imports `polyspec.crudui.validator` at run time.

### 2026-10-08 — Python generator defects found in the review (C13.1-8)

- `Form` binds the one initial row of missing repeated data under the key
  `__0000000000000__`, as `bindForm` and the `empty-collections` contract
  state, instead of a random row key. Red: the `multiple-leaf-empty-placeholder`
  case failed with the key `__0a592ccb0f808__`. Green: the form-render test
  passes all 137 result cases through `createForm` and `renderForm`.
- The text-validity test reads `FormError.path` as the `at` member of a
  generation failure.
- The conformance normalizer has no branch whose two arms are the same.
- The unit tests of `packages/generator-python` pass: 11 tests.

### 2026-10-08 — The Python generator on the shared fixtures (C13.1-4)

- The unit tests of `packages/generator-python` read the shared fixtures and
  compare every case with the recorded expectation: `form-render` (188: 137
  results as parsed normalized trees and 51 failures), `list-render` (157),
  `detail-render` (62), `form-complete` (28) and the `compileForm` (7),
  `bindForm` (9), `createForm` (15), `buildList` (11) and `buildDetail` (6)
  files of `text-validity`.

### 2026-10-08 — The Python generator package (C13.1-3)

- `packages/generator-python` publishes `polyspec-crudui-generator` as the
  namespace package `polyspec.crudui.generator` for Python 3.11 and newer, over
  `polyspec-crudui-validator`: template compilation, field binding, buttons,
  the form instance with its row operations, list and detail models, the
  widget, style and rendering internals and the value helpers. `Generator`
  exposes `compileForm`, `bindForm`, `bindButtons`, `formButtonsHtml`,
  `createForm`, `renderForm`, `renderList`, `buildList`, `renderDetail`,
  `buildDetail`, `sequenceRowKey` and `createRowKey` beside `Form` and
  `FormError`.
- The validator text module gains the message-returning `specificationFailure`,
  `inputFailure` and `optionEntries` helpers, which the generator wraps in its
  `FormError` of code `INVALID_FORM_INPUT`.

### 2026-10-08 — The Python validator on the shared fixtures (C13.1-2)

- The unit tests of `packages/validator-python` read the shared fixtures and reproduce every
  recorded case: `validate` (309: 178 results and 131 failures with `code`, `message` and `at`),
  `expr` (54), `compose` (20), `spec-validity` (34), `list-validity` (20), `detail-validity` (13)
  and the `validate`, `validateList` and `validateDetail` files of `text-validity` with the 12
  value graphs built with shared and self-containing containers.

### 2026-10-08 — The Python validator package (C13.1-1)

- `packages/validator-python` publishes `polyspec-crudui-validator` as the namespace package
  `polyspec.crudui.validator` for Python 3.11 and newer, with the standard library only: the
  composition engine, the forbidden-key scan, the input text and value limit checks, the pattern
  language recognizer and matcher over the Unicode 16.0.0 data of the contract, the condition
  parser, the path resolver, the value definitions with the ECMAScript number text, the 24
  validation rules and the field traversal.
- `validate`, `hiddenPaths`, `validateList` and `validateDetail` answer the shared results;
  `ComposeLoadError` and `FormInputError` carry the failure codes and traces of the other
  implementations.

### 2026-10-07 — Ports of the system for the form comparison runs (C11.6-5)

- `make test-form-comparison-browser` and `make test-form-comparison-summary` start every server on a port of the
  system, so runs at the same time do not collide; `FORM_ADDRESS` and `--address` of `local-verification.mjs` are
  removed.
- The browser summary requires the scheme and host of its origin in every report, without the port, and the source
  identity of the same tree.

### 2026-10-07 — The archive install check of a Go module tag (C11.6-4)

- `make release-install-check` takes the tag of the release: for a Go module tag `<directory>/vX.Y.Z`, which releases
  no archive, it names the tag and installs nothing, and for a tag `vX.Y.Z` it installs the archives of the tag.

## 0.0.3

### 2026-10-07 — The browser checks of each form server in a CI job of its own (C11.6-3)

- The CI job `form-comparison-browser` runs the browser checks of the form comparison in one job per server (`php`,
  `php-ext`, `go`, `rust`) with `make test-form-comparison-browser`; each job has the runner to itself and uploads the
  report of its server.
- The CI job `form-comparison-checks` runs after them with `make test-form-comparison-summary`: the PHP modes,
  generation, persistence, the canonical flow, the browser summary of the four reports, typing and the evidence, each
  once. `local-verification.mjs` takes `--servers`, `--browser-reports` and `--address`; the checks, reports and limits
  are unchanged, and `make test-form-comparison-checks` still runs every check in one run.

### 2026-10-07 — OrderedJSON from the released tag v0.0.3 (C11.6-2)

- The comparison takes OrderedJSON from the tag `v0.0.3` of `polyspec/ordered-json`: `orderedJsonVersion` of
  `examples/form-comparison/src/ordered-json-source.mjs` is 0.0.3 and `make install-ordered-json` checks out `v0.0.3`.
- The Rust record server, its `Cargo.lock`, the `package-lock.json` entry of `@polyspec/ordered-json`, the processor
  check of `tests/ordered-json`, the documents and `config/dependency-review.json` name 0.0.3.

### 2026-10-07 — The install of the release archives in CI (C11.6-1)

- The CI job `build-lint` runs `make release-install-head`: it writes the archives of `HEAD` at the version of
  `package.json` as `make release-assets` writes them and installs them from the consumer fixtures of
  `tests/release-install` with `scripts/release-install.mjs check`, so a broken archive fails CI before a tag. The
  release workflow keeps `make release-install-check`.

### 2026-10-07 — Published manifests that install outside the repository (C11.5)

- The published manifests are the package manifests of `packages/`, packed unchanged. Each names every dependency of
  the scope `@polyspec` and the vendor `polyspec` by its exact version; `packages/generator-php/composer.json` and
  `packages/validator-php/composer.json` declare their `version` and no `repositories`.
- Development resolution is in the root `composer.json` (`polyspec/crudui-workspace`, never published): a `path`
  repository of `packages/validator-php`, the generator sources by `autoload`, and `composer.lock` and `vendor/` at the
  root, which PHPUnit, the PHP checks and the PHP servers load. `scripts/php-package-autoload.php` loads the classes of
  the tested package from its source directory.
- `make release-assets` fails with each packed manifest that differs from its package manifest, names such a
  dependency by a URL, a path, a git source, a range or a development version, or is a `composer.json` with
  `repositories` or without `version`; `tests/build/release.test.mjs` applies the same check to the published
  manifests of the repository.
- `make release-install-check`, a step of the release workflow before the release is created, installs the archives
  from the consumer fixtures of `tests/release-install` in a temporary directory outside the repository: `npm ci` with
  an empty cache and the scope `@polyspec` on an unreachable registry, and `composer install` from an `artifact`
  repository with an empty `COMPOSER_HOME` and `COMPOSER_CACHE_DIR`. `make release-install-lock` regenerates the
  fixture locks from the archives.
- `docs/operations/repository.md` states the install of the release archives with npm and Composer and the
  development resolution.

## 0.0.2

### 2026-10-07 — OrderedJSON from the released tag v0.0.2 (C11.4-2)

- The comparison takes OrderedJSON from the tag `v0.0.2` of `polyspec/ordered-json`, which has a GitHub Release:
  `orderedJsonVersion` of `examples/form-comparison/src/ordered-json-source.mjs` is 0.0.2 and
  `make install-ordered-json` checks out `v0.0.2`.
- The Rust record server, its `Cargo.lock`, the `package-lock.json` entry of `@polyspec/ordered-json`, the processor
  check of `tests/ordered-json`, the documents and `config/dependency-review.json` name 0.0.2.

### 2026-10-07 — Dependency review of the 0.0.2 locks (C11.4-1)

- `config/dependency-review.json` records the review of the 9 locks with the 0.0.2 entries of the packages of the
  repository, written by `make dependency-review RECORD=1`; it found no newer stable release without an exception and
  no advisory, and `make test-dependencies` compares the checkout with it.

### 2026-10-07 — Release notes within the body limit of GitHub (C11.3)

- `make release-publish` writes the section `## X.Y.Z` of `CHANGELOG.md` as the release notes when it has at most
  125000 characters, the limit of a GitHub release body, and otherwise one line that links the section of
  `CHANGELOG.md` at the tag, `https://github.com/polyspec/crudui/blob/<tag>/CHANGELOG.md#<version without dots>`.
- `tests/build/release.test.mjs` requires a section of exactly 125000 characters kept whole and a longer one written
  as the line, for a tag `vX.Y.Z` and a Go module tag.

## 0.0.1

### 2026-10-07 — No container definition for the native suites (C7.20-3)

- `tests/containers/native.Containerfile`, `.dockerignore`, the Apple container procedure of the native generators and
  the container-build rules of the package build specification are removed; the CI jobs `php-engine`,
  `native-generators` and `php-api` run the native suites on their Linux runners.
- `tests/build/runtime-version-policy.test.mjs` fails for a tracked container definition, and a case of
  `tests/docs/repository-writing.test.mjs` fails for a document, other than the checklists and the change logs, whose
  code runs the container CLI of macOS, Docker or Podman.

### 2026-10-07 — Linux style checks on the CI runner (C7.20-2)

- `make test-form-styles-linux`, `make remove-form-styles-image` and `scripts/test-form-styles-linux.sh` are removed;
  the CI job `form-runtime` runs the stylesheet layout checks on its Linux runner with the pinned Chromium, Firefox and
  WebKit builds.
- A case of `tests/docs/repository-writing.test.mjs` fails for a tracked tool, a Makefile line or a workflow that
  invokes the container CLI of macOS, Docker or Podman.

### 2026-10-07 — Form comparison checks against a local stack in CI (C7.20-1)

- `make test-form-comparison-checks` (`examples/form-comparison/local-verification.mjs`) starts the four native record
  servers and the public server as local processes on ports of 127.0.0.1 that the system assigns and runs against them
  the PHP processor modes, the generation, persistence and canonical flow checks, the browser checks of the four
  servers with their interaction checks, the browser aggregate and the typing check; it checks the evidence of every
  report and stops the servers. The CI job `form-comparison-checks` runs it, and `ci-passed` needs it.
- `check-servers.mjs` takes `--origin`, `--data` and `--report`, and the unit tests of the checks run in the source
  suite again.
- The scenario check `serverInvalid` of the comparison frame expects the `detail` paths that the validator reports
  hidden for a store whose `enabled` is off.

### 2026-10-07 — Comparison checks without a container tool of a development machine (C7.20)

- `make deploy`, `make deploy-verify` and `make deploy-watch` are removed with the code that served only them: the
  Compose definition of the comparison service, its supervisor and toolchain image, the source watcher, the tree
  verification with the checks that only it ran, the container runtime resolution, the build targets, their tests and
  the operations page of the deployment. `make test-form-comparison` and `make test-form-comparison-pipeline` keep
  their standard: they start every record server as a local process on a free port of 127.0.0.1, compare the servers
  and stop them. The form comparison specification keeps the record resource, the canonical page and the canonical
  flow check, and the testing procedure describes the form checks.
- A case of `tests/docs/repository-writing.test.mjs` fails for a tracked file, other than the checklists and the change
  logs, that names a container tool of a development machine.

### 2026-10-07 — npm cache by package-lock.json (C12.1-2)

- Every job of the CI, Pages and release workflows that installs the npm packages restores and saves `~/.npm` with
  `actions/cache` under the key of the runner system, its architecture and the hash of `package-lock.json`, before it
  installs npm; `setup-node` caches nothing, because its cache saved the npm directory of the job that finished first,
  also of a job that installs no npm package, and every job restored 700 bytes.

### 2026-10-07 — Native suites in three CI jobs (C12.1-1)

- The native suites run in three CI jobs: `php-engine` runs `make test-php-engine`, the C engine tests of the PHP
  extension, once with Node.js and the C compiler; `native-generators` runs `make test-native-generators`, the Go and
  Rust generator tests, the protocol and widget tests and the shared suite of the JavaScript, HTML, Go and Rust
  targets, and `make test-bench` once; `php-api` runs `make test-php-api`, the build of `crudui.so`, its builder and API
  tests, the PHP generator tests and the shared suite of the PHP and native PHP targets, for PHP 8.4 and 8.5.
  `make test-native` runs the three targets, and `PHP_NATIVE_REPORT` names the report of the PHP targets.
- The job `conformance` downloads the evidence artifact of each job into a directory of its own, and
  `scripts/check-conformance.mjs` reads the evidence and the run records of the directory and its subdirectories, so
  no evidence file of one job replaces a file of the same name from another.

### 2026-10-07 — Release steps, Go module tags and archives (C11.1-4)

- `.github/workflows/release.yml` runs on the tags `v*` and `**/v*`: in a tag filter `*` does not match `/`, so
  `**/v*` covers the Go module tags `packages/<directory>/vX.Y.Z`. The job sets `TAG: ${{ github.ref_name }}` and ends
  with `make release-verify`, `make release-versions`, `make release-assets` and `make release-publish`, whose recipes
  pass the tag as `"$$TAG"`; `make release-assets` runs `make build`, and a Go module tag builds and attaches nothing.
- The release assets are npm tarballs and Composer zips only. A crate is not released as an archive; it is consumed by
  git tag, because `cargo package` rewrites git dependencies into crates.io requirements that do not resolve.
  `tests/build/release.test.mjs` lists how a tag releases each package file of `packages/`.

### 2026-10-07 — GitHub Releases from tags of main (C11.1-3)

- `.github/workflows/release.yml` runs on a pushed tag `vX.Y.Z` or `<directory>/vX.Y.Z`: `make release-verify` requires
  the commit on `main` and its check runs `push-gate` and `ci-passed` concluded `success`, `make release-versions` the
  version of the tag in every package file that the tag covers and the section `## X.Y.Z` of `CHANGELOG.md`;
  `make release-assets` writes the npm and Composer archives of `packages/`, named `<package>-<version>.<extension>`;
  `make release-publish` creates the GitHub Release with that section as its notes and the archives. A Go module tag
  has no archive.
- AGENTS and `docs/operations/repository.md` state the release procedure: the version-bump pull request, the tag of the
  merged commit by the maintainer and the release workflow.

### 2026-10-07 — One completion check of the CI workflow (C11.1-2)

- The last job `ci-passed` of `.github/workflows/ci.yml` needs every other job, runs under `if: ${{ always() }}` and
  runs `make ci-passed RESULTS='${{ toJSON(needs) }}'`, which fails unless every needed job has the result `success`;
  a failed, cancelled or skipped job fails it.
- The ruleset `main` of `.github/repository.json` requires exactly the checks `push-gate` and `ci-passed`, so a new or
  renamed CI job needs no change of the ruleset.

### 2026-10-07 — Changes of the coming release under Unreleased (C11.1-1)

- `CHANGELOG.md` and `CHANGELOG.ko.md` start with the section `## Unreleased`, which holds every entry as a heading
  `### <date> — <title> (<task ID>)`; the release of X.Y.Z names that section `## X.Y.Z` and writes a new empty
  `## Unreleased` above it.
- `tests/docs/changelog.test.mjs` requires `## Unreleased` as the first section, every other section `## X.Y.Z` and
  older than the one above it, every entry inside a section, and the same sections and entries in both files.

### 2026-10-07 — One installed version of each npm package (C5.8-11)

- `make dependency-review UPDATE=1` runs `npm dedupe` after its npm updates, so a package that one version satisfies
  is installed at one version after a workspace raised it.
- The dependency graph check fails for a package that `package-lock.json` installs at two versions when one of them
  satisfies every range of the packages loading either copy.
- The lock installs magic-string 1.4.3 for `@sveltejs/vite-plugin-svelte` and the hoisted undici-types 8.9.0 for
  `@types/jsdom`; the review records the lock.

### 2026-10-07 — Hidden paths in the cross-check form export (C8.3-6)

- The validator processes of the cross-check console answer a form with `{ valid, errors, hidden }`, as `validate` of
  each validator returns it, and a list or detail with `{ valid, errors }`. The gateway requires `hidden` of a form
  result, returns it with each language result of `POST /api/validate` and compares it in order across the languages.
- The fixture export of the form tab writes `expected` as `{ valid, errors, hidden }`, with the errors and hidden paths
  in the order of the validator, so an exported case has the shape of `tests/fixtures/validate/cases.json`;
  `server/fixture-export.test.mjs` compares exported cases with the shared cases.

### 2026-10-07 — Build, encoding and dependency review of the OrderedJSON tag (C10.3)

- The OrderedJSON PHP module is compiled from the C sources that the `config.m4` of the tag checkout declares, and
  PHP loads it as `ordered_json`; a failed command reports the output in which PHP writes a startup failure.
- An encoded form string writes every code unit outside printable ASCII as a `\u` escape, as OrderedJSON `v0.0.1`
  writes a constructed string.
- The dependency check requires `@polyspec/ordered-json` to be linked to the tag checkout at the version of the tag. No
  npm manifest declares a URL or Git dependency, and `.npmrc` sets `allow-remote=none` and `allow-git=none`.
- js-yaml 5.4.3, vite 8.3.3 and svelte 5.57.2; the review records every lock.

### 2026-10-07 — Exact workflow triggers (C6.2-1)

- `.github/workflows/ci.yml` runs on every pull request, merge group and manual run (`workflow_dispatch`),
  `.github/workflows/push-gate.yml` on every push outside `gh-readonly-queue/**`, pull request and merge group,
  `.github/workflows/pages.yml` on a push to `main` and a manual run, and `.github/workflows/dependency-review.yml` on its
  schedule and a manual run; no other workflow exists.
- `tests/build/ci-local.test.mjs` requires the `on:` block of each workflow exactly and no other workflow.

### 2026-10-07 — OrderedJSON from the tag v0.0.1 (C10.2)

- The comparison takes OrderedJSON from the tag `v0.0.1` of `polyspec/ordered-json`: `make install-ordered-json`
  checks out the commit of the tag, keeps a checkout at that commit without tracked changes and replaces any other
  one, and the local pipeline refuses a checkout at another commit than the tag, naming the tag.
- Until version 0.1, a polyspec repository depends on another polyspec repository through a GitHub tag of it.

### 2026-10-07 — Program names of the polyspec convention (C9.2)

- The programs of `examples/`, `tests/` and `tools/` follow the package naming: the cross-check console server is the
  npm package `@polyspec/crudui-cross-check-console`, the crates and binaries are `polyspec-crudui-cross-check-validator`,
  `polyspec-crudui-form-comparison`, `polyspec-crudui-native-generator` and `polyspec-crudui-bench`, and the Go benchmark
  driver is the module `github.com/polyspec/crudui/tools/bench/go`.
- `tests/build/package-names.test.mjs` requires the convention of every tracked `package.json`, `composer.json`,
  `Cargo.toml` and `go.mod`.

### 2026-10-06 — OrderedJSON from the branch main (C10.1)

- The comparison takes OrderedJSON from the branch `main` of `polyspec/ordered-json`: `make install-ordered-json`
  checks out its head, the root `package.json` names `@polyspec/ordered-json` from that checkout, and the record
  servers use the PHP namespace `Polyspec\OrderedJson`, the Go module `github.com/polyspec/ordered-json/go` and the
  crate `polyspec-ordered-json`.

### 2026-10-06 — PHP API pages of the polyspec namespace (C9.1-1)

- The API documentation requires the phpDocumentor pages of `Polyspec\Crudui\`
  (`classes/Polyspec-Crudui-Generator.html` and the pages of `Validator`, `Form` and `FormError`), so
  `make docs-check-documents` passes again; the package name check refuses the page form `CRUDUI-`.

### 2026-10-06 — Package names of the polyspec repositories (C9.1)

- The packages follow the naming of template and hyper: the npm packages are `@polyspec/crudui-*`
  (`@polyspec/crudui-validator`, `@polyspec/crudui-generator-html` and the others), the Composer
  packages `polyspec/crudui-generator` and `polyspec/crudui-validator` with the PHP namespace
  `Polyspec\Crudui\`, also for the classes of the PHP extension, and the crates
  `polyspec-crudui-generator` and `polyspec-crudui-validator`. Imports, `use` statements and
  dependencies name the new packages; the earlier names are gone.

### 2026-10-06 — Hidden paths in the documents of the validation result (C8.3-5)

- The READMEs of the TypeScript, Go and Rust validators, the PHP extension specification, the
  fixture specification and the README of the shared validation cases state the form validation
  result as `valid`, `errors` and `hidden`.

### 2026-10-06 — Native form fixture inventory of 188 cases (C8.4-1)

- The native generator suite expects the 188 form cases of `tests/fixtures/form-render/cases.json`,
  with the row parent and literal identifier cases of `design.show`, and runs each of them on every
  native target.

### 2026-10-06 — One response of the cross-check validator processes (C8.3-4)

- The PHP validator process of the cross-check console writes `{ valid, errors }` for a form, as
  the other processes do and `validators/README.md` states, and the input text cases expect that
  response from every process.

### 2026-10-06 — Hidden paths in the record saves of the form comparison (C8.3-3)

- Every record server of the form comparison answers a save with the validator's result as
  `validation`, `valid`, `errors` and `hidden` unchanged: the JavaScript server no longer replaces a
  passed result with `{ valid: true, errors: [] }`, and the Go and Rust servers add `hidden` to the
  result that they build, also in the response of the benchmark save and validation.
- The record contract expects `hidden` in every save and validation response, and the save of
  record 24 names the notes of the unchecked store in it.

### 2026-10-06 — Public types of the validation results (C8.3-2)

- The public type check of the built packages assigns the results of `validateList` and
  `validateDetail` to `ListValidationResult` and reads `hidden` of the `ValidationResult` of
  `validate`, in ESM and in CommonJS.

### 2026-10-06 — Public build test of hiddenPaths (C8.1-1)

- The public build test expects `hiddenPaths` among the exports of `@crudui/validator`, as
  `contracts/features.json` declares it, and checks its result through the built ESM and CommonJS
  entries.

### 2026-10-06 — Documented validation result type (C8.3-1)

- The interface `ValidationResult` of `@crudui/validator` has its own documentation comment, and
  `ListValidationResult` has one comment, so the documentation coverage of `validator-ts` passes
  again.

### 2026-10-06 — Changes reach main through pull requests and the merge queue (C6.2)

- Every change reaches `main` through a pull request and the merge queue: publish a branch with `git
  push`, `gh pr create` and `gh pr merge --auto --rebase`. The ruleset `main`, now declared in
  `.github/repository.json` and applied by `make github-settings`, requires a pull request, the merge
  queue with the method `REBASE`, a linear history and the checks of `push-gate` and of every CI job;
  the settings enable auto-merge and delete merged branches. CI runs on pull requests and merge
  groups, and `.github/workflows/pages.yml` deploys the documentation web of `main`.

### 2026-10-06 — Shared cases of display switching (C8.5)

- Shared validation cases fix the server result of display switching in the five validators: a
  group subtree with its required fields switched by a sibling, two nested groups switched by the
  same value, and groups inside repeated rows switched by their row and by the value beside the
  collection.

### 2026-10-06 — Rust visibility like the other runtimes (C8.4)

- The Rust validator, and the Rust renderer that uses its visibility, resolve `design.show` as a
  conditional parameter: a string is an expression only when it is a condition expression that
  parses completely, so `enabled` is a literal that shows the field, and a ternary gives its branch
  value, so a branch `0` is not false.

### 2026-10-06 — Hidden paths in the validation result (C8.3)

- The validation result of the five validators holds `hidden`, the data paths of the fields whose
  `design.show` resolves to false, so a server can leave the values of a hidden branch unstored; the
  results of `validateList` and `validateDetail` keep `{ valid, errors }`, which the TypeScript
  validator names `ListValidationResult` and the Go validator `ListValidationResult`.

### 2026-10-06 — A row is one level of a relative path (C8.2)

- A relative path, a conditional parameter and a field reference (`equalTo`, `notEqual`,
  `enddate`) treat a row of a repeated field as one level in the five validators and the eight
  renderers: in a field of a group row `..x` reads the field beside the collection whatever the
  row key is, and a field named with digits is not a row key. The runtimes pass the positions of
  the row keys with the path; a bare field reference resolves as `.name`.

### 2026-10-06 — Live display in the browser binding (C8.1)

- The browser binding sets the `hidden` attribute of every node from its `design.show` against
  the current data when it binds and after every change, removes the errors of a node that becomes
  hidden and of the nodes inside it, and changes no value; `hiddenPaths(spec, data)` of
  `@crudui/validator` returns the hidden paths.

### 2026-10-06 — One CI run per ref (C7.19)

- A new push to a ref cancels the CI run of its previous push; the push check still runs for every
  pushed commit.

### 2026-10-06 — Full run in a fresh clone (C5.7)

- `make ci` runs its commands in `var/full-run/clone`, a fresh clone of the committed commit after
  `make install`, so no ignored output of the working tree reaches a check.

### 2026-10-06 — Stub stall closed with its evidence (C7.13)

- The 30 s stall of the stub programs did not recur in 12 CI runs and 3 local runs; their first
  executions took up to 81 ms on Linux and up to 979 ms on macOS, and the logging stays.

### 2026-10-06 — Offline package install (C7.16-1)

- The install project of `npm run test:packages` installs with `npm ci --offline` from a lock that
  `scripts/install-lock.mjs` derives from the root lock, so it installs the releases of the root lock
  and resolves no range against a registry.

### 2026-10-06 — A report for every CI job (C7.18)

- Every CI job runs its checks with `make ci-targets`, which runs each target to its end, and uploads
  the log of each target with a summary of the first failure lines of each failed one, which also goes
  to the job summary.

### 2026-10-06 — Checklist wording (C7.15-1)

- The rows C7.15 and C7.16 describe the pre-push hook and the documentation job without the word
  that the writing check refuses, which failed the documentation job of CI.

### 2026-10-06 — CI through make (C7.17)

- Every step of the workflows runs a make target, so the offline settings, the checkout npm and the
  downloads check of the Makefile apply to CI: the install targets, `make toolchain-check TOOLS=...`
  and one target for each checking command, which `make ci` runs in the same order.

### 2026-10-06 — Offline checks (C7.16)

- The Makefile runs cargo, go, npm and Composer offline, and only the install targets and the
  dependency review download. `make install-crates` downloads the crates of every Cargo.lock, and a
  target that runs cargo fails first with the lock and `run make install` when a crate is missing.
  The comparison pipeline reads the OrderedJSON checkout of `make install-ordered-json` instead of
  fetching it.

### 2026-10-06 — Unit tests in development, every other check in CI (C7.15)

- Development runs the unit tests that own a change; end-to-end checks, `make owner-check` and
  `make ci` run in CI after the push, and no rule requires a local check before a commit or a push.
  The pre-push hook still refuses a push while a checklist task is in progress.

### 2026-10-06 — RustSec advisories of the Cargo locks (C5.8-1)

- The dependency review reads the advisories of the six Cargo locks from RustSec with cargo-audit
  0.22.2, which `make install` installs into `.tools/cargo-audit`, and records each lock with its sha256;
  `npm run test:dependencies` fails for a Cargo lock changed after its review or with an advisory at it.

### 2026-10-06 — Dependency review (C5.8)

- `npm run test:dependencies` compares the dependencies with the review recorded in
  `config/dependency-review.json` instead of running `npm audit` against the registry, so the same tree
  gives the same result on every day. `make dependency-review` asks the registries for newer stable
  releases and advisories, `RECORD=1` records the review and `UPDATE=1` updates first; a scheduled
  workflow runs it every day. React 19.2.8 is kept by a recorded exception (C5.8-2-1), and
  typescript-eslint moves to 8.71.1, the release that the first review found.

### 2026-10-06 — PHPUnit 13 (C5.8-10)

- validator-php and generator-php test with PHPUnit 13.4.1, and their 18 data providers are declared
  with the attribute `#[DataProvider(...)]`, since PHPUnit 12 removed the `@dataProvider` annotation.
  Both suites run the same 763 and 311 cases as with PHPUnit 10.5.

### 2026-10-06 — Checks that read the files of the checkout (C7.14)

- ESLint ignores every path that Git ignores, and the checks that walked the tree with their own lists
  of skipped directory names read the tracked files through `scripts/tracked-files.mjs`: a copy of a
  `dist` under the ignored `var/` failed `npm run lint`, and a stray file under an ignored directory
  could change the other checks. `tests/build/tracked-files.test.mjs` fails for a new list of skipped
  directory names.

### 2026-10-06 — jest-dom 7 (C5.8-9)

- generator-react tests with `@testing-library/jest-dom` 7.0.1; it stayed at 6.9.1 because 6.10.0 was
  deprecated as a minor release with breaking changes, which 7 publishes as a major.

### 2026-10-06 — @sveltejs/package 3 (C5.8-8)

- generator-svelte packages its components with `@sveltejs/package` 3.0.0; the 57 files of its `dist`
  are identical to those of 2.5.8.

### 2026-10-06 — Node.js type definitions of the running major (C5.8-7)

- The six TypeScript workspaces use `@types/node` 26.6.4, the major of the recorded Node.js 26.8.1;
  they described Node.js 25. `tests/build/runtime-version-policy.test.mjs` fails for an `@types/node`
  range of another major than `.node-version`.

### 2026-10-06 — js-yaml 5 with the YAML 1.2 core schema (C5.8-6)

- The cli and the cross-check console use js-yaml 5.4.2 through its named `load` export. Its default
  schema is the YAML 1.2 core schema, as the `yaml` package of `scripts/check-schema.mjs` reads it: a
  date-like value stays a string and `<<` is a plain key, where js-yaml 4 read a `Date` and merged. A
  case of each path pins it.

### 2026-10-06 — jsdom 30 in the whole tree (C5.8-5)

- The root and generator-react use jsdom 30.1.2, the release of form-binding, so one major of jsdom
  runs in the tree instead of 29.1.1 beside 30.1.2.

### 2026-10-06 — Failed Vitest hooks named from the events of Vitest (C5.8-4-1)

- The Vitest reporter prints `<hook name> hook of <entity> started and failed` for a hook that started
  and did not end before its file or suite failed, and the runner case asserts the hook name and the
  failed entities instead of the message of Vitest, whose wording changed from Vitest 4 to 5. Vitest
  5.0.3 sends no `onHookEnd` for a failed hook and batches its events, so neither the elapsed time nor
  the failure kind is asserted.

### 2026-10-06 — The first execution time of test stubs logged (C7.13-1)

- The stub cases of `tests/build/checkout-npm.test.mjs` and `tests/build/install-browsers.test.mjs` log
  the elapsed time of the first execution of each stub, so a recurrence of the 30 s stall of C7.13,
  which waits for that evidence, explains itself.

### 2026-10-06 — Python pinned by its minor release (C7.12)

- `config/toolchain.json` records Python 3.9, which runs the tests of `tests/ordered-json`, and
  `node scripts/check-toolchain.mjs python` compares the running major and minor and prints the patch.
  The build-lint job of CI sets it up with `actions/setup-python` by commit SHA and runs
  `make test-ordered-json`, which `make ci` runs too; no command ran those tests before C7.9.

### 2026-10-06 — PHP pinned by its minor release (C7.2-3)

- `config/toolchain.json` records the PHP minors 8.4 and 8.5, and `node scripts/check-toolchain.mjs`
  compares the major and minor of the running PHP with them; setup-php and Homebrew cannot install the
  same patch, so the exact patch record failed on one of them. The patch of a run is evidence: the
  check prints the running release of every tool and `var/full-run.json` records them. The container
  images keep their exact tags with digests. The local check now covers PHP, which closes C7.2-1.

### 2026-10-06 — The Chrome sandbox helper installed by one command (C7.2-4)

- `scripts/install-browsers.mjs` installs the sandbox helper with `sudo install -o root -g root -m 4755
  <chrome_sandbox> /usr/local/sbin/chrome-devel-sandbox`. It put `install` twice into the command, so
  every browser job of CI failed at the browser installation and Chrome aborted without its helper.

### 2026-10-05 — The owner check before every commit (C7.9)

- `make owner-check` runs the checks that `scripts/owner-checks.json` declares as owners of the changed
  paths: make targets, root npm scripts, the test scripts of workspaces and package directories and
  node test files, never the full suite. It fails before any check for a path without an owner, a
  glob without a path, a full-suite target, an unknown script or test, and a path that a check reads
  (`inputs`) when no rule of the path selects that check; every selected check runs after an earlier
  one failed. AGENTS makes it the check before a commit, since the owning checks of a change were
  chosen by hand. `make test-ordered-json` runs the Python unit tests of `tests/ordered-json`, which no
  command ran, and `make install` installs phpDocumentor, which `make docs-check` reads.

### 2026-10-05 — Failures that name what failed and why (C7.8)

- A test that outlives its timeout prints its elapsed time, its limit and the command that the runner
  stops; the other limits of the checks name their command, limit and elapsed time too.
  `scripts/run-tests.mjs` reports a tool that cannot start with its path, the error and the command
  that installs it instead of ending on an unhandled error; a Go package that ran no test case is
  reported as `ran no test case` instead of passed. Every file read of the Rust programs and tests
  names the path and the error; `tests/build/failure-messages.test.mjs` fails for a read that drops
  them.

### 2026-10-05 — A stopped process tree is gone when the stop ends (C7.10)

- `killProcessTree` of the form comparison step runner resolves when the step's process has exited
  and its output pipes have closed, which happens when every process that holds them has ended; it
  returned right after it sent SIGKILL, so a later step could meet a process of the stopped one. When
  the output stays open after the kill, a process outside the tree holds it and the stop fails with
  that cause. The local server test waits for the end of a Unix socket connection instead of a FIFO,
  whose blocking open kept the test file alive beyond its timeout when the stand-in did not start.

### 2026-10-05 — Servers on the ports they take, and locked shared steps (C7.11)

- Every server of the form comparison binds its address, port 0 included, and names the address it
  took on its readiness line `CRUDUI_READY {server} {host}:{port}`; the PHP launcher passes its bound
  socket to nginx, which reads it from the variable `NGINX`. The local stacks start every server on
  `127.0.0.1:0` and reach it on the announced address; `freePort` probed a port and released it to a
  later process, which another process could take in between.
- The reinstall of the generator-php vendor runs under the checkout lock `composer-generator-php` in
  make, the local servers and the comparison build, and the guard of `make ci` holds the checkout
  lock `full-run`, so two runs of one checkout never reinstall or decide from one record at once.

### 2026-10-05 — Shared outputs published by rename (C7.6)

- The PHP extension builder compiles into a directory of its process, links `<module>.so.<pid>`, loads
  and checks it and renames it to the module path; it removed `.build` and `modules` first and linked
  in place, so a PHP process could load a missing or partial module. The OrderedJSON checkout is made
  beside its directory and renamed into place. Every package build writes into `dist.next`
  (`CRUDUI_DIST`) and `scripts/package-dist.mjs` replaces `dist` with it under the `dist` lock, so a
  reader never sees the `dist` that `tsup --clean` emptied; a failed build leaves `dist`. The build
  stamp of `require-current-build` is written and renamed. `tests/build/atomic-publish.test.mjs` keeps
  every shared output on that form.

### 2026-10-05 — Checks that read only what they or their preparation create (C7.5)

- `make test-php-extension` reinstalls the validator copy of generator-php before its tests, which
  load that vendor directory; only `make test-native-suites` refreshed it. `test:build` runs
  `require-current-build` before the tests that load the packages through their exports.
  `scripts/repeat-build.mjs` compares its own two builds and fails with every file that differs; its
  test read the records that only that script wrote. `scripts/run-rust-command.mjs` refuses a
  `CARGO_TARGET_DIR` outside the checkout of its directory, because cargo judges freshness by
  modification times and reuses the outputs of another checkout.

### 2026-10-05 — Every check of a script after a failure (C7.4)

- `test:forms`, `test:form-comparison`, `test:form-comparison:pipeline`, `docs:check:all`, the `test`
  script of generator-svelte and the `typecheck` script of form-binding run each independent check
  with `|| status=1` and exit with the collected status; they chained the checks with `&&`, so the
  first failure skipped the others. `test:form-comparison:build` is removed and each form comparison
  suite runs `require-current-build` for the packages it reads. CI and `make ci` run `npm run
  test:build` and `npm run test:build:repeat` as two commands. `scripts/run-contract-tests.mjs` runs
  every declared command and fails after the last one. `tests/build/test-commands.test.mjs` fails
  for a package script or a CI step that stops at a failing check.

### 2026-10-05 — Runs that check nothing fail (C7.3)

- `scripts/run-tests.mjs` fails a go, cargo or phpunit run and the Vitest reporter fails a vitest run
  in which no test case passed, failed or ran out of time, with `ran no test case`;
  `scripts/run-contract-tests.mjs` fails with `ran no command` when the selected features declare no
  verification command. Such runs passed while they checked nothing.
- The PHP check of the container definitions reads the `php` stages and the `php8.N-*` packages and
  fails on an empty list; it iterated over the `FROM php:` stages, of which there were none, while
  both images installed the Debian PHP 8.4. Both images now take PHP from the `php` image of the
  recorded 8.5.11 and Composer from the `composer` 2.10.3 image, each by digest, and the PHP
  extension builds use `/usr/local/bin/php-config`.
### 2026-10-05 — One visible page for the Tailwind style checks (C5.11)

- `tests/tailwind-styles.test.mjs` computes the styles of `crudui.css` and of the Tailwind version in
  one page per engine and width, which holds both stylesheets and applies one with its `media`. The
  test opened two pages in one browser, the first page was hidden in Chromium and Firefox, and under
  memory pressure a call on the hidden Chromium page waited up to 44.2 s on page-ins, past the timeout
  of a case. Each call now fails unless its page is visible and only the requested stylesheet applies.

### 2026-10-05 — The toolchain image test with the digest stages (C7.2-2)

- `examples/form-comparison/check-toolchain.test.mjs` requires the stages of the comparison image as
  the recorded releases with their digests. C7.2 changed the stages and was committed while this test
  still required the release lines.

### 2026-10-05 — Exact toolchain versions everywhere (C7.2)

- The specification records exact versions instead of release channels, which made the toolchain of
  a run depend on its date. `.node-version` is 26.8.1, `.go-version` 1.27.0 with a `toolchain` line in
  every `go.mod`, `rust-toolchain.toml` 1.98.1 with `rustfmt` and `clippy`, and
  `config/toolchain.json` records PHP 8.4.26 and 8.5.11, Composer 2.10.3 and the SHA-256 of the Linux
  Node.js archive. The Makefile, CI and the images set `RUSTUP_AUTO_INSTALL=0` and
  `GOTOOLCHAIN=local`; `make install` installs the npm, the dependencies and the Rust toolchain, and
  `node scripts/check-toolchain.mjs` fails for a tool at another version with the record, the expected
  and the running version and the fix; every CI job runs it for the tools it set up.
- CI runs on `ubuntu-24.04` with every action named by the commit SHA of a release; container stages
  name their images by tag and digest and install Debian packages from the snapshot of 2026-10-05.
  Chrome and Firefox run at the builds that puppeteer pins and WebKit at the build of playwright
  (`node scripts/install-browsers.mjs`), in CI with the sandbox helper of that Chrome; the Linux style
  check downloads the Node.js archive of `.node-version` and checks its SHA-256.
  `scripts/run-contract-tests.mjs` runs `sh -c` instead of a login shell.

### 2026-10-05 — The checkout npm module in the copies of the tests (C7.7-1)

- `tests/build/rust-node-entry-points.test.mjs` and `tests/build/run-command.test.mjs` copy
  `scripts/checkout-npm.mjs` with the scripts that import it since C7.7, which failed to load
  without it in their temporary checkouts.

### 2026-10-05 — npm of the checkout, not of the machine (C7.7)

- `node scripts/install-npm.mjs` installs the npm release of `packageManager` into the ignored
  `.tools/npm` of the checkout with `npm install --prefix` into a temporary directory that it renames
  into place, and never runs `npm install --global`. It replaced the npm of the machine, which every
  repository uses, and broke the `npm ci` of another repository. The Makefile exports
  `PATH` with `.tools/npm/node_modules/.bin` first and starts npm in its recipes as `$(NPM)`, because
  GNU Make 3.81 looks up a recipe program without shell syntax on the `PATH` it started with; every
  script that starts npm calls `useCheckoutNpm` of `scripts/checkout-npm.mjs`, and every CI job adds
  the directory to `GITHUB_PATH` before its first npm command. `tests/build/checkout-npm.test.mjs`
  fails for any other form.

### 2026-10-05 — Make dry runs that read the same on every make (C7.1)

- Tests read the commands of a Makefile target through `makeDryRun` of `tests/build/make-dry-run.mjs`,
  which runs `make --no-print-directory -n` with `MAKEFLAGS=w` and without the variables of a parent
  make. GNU Make 4 inside another make printed `Entering directory` lines around the commands, so
  `tests/build/full-run.test.mjs` failed there. `tests/build/make-dry-run.test.mjs` fails for a dry
  run of make outside the helper.

### 2026-10-05 — React kept at 19.2.8 (C5.8-2-1)

- React and React DOM are pinned to 19.2.8. React 19.3.0 reports a browser error for the `<script>`
  elements of widget scripts that the React renderer renders, so the React cases of
  `tests/widget-script-runs.test.mjs` failed in three browsers after C5.8-2 raised React. The update
  is retried when the React renderer runs widget scripts without `<script>` elements in client
  rendering.

### 2026-10-05 — Vitest 5 (C5.8-4)

- The root and the eight workspaces test with Vitest 5.0.3. Vitest 5 prints a failed hook with the
  `Error:` prefix of its stack, and the runner case for a timed-out Vitest hook accepts it.

### 2026-10-05 — TypeScript 7 for the workspace compilers (C5.8-3)

- The seven TypeScript workspaces build and type-check with TypeScript 7.0.2. typescript-eslint,
  typedoc, svelte-check and `@sveltejs/package` declare peer ranges below 7, so they keep the
  TypeScript 6.0.3 that npm installs at the root as their peer.

### 2026-10-05 — Dependencies at the latest release of their major (C5.8-2)

- 19 npm dependencies of the root and workspace manifests and PHPUnit in both Composer packages are
  raised to the latest stable release of their locked major, among them `puppeteer` 25.12.0,
  `eslint` 10.12.0, `react` and `react-dom` 19.3.0, `vite` 8.3.2 and PHPUnit 10.5.66. Each
  manifest keeps its range operator, the `react` overrides follow the direct ranges, and the install
  script approval names `puppeteer@25.12.0`. `@testing-library/jest-dom` stays at 6.9.1 because its
  publisher deprecated 6.10.0 as a minor release with breaking changes.

### 2026-10-05 — One npm release locally, in CI and in the images (C5.2-2)

- `packageManager` of `package.json` records npm 12.2.0, and `node scripts/install-npm.mjs`
  installs exactly that release. Every CI job runs it before npm, and the native test and comparison
  images install the same release. CI ran `npm i -g npm@latest`, so its npm changed with the
  registry: npm 12 broke a test that passed with npm 11 locally.
  `tests/build/runtime-version-policy.test.mjs` fails when the running npm, a workflow step or a
  container definition selects another release.

### 2026-10-05 — Every check of a recipe after a failure (C5.10)

- `make docs-check-documents` and `make format-check` run every check of their recipes with
  `|| status=1` and exit with the collected status. Make stops at the first recipe line that fails,
  so a failing `npm run manifest:check` skipped the other document checks, the documentation tests
  and the documentation build, and the first Rust crate that differed from rustfmt skipped the
  other crates and gofmt. `tests/build/test-commands.test.mjs` fails for a recipe line after the
  first check of its target, for `|| exit` in a check and for a check that does not set `status=1`.

### 2026-10-05 — Every registered node:test case runs or its file fails (C5.9)

- `scripts/run-tests.mjs` preloads `scripts/test-progress/load-check.mjs` into every `node:test`
  file's process, which fails a file whose process ends before its module finished evaluating, and
  the node reporter fails a file that reports no case. The lint rule
  `crudui/no-await-after-test-registration` of `scripts/lint/node-test-rules.mjs` rejects a
  top-level `await` after the first `node:test` registration. `node --test --test-force-exit` ends
  a file's process when its known tests end, and `packages/php-ext/tests/engine.test.mjs`
  registered tests after top-level `await`s: a case before the first `await` ran alone, and with
  `--test-name-pattern` the file passed while no case ran. engine.test now reads its fixtures
  synchronously and imports the Unicode data generator statically.

### 2026-10-05 — The npm pack report of npm 12 (C5.2-1)

- The dist lock test of `tests/build/shared-resources.test.mjs` reads the `npm pack` report through
  `packReport` of `scripts/package-install-pack.mjs`, which reads the array of npm 11 and the
  object keyed by package name of npm 12, and fails with the expected archive count and package
  name. With npm 12, which CI installs as the latest npm, the test failed with `TypeError: object
  is not iterable`, which does not say what was expected.

### 2026-10-05 — Pushes refused while a task is in progress (C6.1)

- The tracked pre-push hook `.githooks/pre-push` runs `node scripts/push-gate.mjs hook`, which
  reads the checklist of every pushed commit and of the working tree with `activeItems` of
  `scripts/full-run.mjs` and refuses the push while a task is `[~]`, naming each task with its ID
  and title, the reason and the remedy. A pushed commit without the checklist, a Git error and an
  error of the check also refuse the push. Before, a push with a task in progress reached GitHub.
- Every `make` run sets `core.hooksPath` to `.githooks`; `make hooks` installs and checks the
  hook, `make hooks-check` fails while it is not installed, and the guard of `make ci` refuses
  while it is not installed.
- The job `push-gate` of `.github/workflows/push-gate.yml` runs `node scripts/push-gate.mjs commit`
  on every pushed commit and pull request and fails for a commit with a task in progress, without
  the checklist or without the executable hook, so a push past the hook fails it.

### 2026-10-05 — A comma locale written with warnings (C5.6)

- The engine tests report the build of the comma locale on Linux by its result: `localedef -c`
  exits with status 1 when it writes the locale with warnings, and the step printed
  `comma locale: compiling: failed (1)` before its test passed. Status 1 with a written
  `LC_NUMERIC` is now reported as `wrote the locale with warnings (exit 1)`, and any other status
  other than 0 fails the build. A case of `packages/php-ext/tests/engine.test.mjs` runs the build
  with a stub `localedef`.

### 2026-10-05 — The suites behind missing conformance evidence (C5.5)

- `scripts/check-conformance.mjs` names, for each feature, fixture and runtime with missing or
  failing evidence, every suite that proves the runtime with its state: did not run, did not
  finish, ended with failure and its exit status, or passed. `scripts/run-tests.mjs` and
  `tests/native-generators/run.mjs` write a run record to `runs/` of the evidence directory through
  `tests/conformance/runs.mjs`, with the status null at the start and the exit status at the exit,
  and `evidenceSuites` declares each suite with its command and runtimes. The check reported
  `185 missing` for each runtime when the native suite did not run and did not say why. The count
  of evidence files no longer includes the `runs` directory.

### 2026-10-05 — One compiler command for the engine tests (C5.4)

- Every C program of `packages/php-ext/tests/engine.test.mjs` compiles through
  `compileAndRunEngineProgram`, which links the math library. The template and value tests wrote
  their own compiler commands, and the template test, without `-lm`, failed on Linux with
  `undefined reference to 'log10'`; macOS has the math functions in its system library. A case of
  the file fails when the file holds more than one compiler command or when that command does not
  link `-lm`.

### 2026-10-05 — Character constants in long C strings (C5.3)

- `cString` of `packages/php-ext/tests/engine.test.mjs` writes each byte of a value longer than
  4000 bytes as a character constant with an octal escape. It wrote the bytes as integers, so a
  UTF-8 byte above 127 initialized a `char`, and GCC failed the render fixtures with
  `-Werror=overflow`; Apple clang accepts both forms. A case of the file fails for an integer above
  127 in the initializer and decodes the constants back to the bytes of the value.

### 2026-10-05 — A dist lock test without build output (C5.2)

- `tests/build/shared-resources.test.mjs` checks the `dist` lock on a fixture package that it
  builds and packs in a temporary checkout. CI runs `npm run test:runtimes` before `npm run build`,
  and the test failed with `ENOENT` on `packages/generator-html/dist`, while a local run read the
  `dist` of an earlier build. In a worktree without build output the test failed before the change
  and passes after it.

### 2026-10-05 — Every check after a failure (C5.1)

- Every workflow step that runs a checking command has `if: ${{ !cancelled() }}`, and `make
  test-native` and `make docs-check` run each of their test targets with `$(MAKE) <target> ||
  status=1` and exit with the collected status. CI skipped Lint, Type-check, the
  dependency check and the benchmark drivers after one failed step, and `make test-native` stopped
  at its failed prerequisite `test-php-extension`, so `tests/native-generators/run.mjs` wrote
  neither its report nor its conformance evidence. `tests/build/ci-local.test.mjs` fails with the
  job and step of a checking step without the condition, `tests/build/test-commands.test.mjs`
  fails for a Makefile target that takes a target that runs tests as a prerequisite, and
  `tests/build/make-tool-path.test.mjs` runs `make test-native` with a failing PHP extension test
  command. The native import check of `tests/build/dependency-health.test.mjs` read only the recipe
  lines of `test-native` and checked an empty list; it follows prerequisites and `$(MAKE)` targets
  and fails for an empty list.

### 2026-10-05 — A checklist of headings and task tables (C4.1-2)

- The execution checklist holds only headings and task tables, and `scripts/check-documents.mjs`
  fails for any other line with its file, line and column. The checklist held a translation link, a
  paragraph on its content, the How to use rules and a paragraph of dependencies and background
  under each wave, and no check told such text from tasks. The rules are in AGENTS, and the
  dependencies and the background of the waves are in `docs/plans/waves.md`, which each wave heading
  links. The case of `scripts/checklist-markers.test.mjs` failed before the change.

### 2026-10-05 — Task list states as state markers (C4.1-1)

- `scripts/check-documents.mjs` also fails for an x or a capital X between brackets in the
  execution checklist that is not the state of a task row, because a Markdown reader takes these
  forms as task list states. The case of `scripts/checklist-markers.test.mjs` failed before the
  change, because the check reported neither form.

### 2026-10-05 — Task state markers only as task states (C4.1)

- A task state marker appears in the execution checklist only as the state of a task row, at the
  start of its last cell. The legend of the checklist and the text of C2.1-2 wrote markers in inline
  code, so a tool that counted markers counted tasks in progress that do not exist.
  `scripts/check-documents.mjs` now fails for any other marker in both languages and names its
  file, line and column; the legend is removed, AGENTS defines the states, and the texts name states
  in words. `scripts/checklist-markers.test.mjs` failed with `ERR_MODULE_NOT_FOUND` before the
  change, and its fixture passed the former document check.

### 2026-10-05 — Guard of the full run (C2.1-2)

- `make ci` starts the guard `scripts/full-run.mjs` before any command. AGENTS states that the full
  suite runs exactly once, when every active task is done, and nothing enforced it: `make ci`
  started its commands with a task in progress, with uncommitted changes and on a tree it had
  already verified. The guard prints its decision with the reason and refuses while a checklist task
  is `[~]`, listing each active ID with its task, while tracked changes are uncommitted, and when
  `var/full-run.json` records a full run of the current tree, naming that run. It runs each command
  of `CI_COMMANDS` to its end and writes the record before and after each command, so a stopped run
  stays `incomplete`. `make rerun-failed` reruns only the commands of the current tree that did not
  pass and keeps the conformance evidence of those that passed. `tests/build/full-run.test.mjs`
  failed with `ERR_MODULE_NOT_FOUND` before the change; its 11 cases pass with stub commands after
  it.

### 2026-10-05 — Local servers stopped at the exit of their test process (C2.19)

- The local stack of the form comparison tests stops the process groups of the servers it started
  when its test process exits without stopping them. A pipeline test whose stop hook timed out and
  whose process was forced to exit left its record servers running for hours.

### 2026-10-05 — Change signal of every deployment (C2.10-2)

- `make deploy` signals the supervisor before it waits for the build in either mode: containerctl
  also reuses an unchanged container whose supervisor started from an earlier checkout.

### 2026-10-05 — Service port answered from the supervisor's start (C2.13-3)

- The comparison supervisor listens on port 8080 from its start and answers 503 with the build
  state until it hands the port to the public server. containerctl checks the service port within
  one minute of the container start; without the healthcheck that C2.13-2 removed, a first build of
  empty volumes outlasted that minute and `make deploy` failed at the connection.

### 2026-10-05 — Change signal of a reusing deployment (C2.10-1)

- `make deploy` signals the running supervisor before it waits for the build when it reuses the
  container, so a new commit is compared without the source watcher; it waited on the previous
  commit's ready state. `make deploy-watch` stops at `SIGINT` or `SIGTERM` with a line that says
  how many signals it delivered.

### 2026-10-05 — Reuse of a routed comparison container (C2.18-1)

- The deployment reuses a running comparison container only when containerctl routes
  `crudui.test` to it; otherwise it applies the definition with containerctl. A changed route was
  never applied because the image of the running container matched.

### 2026-10-05 — Route of the comparison service under x-containerctl (C2.18)

- The Compose definition of the comparison service lists its domain under
  `x-containerctl.domains`, and the deployment check reads the `domains` and `urls` of
  `containerctl status --json`. containerctl routes only those domains, so the
  `containerctl.domain` label left the service internal and `make deploy` failed at the route.

### 2026-10-05 — Chromium of the comparison image (C2.17)

- The comparison toolchain image installs `chromium` and `chromium-sandbox`
  `154.0.8037.92-1~deb13u1`. Debian replaced the pinned `153.0.8010.47-2~deb13u1`, so the image
  build of `make deploy` failed.

### 2026-10-05 — Steps of the form comparison without limits (C2.13-2)

- A step of the form comparison runs to its end and is decided by its exit status: the step
  runner rejects a total or inactivity limit, and the build targets, the verification checks,
  the local builds, the host verification and the deployment steps hold none. The Compose
  definition declares no healthcheck, whose budget bounded the first build; the deployment waits
  for the build state of the checkout instead. The Git calls of the source comparison and of the
  OrderedJSON checkout hold no timeout. The units inside a check keep their own limits.

### 2026-10-05 — Process tree stops of exited groups (C2.16)

- `killProcessTree` of the form comparison completes when the group of the stopped process holds
  only exited processes: a group signal answered with EPERM, as macOS answers for a group whose
  processes have exited but are not yet reaped, leaves nothing to stop. The stop failed with
  `kill EPERM` after it had killed the tree.

### 2026-10-05 — Source changes published from the host (C2.10)

- The form comparison supervisor compares the mounted repository at every `SIGUSR2` instead of
  once per second. The host's source watcher `source-events.mjs` (`make deploy-watch`) subscribes
  to the file events of the working tree and for every event runs `source-changed.mjs` in the
  container, which signals the process id the supervisor records in `state/supervisor.pid`.
  Signals during a comparison, and events during a delivery, make one more run after it
  (`src/change-requests.mjs`). The heartbeat that rewrote the state file every 15 seconds is
  removed. `tests/build/test-commands.test.mjs` fails on a program that sleeps or runs an interval
  that prints no progress line.

### 2026-10-05 — PHP record server ready on its processes' lines (C2.15)

- `servers/php/main.mjs` is ready when PHP-FPM writes `NOTICE: ready to handle connections` and
  nginx, at the `notice` log level, writes `start worker processes`, and copies their standard
  error. It tried a connection every 20 ms and failed after a start limit of 10 seconds.

### 2026-10-05 — Waits of the form comparison without limits (C2.13-1)

- The build readiness wait has no inactivity or step limit: it ends when this source is ready,
  fails on a failed cycle or a state file that cannot be watched, read or parsed, and prints every
  new step and a line every 15 seconds. The supervisor publishes `progress` without `limitMs`. A
  process start waits for its readiness event without the 30-second limit and prints a line every
  15 seconds. The browser start and close of the browser and pipeline checks run through
  `runOperation` without a limit; the units of a browser report keep their limits.

### 2026-10-05 — Failed version commands fail the benchmark (C2.14)

- `tools/bench/run.js` fails with the command, its failure and its output when a version command
  fails or prints no version, and `results.md` records the versions of the tools of the backends
  that ran. A failed version was recorded as `unavailable` and an empty one as `unknown`, and the
  versions of all four tools were queried for every run.

### 2026-10-05 — Package builds and packs under the lock of dist (C3.5)

- Every built package's build script is `node ../../scripts/package-dist.mjs build '<command>'`,
  which holds the checkout lock `dist-<package folder>` for the whole build. `tsup --clean` and
  `svelte-package` empty `dist` first, so a concurrent pack that ran during a build read an empty or partly written `dist`. `node scripts/package-dist.mjs pack <package
  directory> <destination directory>` checks under the same lock that `dist` holds output and runs
  `npm pack`, printing its JSON report; the package install check packs through it.
- On Linux, `scripts/holder-lock.mjs` reads the start time of a process from `/proc/<pid>/stat`
  and the boot time of `/proc/stat`, since the toolchain image of the comparison, which builds the
  packages, has no `ps`; other systems use `ps`.

### 2026-10-05 — A holder lock of the comparison deployment (C3.4)

- `make deploy` and `make deploy-verify` take the user-wide holder lock `form-comparison-deployment`
  before any other step and release it when they exit. The deployment is one Compose project
  `crudui` with its container and its volumes for the user account, and a deployment from another
  checkout replaced it while a verification ran. A held lock refuses the run with the
  holder's checkout, pid and process start time. `holdUntilExit` of `scripts/holder-lock.mjs`
  releases a lock at process exit, also after `process.exit` from a signal handler.
  `examples/form-comparison/check-deployment-lock.test.mjs` runs in
  `npm run test:form-comparison:source`.

### 2026-10-05 — A kept Playwright image under a holder lock (C3.3)

- `make test-form-styles-linux` keeps the Playwright image. A run that pulled the image removed it
  at its exit, also while a run of another checkout still used it. The container now
  runs under the user-wide holder lock of the image, so a second run is refused with the holder's
  checkout, pid and process start time. `make remove-form-styles-image` removes the image under the
  same lock and is refused while a check runs. `node scripts/holder-lock.mjs user-lock-file <name>`
  prints the path of a user-wide lock.

### 2026-10-05 — Holder locks of single resources (C3.2)

- `scripts/holder-lock.mjs` holds a resource that only one run may use at a time. The lock file's
  record names the checkout, the pid and the process start time of the holder, the time and the
  command; it is written completely and linked to the lock path, so the lock is taken atomically.
  A held lock refuses with the holder's record. A lock whose holder process no longer runs, or
  whose pid belongs to a process with another start time, is reported and kept until
  `node scripts/holder-lock.mjs remove-dead <lock file>` removes it; the command refuses a running
  holder. Only the holder releases the lock. `hold` runs a command while holding the lock. Locks of
  one checkout are under `var/locks/`, locks that every checkout shares under
  `~/.local/state/crudui/locks/`. `tests/build/holder-lock.test.mjs` runs in `npm run test:runtimes`.

### 2026-10-05 — A snapshot directory per documentation run (C3.1)

- `make docs-verify-idempotent` writes its two snapshots and their difference to a directory that
  the run creates with `mktemp -d` and removes at its exit. It used the fixed paths
  `/tmp/crudui-docs-run1`, `/tmp/crudui-docs-run2` and `/tmp/crudui-docs-diff.txt`, which a run of
  another checkout removed and rewrote during the comparison.
  `tests/build/shared-resources.test.mjs`, run by `npm run test:runtimes`, fails on a Makefile line
  with a fixed path under `/tmp`.

### 2026-10-05 — Stage steps that meet through a pipe (C2.9-1)

- The two steps of one stage in the step runner test open the two ends of a named pipe, so the
  stage ends only when both run at the same time. They waited for each other's file through a
  directory watch, whose event stream on macOS starts late and lost a file in 4 of 10 runs.

### 2026-10-05 — Setup contract of the local pipeline stack (C2.7-2)

- `check-verification.test.mjs` checks that the pipeline and record store tests start and stop
  their stack and browser through `setup` and `teardown` of `scripts/test-progress/hooks.mjs` and
  register no hook of their own. It required the `browser-start` and `browser-close` limits that
  C2.7-1 removed from the pipeline test.

### 2026-10-05 — Readiness wait on the state file itself (C2.4-1)

- The readiness wait of the form comparison watches the build state file itself
  (`watchStateFile`), whose watch is registered when it returns, and at every replacement watches
  the new file before it reads. It watched the file's directory, whose event stream on macOS starts
  after `fs.watch` returns, so a replacement made right after the wait started could be lost; the
  real-file case failed in 5 of 10 loaded runs and passes in 20 of 20.

### 2026-10-05 — One test per render case in the viewport and Tailwind checks (C2.11)

- `tests/viewport.test.mjs` and `tests/tailwind-styles.test.mjs` open the pages of each engine and
  width in a setup of a suite and run every one of the 432 shared render cases as its own test with
  the runner's timeout of 30 seconds. Each engine and width ran all cases inside one test with a
  timeout of 300 or 600 seconds and printed only its start and end.

### 2026-10-05 — Reproducible build in a logged step (C2.12)

- `npm run test:build:repeat` builds the packages twice with `scripts/repeat-build.mjs`, a logged
  step without a time limit that records the path and SHA-256 digest of every output file of the
  published packages after each build. `tests/build/reproducible-build.test.mjs` compares the two
  records with each other and with the current output under the 30-second timeout of each test; it
  ran both builds inside one test case through a blocking `execFileSync` under 120 seconds.

### 2026-10-05 — Native generator checks in one pool (C2.8)

- `tests/native-generators/run.mjs` builds the Go and Rust programs once in a build step before
  any check, with the output of the build tool, a line every five seconds and no time limit; the
  preparation budgets of 300 and 900 seconds and the 30-second limit of every process are removed.
  A probe checks each PHP program within a check budget. The checks of every target run in one pool,
  `os.availableParallelism()` at a time, each as its own test with its budget and its signal in its
  asynchronous context. The 738 checks of each target ran one after another, and the javascript,
  html, php and php-native targets start an interpreter for every request, so the suite took 962.5
  seconds, almost all in checks; the same 4428 checks now pass in 199.8 seconds.

### 2026-10-05 — Setups without a hook timeout (C2.7-1)

- `scripts/test-progress/hooks.mjs` replaces `scripts/test-progress/teardown.mjs` and adds `setup`,
  a `before` hook of a file, a suite or a test with the timeout `Infinity` that ends when its
  launch, start or compile settles and prints its start, a line every five seconds and its end.
  The setup hooks of the style, Tailwind, viewport, widget script, form inspector, pipeline and
  record store tests use it; they held limits of 60 or 120 seconds, the browser start limit or the
  30-second timeout that node:test gives a hook without its own. The browser job test launches its
  browser once in a setup instead of inside tests of 10 or 30 seconds, and connects to it a second
  time with the one-second protocol timeout its protocol timeout tests need. The Vitest `beforeAll`
  hooks of the cross-check console server and the form binding have the timeout `Infinity`.

### 2026-10-05 — Causal checks instead of elapsed-time bounds (C2.9)

- No test bounds an elapsed time; `tests/build/test-commands.test.mjs` fails on an `assert.ok` that
  compares an elapsed time with anything but 0. The runner timeout and hook cases of
  `tests/build/run-tests.test.mjs` run a test or hook that never settles through a spawn that does
  not block the event loop, so only the runner's timeout ends them. The readiness, health, stop,
  timeout and stall cases of the form comparison end only by the stop under test, the two steps of
  one stage each end only when the other's file exists, and the oversized save relies on its 413 and
  the case's own timeout. Ten assertions bounded the wall-clock time between 0.5 and 20 seconds.

### 2026-10-05 — Teardowns without a hook timeout (C2.7)

- `teardown` of `scripts/test-progress/teardown.mjs` registers a browser close, a server stop or a
  directory removal as an `after` hook of a file or of a test with the timeout `Infinity`. It ends
  when its close resolves or its process exits, fails the file with its error, and prints its
  start, a line every five seconds and its end with the elapsed time. The teardown hooks of the
  pipeline browser test, the form inspector test, the record store test, the browser job test, the
  style, viewport, Tailwind and widget script tests and the documentation server test use it; the
  Vitest `afterAll` hooks of the cross-check console server and the form binding have the timeout
  `Infinity`. node:test gave a hook without its own timeout the test timeout, so on a loaded
  machine the server stop of the pipeline test ran out of its 10 seconds and the browser close of
  the inspector test out of 30 seconds while every test passed. `tests/build/teardown.test.mjs`
  runs a teardown of 1.5 seconds under a test timeout of one second.

### 2026-10-05 — Commands of long operations without a limit (C2.3-1)

- `scripts/run-command.mjs` replaces `scripts/bounded-command.mjs`. It runs a command to its exit
  without a time limit, takes the exit status as the result, and stops the processes the command
  left in its process group when it exits, so a process that holds an output pipe cannot hold the
  caller. The package build of `scripts/require-current-build.mjs`, the tools of
  `scripts/gen-api-docs.mjs`, the declared commands of `scripts/run-contract-tests.mjs`, the drivers
  and version queries of `tools/bench/run.js` and the driver builds of `tools/bench/build-drivers.mjs`
  have no limit of 600 or 30 seconds, and `CRUDUI_COMMAND_LIMIT_SECONDS` is removed.
  `build-drivers.mjs` streams the compiler output with its step lines. With the former module and a
  one-second limit, each script failed on a command that ends after 1.2 seconds;
  `tests/build/run-command.test.mjs` replaces `tests/build/bounded-commands.test.mjs` and checks the
  stop of a left-behind child through the close of the script's output instead of a bound on time.

### 2026-10-05 — CI without time limits (C2.2-1)

- The CI workflow has no `timeout-minutes`. A step runs tests, whose cases hold their own timeouts
  in `scripts/run-tests.mjs`, or a long operation (checkout, toolchain setup, install, build, lint,
  type check, upload, deployment), which prints its logs and has no time limit; no job has a limit
  over its steps. C2.2 had given 84 such steps a limit of 5 or 10 minutes and kept the limits of the
  `deploy-docs` and `conformance` jobs. `tests/build/test-commands.test.mjs` fails on a job or a
  step with `timeout-minutes`; it required one on every step that runs no tests.

### 2026-10-05 — Long operations without a timeout (C2.1-1)

- AGENTS gives a long operation (a build, an install, a toolchain setup, a browser close, a server
  stop, a whole suite) detailed step logs and no timeout, no inactivity limit included; its result
  and errors decide its success or failure, and the event of its result ends it. Each test case
  keeps its own timeout. The rule of C2.1 gave a long operation step logs in addition to its own
  timeout, so a normal run that took longer than its limit failed.

### 2026-10-05 — Build readiness on change events (C2.4)

- `readyBuild` of `examples/form-comparison/verify-tree.mjs` reads the build state file at its
  start and at every change event of the file's directory (`fs.watch`); it reread the file every
  second. A timer runs only when an inactivity or step limit ends or a progress line is due. The
  clock, the watch and the read are parameters, and the readiness tests of
  `check-verification.test.mjs` change the state with explicit events and a fake clock instead of
  a file rewritten every 20 ms and bounds on wall-clock time. With the event loop blocked 350 ms
  of every 400 ms, the former cases failed and the new ones pass.

### 2026-10-05 — Built benchmark drivers in the driver test (C2.3)

- `npm run test:bench` builds the packages, then the Go and Rust benchmark drivers with
  `tools/bench/build-drivers.mjs`, which prints each build with its elapsed time and stops it at
  600 seconds with its process group. `tests/build/bench-drivers.test.mjs` runs the built drivers
  (`tools/bench/drivers.mjs` names them) and each of its tests has the 30-second timeout of the
  test runner; the accepted case compiled the drivers through `go run` and `cargo run` under a
  600-second timeout. `tests/build/test-commands.test.mjs` fails when the test sets its own timeout
  or runs a driver through `run`, and `tests/build/bounded-commands.test.mjs` stops a driver build
  that never ends at its limit.

### 2026-10-05 — CI time limits of setup steps only (C2.2)

- No CI job that runs tests and no step that runs tests has `timeout-minutes`; the test runner
  bounds each test. Every other step of such a job (checkout, toolchains, installs, builds,
  uploads) has a limit of 5 or 10 minutes, and a job without tests keeps its job limit.
  `tests/build/test-commands.test.mjs` follows npm scripts, Composer scripts and Makefile targets
  to find the steps that run tests and fails on a limit over them; it required a job limit before
  and listed 13 jobs when the case was added. `test:form-comparison:pipeline` builds through
  `scripts/require-current-build.mjs`, which bounds the build.

### 2026-10-05 — PHPUnit counts of the test runner (C2.5)

- The PHPUnit mode of `scripts/run-tests.mjs` counts only tests. A `testSuiteFinished` message
  carries no location, so the finish of a test class or a data provider method was counted as a
  passed test: the validator-php run reported 804 passed tests where PHPUnit ran 763, and now
  reports 763. Lines that are not TeamCity messages, such as `Test file "..." not found` and the
  summary with its warnings, are printed; they were dropped. `tests/build/run-tests.test.mjs`
  failed on both before the change.

### 2026-10-05 — Test rules of the repository (C2.1)

- AGENTS runs only the Red and Green tests that own a change while a task is in development, and
  the full suite exactly once, when every active task of the checklist is done; it ran the full
  suite at each completed feature. A long operation prints step logs in addition to its own
  timeout; the rule let the step logs replace the timeout. `make docs-check` runs only when a
  document or a public API document changed, and the Verification column of the checklist names
  the commands that own a task. The checklist lists wave 2.

### 2026-10-04 — Export of the Tailwind version (C1.5)

- `@crudui/generator-core` exports `./crudui.tailwind.css`. The feature status lists
  `viewport-widths` and `tailwind-styles`, and the operations document states the viewport and
  Tailwind tests and the regeneration after a change of `crudui.css`. The full suite (`make ci`)
  passes; its first run failed `npm run lint` and `npm run test:runtimes` on the new tests and
  script, which C1.4-1 corrected.

### 2026-10-04 — Tailwind version of the styles (C1.4)

- `packages/generator-core/styles/crudui.tailwind.css` holds the rules of `crudui.css` in the
  cascade layer `components`. `packages/generator-core/scripts/write-tailwind-styles.mjs` writes it,
  and its `--check` mode, part of `npm run test:forms`, fails when the committed file differs; it
  failed before the file existed. `tests/tailwind-styles.test.mjs` compiles the file with the theme
  and the utilities of Tailwind CSS 4.3.3 and compares the computed styles with `crudui.css` for the
  432 shared render cases at 360 and 1280 px in Chromium, Firefox and WebKit: no element differs.
  It failed with `Can't resolve` before the file existed. Tailwind CSS and `@tailwindcss/node` 4.3.3
  are development dependencies of the repository.

### 2026-10-04 — Specification of the Tailwind version (C1.3)

- The form markup contract specifies `crudui.tailwind.css`: the rules of `crudui.css` inside the
  cascade layer `components` of Tailwind CSS 4, generated from `crudui.css` and checked against
  it, with the same computed styles as `crudui.css` at 360 and 1280 px. The task first required a
  second stylesheet written with `@apply`; it is amended, because two hand-written copies of the
  rules could differ. The file is not implemented yet (C1.4).

### 2026-10-04 — Lists that fit a narrow viewport (C1.2)

- `.crudui-list` scrolls horizontally on its own, so a table wider than the viewport, such as the
  list case `format-number-shortest` with its long numbers, no longer widens the page. At 360 CSS
  pixels that case made the document 408 to 428 px wide in Chromium, Firefox and WebKit.
  `tests/viewport.test.mjs` places the expected HTML of the 432 cases of the shared render
  fixtures in a page with `crudui.css` at 360 and 1280 px in the three engines and requires no
  horizontal overflow of the document and every control and action inside the viewport; it failed
  on that case before the change.

### 2026-10-04 — Viewport widths of the stylesheet (C1.1)

- The form markup contract states the viewport widths of `crudui.css`: at 360 and 1280 CSS
  pixels the expected HTML of every shared render fixture causes no horizontal overflow of the
  document, and every control and action lies within the viewport except inside an element that
  scrolls horizontally on its own. The stylesheet had no rule for a narrow viewport.

### 2026-10-04 — NodeNext declarations of the Svelte renderer

- `@crudui/generator-svelte` declares `"type": "module"`, and the public type test
  (`tests/build/public-packages.test.mjs`) did not compile the package. The test now resolves the
  package for the ES module fixture to `dist/index.d.ts` in ES module format and compiles `Form`
  and `renderForm` in the ES module fixture (`tests/build/public-types.mts`). Its compiler host
  resolves an import of a `.svelte` file to the `.svelte.d.ts` declaration beside it, as the
  Svelte toolchain resolves it.
- The extended test failed with `TS2835: Relative import paths need explicit file extensions in
  ECMAScript imports` in `dist/components/Widget.svelte.d.ts`, which imported `./widget`. The
  relative imports of the package's `.svelte` and `.ts` source files now name `.js` files. The
  published JavaScript and Svelte files differ only in these import paths.

### 2026-10-04 — NodeNext declarations of the Vue renderer

- `@crudui/generator-vue` declares `"type": "module"`, so TypeScript reads its declarations as ES
  modules, but their relative imports had no file extension. A strict `NodeNext` project failed
  with `TS2834: Relative import paths need explicit file extensions in ECMAScript imports` in
  `dist/index.d.ts`. The public type test (`tests/build/public-packages.test.mjs`) did not compile
  the package, so no check reported the error.
- The test now resolves the package for the ES module fixture to `dist/index.d.ts` in ES module
  format, and compiles `Form`, `renderForm` and `AnyWidget` in the ES module fixture
  (`tests/build/public-types.mts`) and the CommonJS fixture (`tests/build/public-types.cts`). The
  relative imports of the package source now name `.js` files. The JavaScript output of the
  `import` and `require` exports is byte-identical to the output before the change.

### 2026-10-04 — Release checks of the browser validation binding

- The package install check (`scripts/check-packages.mjs`), the public package test
  (`tests/build/public-packages.test.mjs`) and the reproducible build test
  (`tests/build/reproducible-build.test.mjs`) did not include `@crudui/form-binding`, so a release
  did not pack, install, type-check or rebuild it. The install check and the reproducible build
  test now fail when their package list differs from the packages of `contracts/features.json`,
  and both include the package. The install project imports `bindForm` and binds a form rendered
  by `renderForm`, and its browser check submits the empty form and requires the required error
  and the focus on the control.
- The public package test showed that TypeScript resolved the package's declarations for a
  CommonJS project although Node.js has no CommonJS entry, and that the declarations were in
  CommonJS format for an ES module. The package now declares `"type": "module"` and only an
  `import` export with its types, and its relative imports name `.js` files, so the ES module
  declarations resolve under `NodeNext`. The test requires the import export to load from `dist`
  with the exports of the contract, rejects a CommonJS resolution in Node.js and TypeScript, and
  type-checks `bindForm` in the ES module install fixture.
- The declaration build test now covers every published package with a `tsconfig.build.json` and
  fails when one is missing; it adds `@crudui/form-binding` and `@crudui/generator-html`, which
  had the same declaration build and was not checked.
- The browser check of the binding (`packages/form-binding/tests/browser.test.ts`) ran only in
  Chromium, while the other browser checks run in Chromium, Firefox and WebKit. It now runs the
  same case in the three engines through `tests/browser-engines.mjs`, with
  `tests/browser-engines.d.mts` as its types, and a local HTTP server serves the page and records
  each submission instead of Playwright routes, which Puppeteer does not have. The case passes in
  the three engines. CI no longer installs the Playwright Chromium, which no check uses, and the
  package no longer declares `playwright`.

### 2026-10-04 — Browser validation of server-rendered forms

- `@crudui/form-binding` (`packages/form-binding`) validates a server-rendered complete form in the
  browser with the specification the server validates it with. A form rendered on the server was
  validated only after a request, so a user saw errors only after the round trip.
- `bindForm(form, spec, options)` builds the data from the named controls inside the form's nodes as
  a native submission sends them and a server decodes them: strings, CRLF line breaks, `[]` names
  as lists, rows keyed by their row keys, and no member for an unchecked checkbox, an empty choice,
  a select without a selected option or a collection without rows. File, disabled and node-less
  controls take no part, and errors of a node that contains a file control are left to the server.
- It validates a changed node when its control loses focus and on every later change, and the whole
  form on submit and on `validate()`. It writes the `crudui-node__errors` and `crudui-form__errors`
  markup that `renderForm` writes for the same errors, replaces server-rendered errors at the first
  validation of their node, and sets and removes `aria-invalid` on the controls of each written
  node. It sets `novalidate`, so the browser's constraint validation does not stop a submission
  first.
- An invalid submission is cancelled in the capture phase of the window with `preventDefault()` and
  `stopImmediatePropagation()`, so no other submit listener such as htmx sends a request, and focus
  moves to the first invalid control. `options.message` and `options.formErrors` supply the texts.
- The specification defines the binding in [form runtime](docs/spec/form-runtime.md#browser-validation);
  [form markup](docs/spec/form-markup.md#class-names) records the one class exception: the binding
  finds the error slots by four classes, and a test of the package fails when its source names
  another class.
- The package tests run through `make test-form-binding` and `npm run test:forms`: data collection
  of every control kind, timing, submission, focus, `aria-invalid` and options in jsdom; the error
  markup of 59 invalid cases of the shared validation fixture equals `renderForm`'s; and a
  Chromium check through Playwright shows an error after leaving a changed field, sends no request
  for an invalid submission and submits the corrected form. CI installs the Playwright Chromium
  with WebKit.

### 2026-10-04 — Choice groups

- The choice list of a `select`, `dropdown` or `selectbox` field may contain groups, each a label
  and one or more value and label pairs, mixed with plain choices in written order. A list is a
  choice list when an element has a `value` or a `choices` member. Values stay distinct across the
  whole list; binding rejects an empty group, another member, a nested group, appearance members
  and a group in any other field, and the `choice-label` format rejects a group.
- An option model inside a group has the member `group` with the group's index in `items` and its
  translated label. Every renderer writes the choices of a group inside an `optgroup` element, on
  the raw path of a select with behavior attributes too.
- The `in` rule of the TypeScript, PHP, PHP extension, Go and Rust validators takes the values inside
  groups as members and rejects a malformed group with `INVALID_RULE_PARAMETER`.
- React, Vue, Svelte, the HTML renderer, PHP, the PHP extension, Go and Rust pass the shared form
  cases `choice-groups-*` and the list case `reject-format-items-choice-group`; the five validators
  pass the shared validation cases `value-in-choice-groups*`. The PHP extension engine test counts
  the current fixture inventory and links the units the engine programs use.

### 2026-10-04 — Choice appearance

- A choice in the choice list of a `choice` or `multichoice` field may declare `class` and `style`
  for its label and `attributes` for its input, with the declared attribute rules, and the field's
  `design.group` applies to the `crudui-choices` element. Binding rejects these members in the
  choice lists of other fields and a class or style that is not a string or attributes that break
  the rules with `INVALID_FORM_INPUT`.
- An option model has `className`, `style` and `attributes` after `id`. Every renderer writes the
  choice class after the label classes as single-spaced tokens, its style on the label and its
  attributes after the field's control attributes; a name declared in both keeps the field's
  position and takes the choice's value.
- React, Vue, Svelte, the HTML renderer, PHP, the PHP extension, Go and Rust write the appearance in
  the shared form cases `choice-appearance-*` and reject the nine written appearance cases.

### 2026-10-04 — Range fields

- A `range` field renders a `crudui-widget crudui-widget--range` widget: the prepend affix, a range
  input with `min`, `max` and `step` from its literal `validate.range` and `validate.step`, a
  `crudui-widget__output` output with the current value and the append affix as the unit.
  `compileForm` requires both rules as literal values and a minimum that is a multiple of the step,
  decided exactly as the `step` rule decides it, and fails with `INVALID_FORM_INPUT` otherwise.
- The validators check a range field with its `range` and `step` rules.
- React, Vue, Svelte, the HTML renderer, PHP, the PHP extension, Go and Rust write the range widget
  in the shared form cases `range-*` and reject the eight written range cases; the TypeScript, PHP,
  PHP extension, Go and Rust validators pass the shared validation case `range-field-values`.

### 2026-10-04 — Inline and line layouts

- A group declares `design.layout`: `inline` makes every field node inside it one row of a label
  column of `--crudui-label-width` and a control column with the control, the description and the
  errors; `line` places the group's child nodes side by side; `stacked` ends an inherited inline
  layout. A group without the declaration inherits the layout of the enclosing group, and a
  repeated group applies `inline` to the fields of its rows. `compileForm` rejects the member on
  another field, a form button and the form root, another value and `line` on a repeated group
  with `INVALID_FORM_INPUT`.
- The node model writes `crudui-node--inline` and `crudui-node--line` at the start of the root
  class. In an inline layout a checkbox or switcher field with a label writes the label in the
  header and the input alone in the body.
- React, Vue, Svelte, the HTML renderer, PHP, the PHP extension, Go and Rust write the layout in
  the shared form cases `inline-layout-*` and reject the six written layout cases. The typed
  specification models of the PHP, Go and Rust validators accept `design.layout`.

### 2026-10-04 — Declared attributes of controls and nodes

- A form field declares `data-*` and `aria-*` attributes for its control with `design.attributes`
  and for its node root with `design.wrapper.attributes`. `compileForm` rejects a value that is not
  an object, a name outside the rule or written by CRUDUI and a value that is not a string with
  `INVALID_FORM_INPUT`; form buttons, lists, details and the label, group and prepend nodes reject
  the member as an unknown key.
- The node model has the wrapper attributes after `style`, the checkbox model after `caption`, and
  a widget model appends the control attributes to `attrs`, to `extra.file` of a file layout or
  keeps them in `extra.option` of a choices layout. Every renderer writes them after the attributes
  CRUDUI writes, with the placements of React's server rendering.
- React, Vue, Svelte, the HTML renderer, PHP, the PHP extension, Go and Rust write them in the
  shared form cases `control-attributes-*`. The JSON Schema, the TypeScript types and the typed
  specification models of the PHP, Go and Rust validators accept the declarations.

### 2026-10-04 — Button fields render as buttons

- A `button` or `action` field renders one `button` element with `type="button"`, the class
  `crudui-action crudui-action--text` and the `design.class` class, the `design.style` style, the
  control id, the behavior event attributes and the declared attributes, and the escaped `content`
  text. A behavior `onclick` script is an `onclick` attribute of the button. The field writes no
  jQuery click script, no hidden input and no `name`, and submits no value.
- The widget model has the tag `button` and the content as `text`; the `buttonText` member and the
  `init_script` option are removed.
- The stylesheet makes the button as wide as its content and as high as the other controls.
- React, Vue, Svelte, the HTML renderer, PHP, the PHP extension, Go and Rust write the button in
  the shared form cases `button-empty`, `action-alias`, `button-behavior-onclick` and
  `control-attributes-file-display-button`.

### 2026-10-04 — Switcher fields render as switches

- A `switcher` field renders a switch: its checkbox model has `role: "switch"` after `checked` and
  the control class `valid-target crudui-input crudui-input--switch` before the `design.class`
  class, and every renderer writes `role="switch"` after `type="checkbox"` and the declared
  attributes after `role`. The input submits and binds as a checkbox. A `checkbox` field keeps its
  markup.
- The stylesheet draws the switch as a track with a round thumb from the accent, border, subtle and
  surface properties, measured in Chromium, Firefox and WebKit.
- React, Vue, Svelte, the HTML renderer, PHP, the PHP extension, Go and Rust write the switch in the
  shared form cases `switcher-bare` and `control-attributes-checkbox`.

### 2026-10-02 — Script actions run on click

- A list or detail script action writes its script in `onclick` of its button, so the script runs
  when the button is clicked. It wrote the script in `on{name}`, for example `onremove` for the
  action `remove`, an event that a button never fires, so the script never ran. Its action model
  is `{ key, label, behavior: { onclick: script } }`.
- React, Vue, Svelte, the HTML renderer, PHP, the PHP extension, Go and Rust write `onclick` in the
  shared list cases `actions-toolbar` and `action-script-object` and the detail case `actions`.
- `tests/widget-script-runs.test.mjs` clicks a list script action twice in Chromium, Firefox and
  WebKit for the HTML, React, Vue and Svelte renderers, rendered in the browser and rendered on
  the server and hydrated, and requires one run of its script per click.

### 2026-10-02 — Hook failures are printed with their file

- The test runner prints every failure of a `node --test` or Vitest run with its test file and
  elapsed time, including a hook that fails or runs out of time. `node --test` reports a timed-out
  after hook of a file only as a failure without a test completion, so the reporter printed every
  test as passed and a passing summary while the tool exited with 1.
- Under `node --test` the failed hook of a file is printed as `{file} › hook` with its cause, and
  the file is printed as failed. Under Vitest each suite is a group, so a failed hook of a suite is
  printed on the suite line with its cause, and a hook error is printed with its message, which
  the stack of a timed-out hook does not hold.
- The summary line names the failed groups, for example `2 passed, 0 failed, 0 timed out,
  0 skipped, 3 groups failed`.
- `tests/build/run-tests.test.mjs`, run by `npm run test:runtimes`, runs a timed-out after hook of
  a file under `node --test` and of a file and a suite under Vitest.

### 2026-10-02 — Linear-time checks read no clock

- The linear-time checks of the validators and of the PHP extension engine read no clock. They
  compared elapsed times with a limit or with each other, so they failed under a machine load
  average of 28 to 38 and passed alone, and `make conformance` and `make ci` did not end with
  status 0 in one full run.
- The JavaScript checks count reads: a getter on each row value and each repeated value fails a
  read beyond the reads of the same value among ten values, and a counting `codePointAt` fails a
  second read of a text position. The PHP, Go and Rust checks and the PHP extension engine
  fixtures validate, parse, match or order inputs that a linear implementation ends within seconds
  and a quadratic or exponential one does not end before the test's timeout. A Rust test that
  measured `serde_json::to_value` instead of the rule is removed.
- PHPUnit sets no time limit of its own in the validator and the generator packages, so the test
  runner's timeout of 30 seconds is the only limit of a PHP test.
- `tests/build/validator-test-clocks.test.mjs`, run by `npm run test:runtimes`, fails when a
  validator test or a PHP extension engine fixture reads a clock.
- The form comparison check that 500 request generators are constructed without deployment-size
  work compared their elapsed time with 250 ms and failed with 994 ms under load; it now requires
  them to end within the 10-second limit of its PHP process.
- The PHP extension engine tests have budgets of 120 seconds, and 300 seconds with a sanitizer,
  instead of 30 and 60 seconds: the values fixture took 23.7 seconds at a load average of 45, and
  its sanitized run did not end within 54 seconds at a load average of 107.
- The stylesheet layout checks close their three browsers within a hook limit of 120 seconds;
  the close exceeded the default limit of 30 seconds at a load average of 100 and failed
  `npm run test:forms` after all 61 checks passed.

### 2026-10-02 — Action behavior members are event attributes

- A list or detail action writes each declared `behavior` member as the attribute of that name:
  `behavior.onclick` writes `onclick`. Every renderer prefixed `on` to the member name, so
  `behavior: { onclick: … }` wrote `ononclick`, an attribute that no browser runs.
- The action model holds the event attribute name as each `behavior` key. A script action keeps
  its script under `on{name}`, so a script action writes the same `on{name}` attribute as before,
  and its model key is now `on{name}` instead of `{name}`.
- React, Vue, Svelte, the HTML renderer, PHP, the PHP extension, Go and Rust render the shared
  list and detail case `action-behavior-events`, a link and a button with string and object
  entries.

### 2026-10-02 — Form and list descriptions and detail actions

- The `crudui-form` block writes the translated root `description` as
  `<p class="crudui-form__description">` before the form errors and the body. A form root accepted
  `description`, but no renderer wrote it, so a declared description was not shown. The compiled
  template keeps the declared value as its optional last member `description`, every template
  shape check accepts it, `formDescription(template, options)` returns the translated text, and
  `renderFormView` takes it as its fifth argument. An absent or empty description writes nothing.
- A list declares `description` content. The list model has the translated `description` after
  `empty`, and a non-empty description is the first child of `crudui-list`, a
  `crudui-list__description` paragraph before the actions. The check runs after `empty` and before
  `pagination` and fails with `Invalid description at list: expected a string, a language map or
  null`.
- A detail declares `actions` with the list action rules and models; its messages name `detail`
  where a list message names `list`. The detail model is `{ fields, actions, design }`, and a
  detail with actions writes `crudui-detail__actions` with one `crudui-detail__action` per action
  before the `dl.crudui-detail` element and after the image preload links. A detail without actions
  writes the same markup as before.
- The JSON Schema accepts the list `description` and the detail `actions`, the stylesheet styles
  the new elements, and React, Vue, Svelte, the HTML renderer, PHP, the PHP extension, Go and Rust
  render the shared form, complete form, list and detail cases.

### 2026-10-02 — Choice lists keep their written order

- `items` accepts a choice list, an array of `{ "value": …, "label": … }` objects whose choices
  keep the list order for any values. A value-to-label map lists integer-like values first in
  ascending order, so `{ "1": "Yes", "0": "No" }` showed No before Yes and choices with numeric
  values could not keep a written order. The map and the array of labels keep their meaning; the
  schema contract states which form to use for which order.
- An `items` array is a choice list when one of its elements is an object with a `value` member.
  Every element then has only `value` and `label`, every value is a string or a finite number, and
  no two values have the same canonical text. Binding a field whose choice list breaks a rule fails
  with `INVALID_FORM_INPUT` and `Invalid items at {path}: expected value and label pairs with
  distinct string or number values`; the `choice-label` format fails with the same text for
  `format.items`, and `in` fails with `INVALID_RULE_PARAMETER` and `Invalid in parameter: expected
  value and label pairs with distinct string or number values`.
- Select, choice, multichoice and search fields list the pairs in list order, a dummy field and
  the `choice-label` format display the label of the value, and `in` takes the values as members,
  so a field declares the same choice list as `items` and `in`. The JSON Schema defines
  `ChoiceList`, and `crudui explain` lists the pairs in list order.
- The HTML renderer, React, Vue, Svelte, PHP, the PHP extension, Go and Rust render the shared
  choice list cases, and JavaScript, PHP, the PHP extension, Go and Rust validate them.

### 2026-10-02 — Form connection compares sanitized defaults

- `connectForm` compares a text control with its rendered default after the browser sanitizes
  that default as it sanitizes a value. Chromium reads a datetime default `2026-09-09T00:00:00`
  as `2026-09-09T00:00`, so the connection read every such control as an edit and replaced
  the instance value with the browser's form of it.
- The browser timezone case of the widget script checks covers it in Chromium.

### 2026-10-02 — renderForm writes the complete form

- `renderForm(form, options)` writes the complete form that a server sends, so the server
  writes no part of a form. `options.action` adds a `form` element with `action`, `encType` and
  `method` taken from the option or the template's `action`; `options.hidden` adds hidden inputs
  inside it, outside the `crudui-form` element that `connectForm` synchronizes;
  `options.formErrors` adds a `crudui-form__errors` element before the body; `options.errors`
  places each message in a `crudui-node__errors` slot after the body of the node with that data
  path, and validation result errors are accepted unchanged. Options outside the contract fail
  with `INVALID_FORM_INPUT`. Without options the output is the `crudui-form` block as before.
- JavaScript (`@crudui/generator-html`, React, Vue and Svelte with an `options` prop on `Form`),
  PHP (`Generator::renderForm($form, $options)`), the PHP extension, Go
  (`RenderForm(form, options)`) and Rust (`render_form(&form, options)`) write the same markup.
  Go and Rust callers pass `nil` or `None` for the `crudui-form` block alone.
- The stylesheet colors errors with the new `--crudui-error` property.
- The shared complete form cases are compared byte for byte in React, the HTML renderer, PHP,
  the PHP extension, Go and Rust, and after normalization in Vue and Svelte.

### 2026-10-02 — A single-choice field rejects a list

- A field of type `select`, `dropdown`, `selectbox`, `choice` or `radio` without `lang` holds one
  value. Validation fails with `INVALID_FORM_INPUT` and `Choice data must be a single value:
  {path}` when its data, or a row of a repeated one, is an array or an object, hidden fields
  included. Validation previously accepted a list such as `["q", "r"]` and checked `in` for each
  element, so a submitted list passed as a single choice.
- JavaScript, PHP, the PHP extension, Go and Rust run the shared list, empty list, object,
  hidden, repeated row, group row, declaration order and accepted value cases.

### 2026-10-02 — An empty membership list allows no value

- An `in` rule with an empty list or an empty map is valid and matches no value, so a field
  whose choice list is empty passes an empty value and fails every other value. The rule
  previously failed the load with `INVALID_RULE_PARAMETER`, so such a field could not be
  checked. A blank string and an empty member remain parameter errors.
- The JSON Schema accepts an empty `in` list and map.
- JavaScript, PHP, the PHP extension, Go and Rust run the shared empty list, empty map and
  required cases.

### 2026-10-01 — Form connection keeps values entered before it

- `connectForm` reads every control that differs from its rendered default before it
  synchronizes the controls, so values that a visitor entered into server markup before the
  client connected the form remain in the control and in the form session.
- The HTML renderer form session case enters text into server markup before the connection
  and verifies the controls and the session values.

### 2026-09-26 — React component and server entries have separate exports

- `@crudui/generator-react` exports React components without loading `react-dom/server`.
  `@crudui/generator-react/server` exports `renderForm`, `renderList` and `renderDetail` for
  string rendering. The component entry does not export those functions.
- React package cases and the installed package check verify both entries and their
  CJS and ESM exports.

### 2026-09-26 — Rust validator declares its license

- The Rust validator manifest declares MIT, the license declared by the project, so dependency
  license checks can read the validator's license directly.

### 2026-09-26 — Form validation rejects undeclared submitted fields

- Form validation fails with `INVALID_FORM_INPUT` when root, group or repeated group row data
  contains a member without a declared field. It reports the first unknown member in code point
  order at that object. Condition inputs are declared as fields in the shared cases.
- JavaScript, PHP, the PHP extension, Go and Rust run the same root, group and row cases.

### 2026-09-26 — Rust JSON text validation retains object member values

- Rust JSON text conversion associates each object member name with its own value and keeps
  declaration order at every depth. Reversed associations previously let required and length
  rules pass on the wrong input.
- Rust cases check direct validation and nested object conversion.

### 2026-09-26 — Documentation build excludes generated site files

- The documentation builder and source watcher exclude generated `docs/.site/` files. A generated
  Rust documentation license has Markdown syntax without a page heading and must remain an asset.
- Documentation build and watcher cases check the exclusion.

### 2026-09-26 — JSON specification readers reject repeated member names

- The specification JSON reader rejects repeated decoded object member names before validation,
  including names written with different escape sequences. Repeated names otherwise replace input
  without an error. The CLI and Rust JSON text parser use this rule.
- Parser, CLI and Rust cases cover nested objects, arrays, escaped names and valid documents.

### 2026-09-25 — The stylesheet themes lists and details and exposes its colors and sizes

- `crudui.css` declares the defaults of the `--crudui-*` custom properties in one rule with zero
  specificity, `:where(.crudui-form, .crudui-outline, .crudui-data, .crudui-list, .crudui-detail)`.
  Before, the rule selected only the form, the structure map and the data view, so a list or a
  detail outside a form read undefined properties, and a page could override the properties only
  with a rule that came after the stylesheet.
- New properties: `--crudui-on-accent` (text of the selected choice, before `#ffffff` in the
  rule), `--crudui-action-text` (actions, before `#374151`), `--crudui-action-size`,
  `--crudui-control-border`, `--crudui-control-height`, `--crudui-radius` and the submit button
  properties `--crudui-submit-background`, `--crudui-submit-border` and `--crudui-submit-text`.
  Their defaults keep the rendered sizes and colors. No other rule writes a color
  ([form markup](docs/spec/form-markup.md#styles)).
- `tests/style-properties.test.mjs`, part of `npm run test:forms`, checks the property rule, that
  every property a rule reads is declared and that no other rule writes a color.

### 2026-09-24 — The CI browser preflight names the failed sandbox condition

- `scripts/check-ci-browser.mjs` fails an inadequate `chrome://sandbox` evaluation with
  `Chrome sandbox evaluation is "<value>"; expected "You are adequately sandboxed."` and an
  inadequate row with `Chrome sandbox row "<row>" is "<value>"; expected ...`. Before, the
  preflight used the assertion message generated by Node.js, which inserts color codes between
  the characters of the compared text, so the error did not contain the required status and
  `tests/build/ci-browser.test.mjs` failed.
- `tests/build/ci-browser.test.mjs` checks the error for each required sandbox row.

### 2026-09-24 — Lists and details reject invalid declarations at render

- `buildList`, `buildDetail`, `renderList` and `renderDetail` in JavaScript, the HTML renderer,
  PHP, the PHP extension, Go and Rust check the list and detail declaration shape
  ([display format declarations](docs/spec/display-formats.md#declarations)). A list without
  `columns` fails with `List specification must declare columns`; `columns` or `fields` that are
  not an object, an unknown root, column, field, sort or action key, a root `$ref` or `$patch`, and
  a wrong value type of `field`, `label`, `format` and its typed settings, `sortable`, `search`,
  `sort`, an action or `empty` fail with `INVALID_FORM_INPUT`. Before, such a specification, for
  example `{ "columns": 5 }`, rendered an empty list.
- The renderers compose a list `search` with `$ref` or `$patch` and scan the composed
  specification for forbidden keys as `validateList` and `validateDetail` do, so a forbidden key
  fails with `FORBIDDEN_META_KEY` at its path.
- A `null` format fails; absent, `true` and `false` select `text`.
- An action object with `script` renders as a script action with its translated label.
- `renderList` in JavaScript checks the `layout` option before composition and the declarations,
  as every other runtime does. The internal entry of `@crudui/generator-core` exports
  `buildListLayout` in place of `listLayout`.
- The shared list and detail render fixtures define the declaration error cases, and every
  runtime runs them through the native generator suite. The list and detail validity cases are
  also built by `buildList` and `buildDetail`.

### 2026-09-22 — Choice inputs pass pointer activation to their labels

- Visually hidden radio and checkbox inputs now retain a native hit target with transparent
  rendering, so both direct input activation and their associated visible labels work without
  changing keyboard focus or native form semantics. Browser automation and mouse users can
  therefore activate every choice through the same accessible controls.

### 2026-09-19 — Hardened responses, one selection source, reported Vue errors

- Every response of the public server now carries `X-Content-Type-Options: nosniff`, every JSON
  body escapes `<`, `>` and `&` as Unicode escapes, and a 405 answers with an `Allow` header
  naming the methods the target accepts (`GET` on a page, `GET, HEAD` on a file). A hostile
  request value reflected in an error can therefore not close a script or comment element under
  any content-type interpretation. `src/server-responses.test.mjs` starts the public server and
  checks the headers, the `Allow` answers and the escaped reflection.
- The page selection defaults were defined twice, in `src/record-view.mjs` and in `server.mjs`,
  and nothing bound the copies together. `server.mjs` now takes every default from
  `src/record-view.mjs`, so the server and the page cannot drift.
- The document names its whole selection in `<html data-pipeline-selection="…">` and the page
  script fails before rendering when any member differs from the URL selection; it checked only
  `initialization` before, so a stale document of another server could hydrate foreign stage
  markup whose form action points at another server.
- A Vue component or render error raised inside the canonical page's Vue application now fails
  the page as a script error like every other view's failure, through `src/vue-errors.mjs`; Vue
  logged it to the console and continued before.

### 2026-09-19 — The record form shows a failed save

- The canonical page's form submitted its fields and handled 200 and 422, but a failed request or
  another answer left the page without a message: the promise rejected with no handler, the page
  stayed as it was, and only the browser console showed anything. The submit handling now lives in
  `examples/form-comparison/src/save-form.mjs` with its own jsdom tests: a failed request, a
  non-JSON answer or an answer outside 200 and 422 shows `<div id="save-errors" role="alert">`
  before the form with the page language's save-failed text and the failure, keeps the entered
  values, and leaves the form submittable again. `docs/spec/form-comparison.md` states the
  behavior.

### 2026-09-19 — One source for the interface text

- The interface text was copied by hand into the TypeScript, Go, Rust, PHP and PHP extension
  generators, and nothing checked that the copies agreed: the Korean undo label was 실행취소 in
  TypeScript and 되돌리기 in the four others, and only TypeScript had the redo label.
  `contracts/interface-messages.json` is now the only place the text is written. Each runtime
  embeds a source its own script generates from it, and a test fails when the embedded text
  differs from the file. The extension's generated table sets every field by name and the
  generator fails when the contract's keys differ from the C struct's fields.
- List pagination buttons were named "Previous page", "Next page" and "Page N" in English in
  every language, and each renderer chose ‹ and › by comparing those names, so the names could not
  be translated without breaking the buttons. The resolved pagination model now lists its buttons
  with a role (`previous`, `page`, `next`), page, label, current and disabled; renderers choose
  the text by role, and the labels come from the contract's `list` table in the display language,
  or English for a language the table lacks.
- A list with no rows and no declared `empty` showed an empty box. It now shows the `list` table's
  `emptyList` text in the display language; a declared text, even an empty one, is used as
  declared.
- `make deploy` checked the deployed health right after a commit had changed the servers, while
  the supervisor inside the container was still rebuilding them, and failed with 503; and the
  verification accepted a build that was ready for the previous checkout and failed only at its
  end. Both now wait inside the container until the supervisor has built this checkout's source
  identity, under the build steps' own limits and the inactivity limit.
- A `node --test` or Vitest run that printed a passing summary and then ended on a signal or a
  nonzero exit code failed the step without a line saying why. `run-tests.mjs` now prints a
  failure line naming the signal or exit code.

### 2026-09-19 — Compare unique values as JSON values, bound caches and Rust value limits

- `unique` compared values differently across runtimes: TypeScript and PHP took the text `"[1]"`
  for the list `[1]`, TypeScript and the extension let object member order count, PHP let `1`
  and `1.0` differ and wrote floats with fourteen digits, so `0.1 + 0.2` equalled `0.3`.
  `unique` now compares values as `equalTo` does, by the JSON value they denote: strings by code
  points, numbers by exact value, no value equal to one of another type, lists in order and
  object members in any order at every depth. Fifteen shared cases state it, and every runtime
  passes them.
- A field declaring `unique` inside a repeated group compared each row with every earlier row and
  evaluated the filter condition for each pair. Every runtime now walks the rows once per
  validation, evaluating the filter once per row; tests compare n and 4n rows. The Rust test
  also found that reading a value by path copied the whole row collection for every row; path
  reads now borrow the value.
- The parsed-expression caches of the Go and PHP validators had no bound, so a long-running PHP-FPM
  worker grew with every distinct expression. Both keep at most 1,000 expressions and evict the
  least recently used, as the TypeScript validator does.
- The Rust validator did not apply the value limits, and its JSON text reader stopped at 127
  levels. It applies 1,000,000 nodes and 512 levels like the other runtimes, converts deep text
  without recursion, and runs every value-limit case it can build from owned values.
- The public server's forwarder stopped reading an upload once a server had answered it early, as
  nginx answers an oversized body with 413, and passed on the server's `Connection: close`; the
  client's connection then closed while it was still sending, and a few requests in a hundred
  failed with EPIPE instead of reading the 413. The forwarder now reads and discards the rest of
  the body and keeps hop-by-hop headers to the server's connection; a test forwards forty
  oversized uploads to a server that answers early as nginx does.

### 2026-09-18 — Bound loops and costs that inputs control

- The PHP record servers ran on PHP's built-in server, which reads a whole request body before
  it runs the script, so they took any body a client declared while the other servers stop at
  2 MiB. They now run on PHP-FPM behind nginx, the way PHP runs in production
  (`examples/form-comparison/servers/php/main.mjs`): nginx ends a body above 2 MiB with the
  contract's JSON 413 before PHP reads it and passes `/api/` requests to `api.php` over FastCGI.
  The container image installs `php8.4-fpm` and `nginx`, CI adds nginx to the record-store job
  (setup-php provides `php-fpm`), and the filter for the built-in server's access lines is removed. PHP-FPM logs to a file in
  its run directory and copies every message to standard error (`-O`), because a container's
  standard error is a pipe that `/dev/stderr` cannot reopen.
- nginx answered an oversized body from its headers and closed the connection while the client
  was still sending, and the public server's forwarder then cut the 413 it had already received
  (one request in thirty failed with EPIPE). nginx now reads and discards the rest of such a body
  within ten seconds (`lingering_close always`), the forwarder keeps an answer a server has given
  whatever happens to the rest of the upload, and the benchmark routes' 413 names the JSON
  processor as every other benchmark response of a PHP server does.
- A cycle that failed before its restarts left servers that never started, and the next cycle
  restarted only what its sources changed, so those servers stayed down. Every cycle now also
  starts each supervised process that is not running.
- The toolchain image pinned a Chromium release Debian no longer serves, so the image could not be
  built; it pins the current `153.0.8010.47-2~deb13u1`.
- A caller value that shares a container, such as a PHP list built as `$v = [$v, $v]` forty
  times or a JavaScript or Go list holding the same list twice, made the input text walk and the
  PHP value copies take time that doubled with every level, and a PHP array holding two
  references to itself never finished in the extension. The walk only skipped a container
  already on its path and stopped at 512 levels. Every runtime that takes such values, the
  JavaScript, PHP, PHP extension and Go libraries, now walks a value as the tree it denotes and
  stops at the value limits: 1,000,000 nodes and 512 levels of arrays and objects. A value beyond
  them, including every value that contains itself, fails with `INVALID_FORM_INPUT` and
  `Recursive or excessively nested value: {name}`, in the order of the input text checks.
  JavaScript and Go had accepted a value that contains itself.
- The PHP value copies and the extension's value conversion apply the same limits to every value
  they convert, so members that no check walks are bounded too.
- The shared cases `tests/fixtures/text-validity/value-graphs.json` build shared and
  self-containing values in each of those runtimes; each case, copy and shape is one test within the
  runner's per-test limit, which a walk over the 2^40 nodes of a shared list never meets.
- The benchmark drivers took their iteration counts unchecked: `--iters 1e20` looped without end in
  PHP, and `0`, `-1`, `1.5` or `abc` ran a meaningless or failing loop. `tools/bench/run.js` and the
  JavaScript, PHP, Go and Rust drivers now accept one to eight decimal digits, `--iters` from 1 and
  `--warmup` from 0 up to 10000000, and reject anything else before loading a validator, with one
  message and exit status 2. The shared cases in `tools/bench/iteration-arguments.json`
  run against every driver (`npm run test:bench`, in the native generation job of CI).
- The JavaScript driver loaded the `Validator` class from the public entry, which no longer
  exports it, and failed on every run; it loads it from the internal entry.
- `run.js` stopped only the process it started at its limit, so the `go run` and cargo programs
  under it kept running. Every driver, `npm run manifest:test`'s declared commands, the build of
  `scripts/require-current-build.mjs` and each tool of `scripts/gen-api-docs.mjs` now run in their
  own process group with a limit (`scripts/bounded-command.mjs`); at the limit the whole group
  stops, a process that ignores SIGTERM included, and each command prints its elapsed time.
  `CRUDUI_COMMAND_LIMIT_SECONDS` replaces the limit.
- The benchmark's Rust crate stripped its release build and printed the toolchain's strip warning;
  it keeps its artifacts unstripped like every crate with a release profile, which
  `tests/build/rust-release-profile.test.mjs` now requires.
- An expression's syntax tree is at most 64 levels deep in every runtime; a deeper one is a
  parse error with one message. Deep parentheses had exhausted the TypeScript parser's stack and
  aborted the Rust process, and every other runtime accepted any depth. Shared expression cases
  check each construct at the limit, one level over it and 10,000 levels deep.
- The PHP extension freed a list item twice when an `in [` list was not closed, which aborted the
  process; the unclosed list is a shared rejected expression case.
- Reading JSON text in Rust and inserting object members in the PHP extension found a repeated
  member name by comparing it with every earlier one, so 80,000 members took about six seconds.
  Both find it through a hash index, and the extension orders array index names by sorting.
- The `unique` rule in the PHP extension ran its filter condition for every pair of rows and
  compared every pair; the PHP validator searched a list for every value. Both now take time
  proportional to the rows. Timing tests compare four times the input against the base size.
- The tree verification's build wait counted the supervisor's heartbeat as build progress, so a
  hung build step whose heartbeat kept renewing held it forever. Progress is now the step (cycle,
  target and step, with the limit the step holds): one step holds the wait at most its own limit
  plus the inactivity limit, and the heartbeat only shows that the supervisor is alive.
- Every wait of the supervisor holds a limit: a child's readiness, each health request, and each
  stop, which sends `SIGKILL` to the whole process tree after the termination grace, so a server
  that ignores `SIGTERM` can no longer hold a restart, a reload or the shutdown.
- The JavaScript record server kept reading a body over 2 MiB until the end or its request
  timeout. It now answers 413 as soon as the body passes the limit, reads no further and closes
  the connection, as the Go and Rust servers do; a shared contract case sends an oversized body
  that never ends.
- The tests that removed rows until none were left now run at most the starting count of passes
  and require each pass to remove one row.

### 2026-09-18 — Accept the form data the library produces

- Form data leaves out a field that holds no value, such as an untouched field of a new row, and
  the servers answered 400 to such a JSON submission, so the benchmark's JSON save of a new row
  failed. Every server now completes absent members as empty values in JSON and native
  submissions alike and requires only `id`; a store file is still never completed.
- The contract saves the data the library itself produces: `getData()` after the row operations
  for JSON, and what a browser submits from the rendered form for the native form. Hand-written
  submissions had hidden the mismatch.
- Every server takes the benchmark request through the same rule as the record save: exactly
  `form` in JSON, exactly `form[...]` and the completion field in a native form. The Rust server
  had accepted other members in both, the Go server in both and the PHP servers in JSON.

### 2026-09-18 — Show the repeated companies form in the canonical record

- The canonical page's form had become seven flat fields when list, detail and form were joined
  into one customer record, and the repeated form was left only on the benchmark screen. The
  customer record now carries `companies`: companies, their stores and their departments with
  row copy, sorting and limits, sticky row headers, notes shown only while a store is enabled,
  titles in Korean and English, and required names. The benchmark form takes this group from the
  same specification file, so it is declared once.
- The 45 seeded records differ in their numbers of companies, stores and departments, and some
  stores are disabled while their notes keep their text.
- Every server stores and returns the rows with their keys and order, completes a native
  submission's unchecked checkbox and empty collections, rejects a malformed row with 400 and an
  invalid one with 422, and keeps a hidden store's notes. The contract adds nested save,
  validation and shape cases, and the canonical flow unchecks a store, adds a department and
  checks what the server stored.
- Every server checks its store file by the same rule: records with exactly the fixture's members
  in order, a numeric `score`, text scalars and `companies` in the form's shape, checked by the
  server's one companies shape function. A malformed or unreadable file answers 500 on list,
  record, view and save and is kept byte for byte; reset replaces any store file with the fixture.

### 2026-09-17 — Link the canonical page from list to saved list on every server and client

- The public root is one canonical page: list → detail → form → save → refreshed list, for the
  `js`, `php`, `php-ext`, `go` and `rust` servers, the `html`, `react`, `vue` and `svelte` clients,
  CSR and SSR, and `bindForm` and `createForm`. The iframe stage, the `/api/pipeline/*` routes and
  the constant records they served are removed. Every link carries the whole selection; under SSR
  the stage comes from the selected server and the client takes it over, under CSR the client
  renders it with its own components ([canonical page](docs/spec/form-comparison.md#canonical-page)).
- Every server owns a persistent store `records-{server}.json` seeded from one fixture of 45
  customer records, and implements one HTTP contract (`/api/records`, `/api/records/{id}`,
  `/api/records/reset`, `/api/records/view/{view}`) with the same status codes, messages and
  member order. Saves accept exactly the rendered form's fields or exactly the JSON member `form`,
  validate with the server's own validator and never change the store on failure; writes are
  serialized and replace the file atomically; an unreadable store answers 500 and is kept. Path
  segments are compared as written, and view queries are read in their fixed member order.
- `record-stores.test.mjs` runs the 16 contract cases against all five servers built from the
  checkout, and `pipeline.browser.mjs` runs the 40 flow combinations in a browser against a local
  stack; `npm run test:form-comparison:pipeline` and the CI job `form-comparison-pipeline` run both.
- Checks made of units have no total limit any more: a step stops when it prints no progress line
  for 45 seconds, and every unit limit is three times its slowest measurement. The build readiness
  wait reads the supervisor's build state file, which reports progress while a cycle builds,
  instead of one request to the public server with a 600-second limit; `/api/source` is removed.
- `scripts/run-tests.mjs` printed `✔` with no tests when a tool failed before running any, such
  as a Rust compile error; the summary now fails and names the tool's exit code.
- The Vue adapter replaced a control's element whenever its markup changed, so a number input
  lost its caret and typing `9104` stored `4019`; the React and Svelte adapters replaced some
  controls and the button group the same way. Each adapter now writes the markup once and patches
  later markup in place with `patchContent`, keeping every element node; server output is
  unchanged. The shared form-session fixture `typing.mjs` checks node identity, focus, caret and
  typed order in all four adapters.
- React, Vue and Svelte replaced list and detail `html` content on every render; they now patch it
  in place as the forms do, and the shared view fixture `rerender.mjs` checks node identity. No
  adapter ran a widget script on a client render or for a new row, because browsers never run
  scripts inserted as markup or cloned. `patchContent` now inserts a fresh script element once the
  new markup is in place, so every script runs exactly once when its markup first appears and never
  again; `tests/widget-script-runs.test.mjs` checks this in Chromium, Firefox and WebKit for all
  four adapters, client and server rendering. React's server output stays the byte reference:
  `byte-reference.test.ts` requires it to equal the HTML renderer's output for every shared case.
- Number controls (`number`, `integer`, `float`, `decimal`) now carry `step="any"` in every
  runtime. Without it the browser counted the default step from the rendered value, so after a
  stored `2886.5` a typed `9102` was a step mismatch and the form would not submit; the `step` rule
  of the CRUDUI validator decides increments. The shared form case `number-any-step` checks it, and
  the canonical page submits with the browser's constraint validation on.
- The comparison build's `composer` target ran only `composer install`, which keeps the
  validator's path-repository copy while the lock is unchanged, so a deployment served an old
  validator copy and the PHP server failed its startup check. The target now reinstalls the copy.
- Two browser checks of the deployed verification had not followed the code: the interaction
  check looked for row actions directly under the row, although the row header sits in a header
  container, and the benchmark frame still expected a field hidden by its specification to keep its
  rules. Both follow the current markup and rule; `check-interaction.test.mjs` now finds the row
  actions in rendered markup.
- The initialization report's `mounted` stage did not reset the repository and load the column's
  frame document again, as the specification says, so the server-rendered column showed whatever an
  earlier check had stored. Each column now resets the record and loads its frame again.
- A change to a supervisor module stopped the comparison container: the supervisor started its
  successor and exited, and as the init process's only child its exit ended the container. It now
  replaces its own process image and keeps its process id.
- The PHP extension wrote list numbers such as `30` as `3e+1`, and the PHP extension and the Go
  generator grouped `1e+21` as `1e,+21`. Both now write numbers as JavaScript does; the shared list
  case `format-number-shortest` checks every runtime.

### 2026-09-17 — Remove the Linux style-check image a run pulled

`make test-form-styles-linux` needs the Playwright image of the pinned version, about 10 GB. A run
that pulled the image now removes it when it ends, successful or not, and leaves an image that was
already present; the testing procedure describes the command.

### 2026-09-17 — Lint every JavaScript, TypeScript and Svelte source

- `npm run lint` ran `eslint packages` and its configuration skipped every `.js` and `.mjs` file,
  every test and every Svelte component, so examples, tests, scripts, tools and the root
  configuration were never linted, in CI or in `make ci`. It now runs `eslint .`, and
  `eslint.config.mjs` applies the package rule set to every JavaScript, TypeScript, Vue and Svelte
  source, ignoring only generated or installed output. Per-file settings state where code runs
  (browser, Node with browser callbacks, CommonJS scripts, Svelte components); `eslint-plugin-svelte`
  and `globals` are added as development dependencies ([lint](docs/operations/testing.md#lint)).
- `tests/build/lint-coverage.test.mjs`, run by `npm run test:build`, fails when a tracked source is
  outside the lint command's paths or not linted by the configuration.
- The problems the wider lint found are fixed: unused imports, variables and parameters; errors
  rethrown without their `cause`; needless regular expression escapes and repeated spaces; array
  holes in the PHP extension's C helper list and the native generator check budgets; number
  literals that did not keep their written value (`9007199254740993` and `9.999999999999999` are
  written as the values they already had); `any` in tests; `console.log` in scripts that print
  through standard output; a Svelte `{#each}` without a key and an effect that read its dependency
  as a bare expression. The unused root script `capture-react.js` is removed.
- The Svelte generator's `{@html}` output and the heading slug's control character class are
  exempt from their rules only on those lines, with the reason written beside each.

### 2026-09-17 — Reject rule names that are not registered rules

- A `validate` key that is not a registered rule was skipped, so a misspelled rule silently turned
  its check off, and the schema kept other rule names open for rules no runtime can register any
  more. Such a name is now the load failure `UNKNOWN_RULE` with the message `Unknown rule: {name}`
  at the field's declaration path, whatever its parameter, in every validator and the PHP
  extension. A `messages` key names the rule whose message it overrides, so a `messages` key that
  is not a registered rule fails the same way; it may still name a registered rule the field does
  not declare. Names are checked with the parameters: fields in declaration order, a field's rules
  (each name before its parameter) and then its `messages` keys, before the fields it contains
  ([parameter errors](docs/spec/validation-rules.md#parameter-errors)).
- The schema's `validate` and `messages` accept the registered rule names only, and
  `scripts/check-schema.mjs` checks both lists against the rule registry. The PHP `FieldSpec`, Go
  `FieldSpec` and Rust `FieldSpec` models close `validate` and `messages` the same way and gain the
  `content` and `messages` keys they lacked; each checks its keys against the schema.
- `match` and `pattern` used the other name's custom message in JavaScript, Go and Rust when their
  own was missing. Every runtime now reads a custom message under the declared rule name only, as
  PHP and the PHP extension already did.
- The shared case `unregistered-rule-skipped` is replaced by twelve cases written from the
  specification, including nested row paths, hidden fields, check order and `messages`, and one
  case for the `match` and `pattern` messages; the shared validation cases grow to 250.

### 2026-09-17 — Compare generated field models with member order in the comparison example

- The generation check of `examples/form-comparison` compared object member order only in
  attributes, extra settings and record data, so the deployed comparison could accept field models
  whose member order differed between runtimes. It now uses the order-strict `equalModels` and
  `equalOrdered` of `tests/native-generators/protocol.mjs` instead of its own copies, so every
  runtime's models must have the same member order at every depth.
- `check-generation.test.mjs` shows that rendered forms whose models, widgets or data differ only
  in member order are rejected.

### 2026-09-17 — Reject text that is not Unicode scalar values in every runtime

- Text in specifications and data is a sequence of Unicode scalar values
  ([input text](docs/spec/input-text.md)). An unpaired surrogate in a JavaScript string, bytes
  that are not UTF-8 in a PHP, Go or C string, and an unpaired surrogate escape in JSON text are
  rejected before any other check of `validate`, `validateList`, `validateDetail`,
  `compileForm`, `bindForm`, `bindButtons`, `createForm`, the form instance methods,
  `buildList`, `buildDetail` and their render operations. Go no longer replaces them with U+FFFD,
  and PHP and Rust no longer fail at JSON decoding with a different error.
- A specification or composition file failure is the load failure `INVALID_TEXT` located at the
  path of the text; any other argument or option fails with `INVALID_FORM_INPUT` and the message
  `Text must be Unicode scalar values: {name}`. Member names count as text, and members are
  checked in code point order of their names.
- Go's `compose.DecodeOrdered`, `generator.DecodeJSON` and `ValidateJSON` keep the text for the
  check, PHP adds `CRUDUI\Validator\Support\JsonText`, Rust adds `crudui_validator::text` and
  `crudui_generator::text`, and the PHP extension checks PHP values before converting them.
- The new family `tests/fixtures/text-validity` holds one case file per operation. The validators,
  the PHP extension, the cross-check console's five processes and the native generator programs
  run it and record conformance evidence; the programs reject standard input that is not UTF-8.

### 2026-09-17 — Read appearance strings that are not complete expressions as literal text

- `design.class`, `design.style` and the other appearance settings follow the rule `design.show`
  already follows: a string is an expression only when it parses completely under the expression
  grammar, and any other string is literal text. A class such as `modal fade in show` or a style
  such as `font-family: Made in Script` was evaluated as a failing expression and dropped; it is now
  rendered as written in the JavaScript, PHP, Go and Rust generators and the PHP extension.
- Two written form cases cover the literal class and style strings; the shared form cases grow to
  103.

### 2026-09-17 — Hidden fields, data-only rows and one numeric reading in every runtime

- A field whose `design.show` resolves to `false` against the data is hidden: validation skips its
  rules and every rule inside it, reports no error for it, and keeps its value, so a setting switched
  off keeps its values and is validated again when it is switched back on. Only a resolved `false`
  hides; a condition map that selects nothing and a string that is not a complete expression are
  visible. The data shape is still checked for hidden fields. Forms decide visibility with the same
  rule and keep hidden values in the instance and in `getData()`.
- A list column's `sortable` may be a condition map, as the generators already read it; a map that
  selects nothing is not sortable.
- `multiple: only` (the same as `multiple.only: true`) declares rows that exist only in the data: the
  data's keys are the rows, missing data has no row, the form renders no row controls and no add-row
  control, and every row operation fails with `Rows of {path} come only from data`. It combines with
  `title` and `header`; compilation reports the other keys and wrong values with the messages in
  [schema](docs/spec/schema.md).
- Missing data of a repeated field or group is an empty collection, so `required` and the count
  rules apply to it.
- Numbers are read one way: numeric text is the HTML valid floating-point number (no `+`, no
  trailing dot, exponents allowed) with a finite value. `min`, `max`, `range` and `step` fail values
  that are not numeric; `step` decides multiples exactly on the decimal texts, counted from 0;
  `digits` reads the canonical text; counts give arrays their length, objects their key count,
  missing, null and blank values 0 and other scalars 1; `in` compares numeric members with the same
  reading and reads list members as written. Numeric and count parameters are checked like length
  limits (`INVALID_RULE_PARAMETER`). Messages print parameters as canonical text and replace every
  placeholder of a parameter the rule has.
- Removed: the per-runtime number parsers (`is_numeric`, `strconv.ParseFloat`, `str::parse`,
  `strtod`, `parseFloat` fallbacks), the step tolerance and rounding, and the C engine's
  locale-dependent number reading and writing, which is replaced by exact conversions tested under a
  comma-decimal locale. The PHP packages' tests fail on any warning, notice or deprecation.
- The shared validation cases grow to 238, with new form, list, structure-map and session cases, and
  `examples/product-forms` shows an option-combination form and a large product form in the current
  grammar, validated and rendered by a test.

### 2026-09-17 — Accept only the compiled template shape and order widget members

- `bindForm`, `bindButtons` and form instances in every runtime (JavaScript, PHP library and
  extension, Go, Rust) accept only a template with exactly the shape `compileForm` produces:
  `kind`, `fields`, `buttons`, an optional string `keyPrefix` and an optional object `action`,
  and field templates with exactly `name`, `spec` and `children`. Any other value fails with
  `INVALID_FORM_INPUT` and `Unsupported form template`. Rust reads templates through
  `FormTemplate::from_json`, which its `Deserialize` implementation uses.
- Widget models list their members in one order in every runtime, and a file widget's `extra`
  has `display` before `file`. The native generator comparison checks member order and 69
  template shape requests; the form runtime and PHP extension specifications say so.

### 2026-09-17 — Scroll a moved focus the same way in every engine

- The CI job "Form instances and data injection" failed in WebKit on Linux: after an Add row
  action the new row's input ended below the sticky footer (709 px against a 644 px limit in a
  700 px page, and the same 65 px in a scrolling box and a frame). Measured in the Playwright
  image, `focus()` in that engine scrolls a far control without keeping to its scroll margins
  (its bottom 9 px past the view, and from below its top 9 px above the view, under the pinned
  headers), while `scrollIntoView({ block: 'nearest' })` keeps to them.
- `connectForm` and `connectOutline` no longer leave scrolling to focus. When they move focus to
  a row, they focus with `preventScroll` and then scroll the control into view only as far as
  needed with `scrollIntoView({ block: 'nearest', inline: 'nearest' })`, so the stylesheet's
  scroll margins keep it clear of the sticky headers and the footer in Chromium, Firefox and
  WebKit on macOS and Linux. The form markup and form runtime specifications say so.
- `make test-form-styles-linux` (`scripts/test-form-styles-linux.sh`) runs the stylesheet layout
  checks on Linux as the CI runner does, in the Playwright image of the pinned version, through
  `container` on macOS or `docker`; it is not part of `make ci`.

### 2026-09-17 — Check the stylesheet layout in WebKit

- `tests/form-styles.test.mjs` runs its sticky header, level label, seam, row card and focus
  scenarios in WebKit as well as Chromium and Firefox. One engine adapter launches each browser
  (Puppeteer for Chromium and Firefox, Playwright for WebKit) and every engine runs the same
  scenario code. A browser that cannot start fails the run with the reason.
- WebKit on macOS does not focus a button on a pointer press. The focus scenario measures the
  engine's convention with a plain button and requires the restored focus to match it: the toggle
  without visible focus where the press focuses it, nothing focused where it does not. Chromium
  and Firefox are required to focus, and WebKit on macOS not to.
- `playwright` is a root development dependency, and the CI job that runs `npm run test:forms`
  installs WebKit with `npx playwright install --with-deps webkit` and has a 15 minute limit.

### 2026-09-17 — Run the CI workflow locally and fix what its first run found

- `make ci` runs every checking command of `.github/workflows/ci.yml` in order and checks the
  conformance evidence; `tests/build/ci-local.test.mjs` fails when the list differs from the workflow.
- The CI workflow failed three ways: the root package did not declare
  `@crudui/validator`, which the form-comparison example imports; the PHP validator called
  `ctype_digit` and `ctype_xdigit`, which a PHP build without ctype lacks; and the PHP extension's
  engine test initialized static tables with compound literals, which GCC rejects under `-pedantic`.
  The dependency is declared, the PHP pattern parser compares characters directly, and the tables
  use brace initializers. `tests/build/php-extensions.test.mjs` fails when a PHP package uses an
  optional extension (mbstring, ctype, iconv, intl, bcmath, gmp, sodium, dom) without requiring it.

### 2026-09-17 — Declare the repository settings and deploy through make

- `.github/repository.json` declares the GitHub repository settings: homepage, repository features
  and merge methods, the Actions policy and default workflow permissions, vulnerability alerts and
  automated security fixes, the Pages build type and the `github-pages` environment, which deploys
  only from `main`. `make github-settings` applies only what differs and reads the settings again;
  `make github-settings-check` fails when a setting differs. `tests/build/github-repository.test.mjs`
  checks both against an in-memory repository. See [repository settings](docs/operations/repository.md).
- `make deploy` and `make deploy-verify` run the comparison-service deployment and its verification;
  the verification procedure names them.

### 2026-09-17 — Keep command programs out of the published packages

The per-language validator and generator programs were only the process boundary of the
cross-check console and the native generator suite, yet they shipped inside the packages
(`packages/validator-go/cmd/validate`, `packages/validator-php/bin/validate.php`, the Rust
`validate` and `generate` binaries, `packages/generator-go/cmd/generate`,
`packages/generator-php/bin/generate.php`). The packages provide the library functions only.

- The validator programs are in `examples/cross-check-console/validators` and the generator
  programs in `tests/native-generators/programs`, each calling only its package's public API with
  the same request, response and exit status. The console runs every shared validation, list and
  detail case and 45 request cases through all five validator processes; the native suite sends 60
  shared request checks to every generator program.
- Those shared checks found differing boundary behaviour, now one rule: every program answers
  `Request must be valid JSON`, `Request must be an object`, `Options must be an object`,
  `Actions must be an array` and `Unknown generator operation`; a non-object `spec` is
  `A form spec must be a group with properties`, a non-object `template` is
  `Unsupported form template`, and a malformed action is the step error `Invalid form action`.
  `bindButtons` checked the template kind after reading its buttons and threw a `TypeError`; it now
  reports `Unsupported form template`.
- The `validatorCli` feature is removed from the package contract. `tests/build/public-packages.test.mjs`
  fails when a published package declares or contains a command program (`bin` in `package.json`
  or `composer.json`, a PHP file with `#!`, `package main` in a Go module, `[[bin]]`, `src/bin` or
  `src/main.rs` in a Rust crate).
- `make format-check` covers new files that are not yet committed and skips deleted ones.

### 2026-09-17 — Remove the legacy layer

The legacy layer kept an old field model (`rules`, `messages`, `display_switch`/`display_target`)
running beside CRUDUI, but it reproduced no fixed old behaviour: the TypeScript legacy validator ran
on the current rule registry, so its results moved with every current rule change. The layer was a
compatibility and migration path, and its examples were not run by CI. It is removed completely,
with no alias, fallback or replacement entry.

- The legacy validators are gone: `@crudui/validator/legacy` (the `./legacy` export and its build
  entry), `CRUDUI\Validator\Legacy`, the Go `validator/legacy` package and `cmd/validate-legacy`, and
  the Rust `legacy` module and `validate-legacy` binary. Code only they used goes with them: the
  TypeScript `RulesSpec` type, the PHP `Rules\Unique` rule and six unused `PathResolver` methods, the
  Go `LegacyKeyMap`, the PHP `FieldSpec::ABSORBS_LEGACY` table with `canonicalFor()`, and the Rust
  `regex` dependency.
- The legacy translator (`translateFromLegacy`, `roundtripLegacy`) and its corpus scripts
  (`scripts/corpus-legacy-*.mts`) are removed, together with the `translateLegacy` and
  `validateLegacy` features and the `tests/fixtures/legacy-validate` and `tests/fixtures/translate`
  fixtures, and the earlier-model specifications in `tests/fixtures/specs`.
- `examples/legacy` is removed with its Compose file, PHP, Go, Rust and Node API servers,
  applications and shared specifications, and with `npm run docs:check:servers`,
  `make docs-check-servers` and the scripts that checked those servers' documentation.
- The four-language legacy comparison (`tests/runner`) and its CI job are removed. Root `npm test`
  now runs the test script of every workspace package.
- `scripts/check-schema.mjs` no longer checks legacy corpora. It fails when a tracked YAML file is
  not a specification it checks or a CLI test fixture.
- The validator benchmark's `contact` specification was a legacy `rules` declaration, which the
  current validators do not read, so it measured forms without rules. It is now generated as a
  current `validate` declaration, and the 80-field case is named `large`. The Go and Rust benchmark
  drivers handle the error the validator constructors now return.
- `docs/spec/legacy-schema.md` and `docs/spec/legacy-visibility.md` are removed, and the testing,
  schema, fixture, example and feature documents describe only the current layer.

### 2026-09-17 — Package entries declared with their exact exports

`contracts/features.json` listed a few names per package, and the manifest check only looked for
each name somewhere in the package source. generator-core's entry exported 64 values, the React, Vue
and Svelte entries re-exported core functions, and renderers reached core helpers through the
public entry. Each package now declares under `entries` every JavaScript entry of its `package.json`
`exports` with its visibility (`public` or `internal`) and its exact value exports; `exports` is
removed. `npm run manifest:check` reads the value exports with the TypeScript compiler and fails on
an undeclared or missing entry or export, on a signature function outside the owner's public entry,
and on an internal entry imported outside CRUDUI package code;
`tests/build/contract-manifest.test.mjs` proves each failure. The generated feature contract page
lists every entry.

- `@crudui/generator-core` exports the public API: the feature operations, `FormInstance`,
  `createRowKey`, `sequenceRowKey`, `formMessages`, `collapsibleRows`, `canUndo`, `canRedo`,
  `redoChange`, `resolveAction`, `connectStickyHeaders` and the error classes. `listLayout`,
  `paginationPages` and `parseStyle` move to the new `@crudui/generator-core/internal` entry for the
  renderers. The entry no longer exports `resolveDesign`, `evalShow`, `evalAppearance`,
  `makeContext`, `makeTranslate`, `rowPathContains`, `HISTORY_LIMIT`, `FORM_BUTTON_TYPES`,
  `DEFAULT_FORM_BUTTONS`, `LANGUAGES`, `formatCount`, the widget and cell catalogs, `renderCell` or
  `normalizeFormat`.
- `@crudui/generator-react`, `@crudui/generator-vue` and `@crudui/generator-svelte` export only their
  components and render functions. Import `compileForm`, `createForm`, `buildList`, `buildDetail`,
  the row keys and the error classes from `@crudui/generator-core`. They no longer depend on
  `@crudui/validator`.
- The `formHistory`, `viewState` and `runAction` signatures name every function of the feature;
  features that listed the nonexistent `FormError` list `FormInputError`.

### 2026-09-17 — PHP 8.4 and later, tested on every declared line

The PHP packages declared `^8.2`, but CI ran them only on PHP 8.4 and 8.5, and the rendering
conformance test needs PHP 8.4's HTML5 parser. `crudui/validator` and `crudui/generator` now require
`^8.4`, and the validator job runs on PHP 8.4 and 8.5 like the native job.
`tests/build/runtime-version-policy.test.mjs` fails when a Composer manifest declares another range,
when a job that tests a PHP package does not cover every line of the declared range, or when a PHP
container is not on the newest tested line.

### 2026-09-17 — One definition of values and patterns in every validator

The JavaScript, PHP, PHP extension, Go and Rust validators disagreed on whitespace, on what a
length counts, on `in` and on what a pattern means. `docs/spec/validation-rules.md` now defines
them once, and every validator applies that definition:

- Whitespace is exactly the Unicode `White_Space` set; trimming removes nothing else. `required`
  fails on a missing value, `null`, a blank string, an empty array or an empty object, and every
  other rule except `mincount` and `maxcount` passes those values.
- The canonical text of a scalar is the string itself, `1`/`0` for booleans, and the ECMAScript
  text of a number. Length rules count its code points; an array or object fails them. Limits are
  integers from 0 to 9007199254740991, and `rangelength` needs minimum ≤ maximum.
- `in` takes list elements as they are, comma items trimmed, or map keys; it compares canonical
  text or equal decimal values, and an array value passes when every element passes.
- `pattern` and `match` match the whole value in the CRUDUI pattern language (`\d`, `\w`, `\s` are
  ASCII digits, word characters and whitespace; `.` excludes only U+000A; general categories and
  scripts). Delimiters such as `/x/i` are plain text. Every validator recognizes the pattern itself
  and matches it with its own linear-time matcher instead of a regular-expression engine: JavaScript's
  backtracking took 148 seconds for `(?:[^\n]*a){12}c` on 60 characters, Rust's engine needed
  43 MB and 4.4 seconds for `\p{L}{1000}`, PCRE2 and Rust lacked scripts or `\p{Cs}`, and the
  engines disagreed on the letters of 4,644 code points. A pattern has at most size 1000 and 100
  nested groups.
- Unicode data comes from one table, `contracts/unicode-properties.json`, generated from the
  Unicode 16.0.0 files in `contracts/unicode/` by `scripts/generate-unicode-properties.mjs`; every
  validator embeds it and a test fails when the table is stale.
- A parameter outside these definitions fails the load with `INVALID_RULE_PARAMETER` or
  `INVALID_RULE_PATTERN` (with the reason and the code-point offset) at the field's declaration
  path; a limit chosen by a condition is checked when it is chosen.
- The schema describes the same parameter shapes. The shared validation cases grow from 64 to 174
  and run in all five validators.
- Removed: delimiter handling in patterns, partial matches, translation to regular-expression
  engines, language trimming functions and integer casts of length limits.

### 2026-09-17 — Expose form buttons in every runtime

The feature standard declared `bindButtons` and `formButtonsHtml` for every server runtime, but only
JavaScript exposed them. The PHP library and the PHP extension add `Generator::bindButtons` and
`Generator::formButtonsHtml`, Go adds `BindButtons` and `FormButtonsHTML`, and Rust adds
`bind_buttons` and `form_buttons_html`; each generator command-line adapter serves both operations.
They return the same ordered button objects and the same markup as JavaScript, and they check the
same input: `formButtonsHtml` accepts only a list of evaluated buttons (`tag` `a` or `button`,
string `text`, and `attrs` with string values of `type`, `class`, `style`, `name`, `value`, `href`
or `onclick`) and otherwise fails with `Form buttons must be a list` or
`Form buttons must be evaluated button objects`. The native runner compares both operations for
every form fixture and the rejected shapes in every runtime.

### 2026-09-17 — Enforce the test command standard

- Every test runs through `node scripts/run-tests.mjs <node|vitest|go|cargo|phpunit>`. The runner
  prints each test as it starts, a line every five seconds while it runs, and its result with the
  elapsed time, and it gives every test its own timeout (30 seconds unless a command declares
  another). node and Vitest stop a test at its timeout; for Go, Rust and PHPUnit the runner stops
  the tool when a test outlives it. `scripts/test-progress/progress.mjs` writes the lines; the
  native generator runner, the legacy comparison, the package install check, the contract command
  runner, the build freshness check, the CI browser check and the conformance check print through
  it.
- `tests/build/test-commands.test.mjs` fails when a package, Composer, Makefile, CI or feature
  verification command calls a test tool directly, when a CI job has no `timeout-minutes`, when a
  test command starts a script that does not print through the shared lines, when no command runs
  a `node:test` file, and when a TypeScript package has no `typecheck` or CI does not run
  `npm run typecheck`. Three test files that no command ran now run in `test:form-comparison:source`
  and `test:build`.
- CI jobs have their own time limits. The `current` jobs, which repeated subsets of the unit jobs,
  are removed. Each suite that records conformance evidence uploads it, and a final job checks all
  of it. The form inspector runs as `npm run test:inspector`.
- Removed old paths: the `test:current`, `test:list`, `test:watch`, `test:coverage` and
  `test:client` package scripts, the Composer `test:current` script, `tests/package.json`, the
  unused `tests/runner/run-js.ts`, `run-php.php` and `tests/runner/go`, and the `docs-check-all`
  alias. The PHP extension API comparison is the `node:test` file
  `packages/php-ext/tests/api.test.mjs`; `make build-php-extension` only builds, and
  `make test-php-extension` runs the engine, builder and API tests. The package install check runs
  its commands asynchronously, and its step limits were reduced to about ten times their measured
  durations.
- `npm run typecheck` checks every TypeScript package, including Vue; a React outline test that did
  not pass `canRedo` now does.

### 2026-09-17 — Check conformance evidence against the feature standard

`contracts/features.json` is the one standard: each feature declares its supporting runtimes and
the shared fixtures that prove it, and the manifest registers every fixture. Tests record one
evidence line per fixture case and feature (`tests/conformance/evidence.mjs`, `evidence.php`, the
Go package `validator/internal/conformance` and the Rust test module `tests/common`), and
`scripts/check-conformance.mjs` fails on a missing or failing case of a supported runtime, on
evidence for an undeclared or unsupported runtime, on an unregistered fixture family and on a
registered fixture no feature proves. `make conformance` runs every recording suite and the check.
[Conformance evidence](docs/spec/conformance.md) describes the runtime keys and the rules; it
replaces the substring checks of `contracts/conformance-matrix.json` and
`tests/build/conformance-coverage.test.mjs`, which are removed.

The standard now declares `buildList`, `validateList`, `validatorCli` and `translateLegacy`, adds the
spec-validity fixture to `validate`, proves `createForm` with the native instance scenarios, and
declares the DOM session features for the bindings that run them. Measuring against it found and
closed these gaps:

- The native runner compares the form HTML of all 92 form fixtures byte for byte and the list model
  of every list fixture in every server runtime.
- The PHP extension runs the validator CLI fixture.
- The HTML DOM binding runs the shared session scenarios; it had never run them.
- The native runner's protocol accepted a list model only with a `sort` member, although a list
  without a sort declaration has none.
- The feature verification command of `createForm` ran a fixture module with no tests.

### 2026-09-17 — Keep rendered nodes in the HTML renderer and show sticky labels everywhere

- `patchContent(element, html)` from `@crudui/generator-core` replaces an element's content with new
  markup and keeps every node the markup still contains (matched by row key, field path, id, or a
  control name and value). Each HTML renderer re-render is patched into the page with it, so
  the focused control, its selection and an input method composition survive, as they do in the
  framework renderers; the HTML DOM binding now passes the shared initialization scenario that
  requires the same control element after repeated data injection.
- The level label in a sticky row header is hidden by default and shown inside
  `@container scroll-state(stuck: top)`. The previous rule hid it inside
  `scroll-state(not (stuck: top))`, which Firefox and Safari ignore, so those browsers showed the
  label at all times. There, `connectStickyHeaders(element)` (used by `connectForm`) sets
  `data-crudui-stuck` while sticky positioning moves a header from the top of its row, and marks a
  header again when a render drops the attribute; Chromium, which supports the query, connects
  nothing. The Chromium checks run with and without scroll-state support in a page, a scrolling box
  and a frame, and assert that Chromium never receives the attribute.

### 2026-09-17 — Render the same pagination in every server runtime

The PHP library, the PHP extension, Go and Rust rendered pagination differently from JavaScript:
the PHP library wrote `disabled="1"` and did not clamp the page to the last page, and all four
listed pages 1 to 7 instead of the bounded window. Every runtime now follows one rule: every page
up to seven pages, otherwise the first, previous, current, next and last page; without a total the
current page is 1; a page after the last page selects the last page. The list model has the same
members in the same order everywhere (`enabled`, then `perPage`, `mode` and `page` with their
defaults, the supplied `total`, and `pageCount`). A `pagination` declaration is checked like
`design`: a boolean or an object with `per_page` (an integer from 1) and `mode` (`pages`,
`offset`, `cursor` or `none`); the schema's `per_page` is an integer of at least 1. The list
fixture grew from 42 to 57 cases with the boundary pages and the declaration errors, and the
native runner compares the pagination model of enabled, declared and disabled paging.

### 2026-09-17 — Repair the failing CI jobs

The last three pushes failed CI. The Svelte header and node components had whitespace between
sibling blocks, which Svelte kept as text; they are written without it again. The root package
now declares `@crudui/generator-html`, which the form comparison example imports, and the form
comparison source suite builds it. The PHP extension API test expected the old pagination markup.
Rust and Go sources that did not match `rustfmt` and `gofmt` are formatted.

### 2026-09-16 — Add bidirectional form history

- Form instances now expose `redo()` and snapshots report `canRedo`.
- Outline controls now render both undo and redo with direction-specific availability.
- A new data change after undo clears the redo history.

### 2026-09-16 — Render CRUDUI pagination controls in CSR and SSR

- List renderers now emit previous, numbered and next page buttons from the shared pagination model.
- The resolved current page defaults to 1, exposes `aria-current="page"`, and disables boundary controls.
- The pipeline example now uses CRUDUI pagination output for both SSR and CSR; its manual page navigation was removed.
- The pipeline page documents the injected `page` and `total` contract beside the runtime controls.

### 2026-09-16 — Put sticky state on the header container

Sticky nodes now render a `crudui-node__header-container` around their header in
every renderer. The wrapper owns `position: sticky` and `container-type: scroll-state`,
so header descendants can respond to the wrapper's stuck state without changing the
header slot or its own styles.

### 2026-09-16 — A sticky seam is one border wide wherever a row rests

A sticky row has no top border of its own. Its card top edge is drawn inside the header
container, the box that pins, and goes while the container is stuck, when the line of the
container above is the seam; the `scroll-state(stuck: top)` query hides it, and in browsers
without scroll-state queries the `data-crudui-stuck` marking does, as it shows the level label.
The line under a header is the header's own bottom border, inside the container, and the sticky
line is the depth times the header height less one row border (`--crudui-row-border`), so a
pinned container lands on the line of the container above it and a row arriving on the line puts
its own edge there too. The top border used to be on the row, where it scrolled with the row and
stood one border below that line, drawing the seam as two borders at the position where a row
meets it. The layout checks assert the line, the missing row border and the edge in both states,
with the query and with the marking.

### 2026-09-16 — Exercise every validator fixture in the cross-check gateway

The cross-check gateway test now executes all 64 shared form-validation fixtures through
JavaScript, PHP, Go and Rust. Its idempotency signature treats JSON object member order inside
an error value as non-semantic while preserving array order. The previous single-case smoke test
missed the Go keyed-scalar `unique` response-order difference.

The gateway now also executes all 92 form-render fixtures through HTML, React, Svelte and Vue;
the public-instance placeholder case checks parity and its generated row-key contract because
its random identity cannot equal the bindForm fixture's fixed bytes. List and detail fixture
coverage remains complete.

The Rust validator release profile now explicitly disables Cargo's debuginfo strip step. This
prevents the build from depending on a toolchain-local `rust-objcopy`/`libLLVM.dylib` pairing that
could emit a warning after producing a nominally successful binary.

Added an executable conformance matrix. It checks that declared pass targets, shared fixture
counts, gateway test links and native operations remain complete. The matrix check runs in
`test:runtimes`, so a missing test or unsupported execution path fails mechanically.

### 2026-09-16 — Keep framework container markers out of content comparisons

The form comparison now compares each view container's rendered contents while preserving
framework-owned container markers. Vue adapters retain Vue's `data-v-app` marker after CSR mount;
the comparison no longer requires adapters to remove it.

### 2026-09-16 — Isolate and stabilize initialization comparisons

The benchmark resets the CSR repository before its initialization stages and uses the same
deterministic generated-row sequence for the `added` stage in both columns. Vue hydration now
passes the hydration flag to its mount operation, and the comparison preserves Vue's CSR marker
outside the rendered-content contract.

### 2026-09-16 — Publish the benchmark run source identity

The benchmark job result now includes the source identity read from `/source.json`. The server
report can therefore validate the complete tree identity before accepting its child reports.

### 2026-09-16 — Publish initialization source identity under the verifier contract

The dedicated benchmark now stores the frame's complete source identity in the initialization
report's `source` field. It no longer labels that object as `commit`, so report policy can compare
initialization, scenario and server identities consistently.

### 2026-09-16 — Make browser validation input clearing deterministic

The browser verifier now uses the input element's standard selection API before deleting its value.
It no longer depends on Chromium's platform-sensitive multi-click or key-combination behavior.

### 2026-09-16 — Preserve canonical pagination metadata in native adapters

The PHP, Go and Rust pipeline adapters now forward the canonical `page` and `total` options to
their renderers. A page containing five rows therefore still reports the canonical total of 45.

### 2026-09-16 — Preserve benchmark query selection and accept the mounted initialization stage

The benchmark-console redirect now preserves its query string, so each verifier job reaches the
selected server and framework. The frame initialization contract explicitly accepts the `mounted`
stage published by the browser runtime. The full current-tree browser verification remains failed
because its validation and source-identity checks did not pass; no passing result is claimed.

### 2026-09-16 — Make the canonical example use CRUDUI-generated pipeline features

The previous root implementation was incorrect: parent-side stage buttons and hand-written list
and detail markup simulated navigation without exercising CRUDUI list links, detail links, form
submission or persistence. The canonical example now renders list and detail output through the
CRUDUI renderer and uses real HTTP navigation. The old simulation path is removed rather than
retained as a compatibility path.

### 2026-09-16 — Run comparison verification on the benchmark entry

Browser verification now opens `/benchmark-console/`, where the comparison console owns its
readiness and job API. The canonical root remains the page pipeline and is not
required to expose benchmark internals.

### 2026-09-16 — Remove retired public route artifacts during builds

Persistent build volumes now remove the retired `public/displays/` output before copying current
public assets. This prevents an older generated route from remaining accessible after the source
directory is deleted.

### 2026-09-16 — Make the root example a single CRUD pipeline

The public root now presents List → Detail → Form → Save → List refresh in one page, with links
between the stages and explicit client, server and CSR/SSR selectors. The benchmark entry is
separate at `/benchmark/`. The obsolete `/displays/` route and its public files were removed.

### 2026-09-16 — Reuse the existing comparison container during source sync

The comparison deployment now separates first-time bootstrap from source synchronization. A
running container with the expected image and exact mounts is inspected and reused; normal source
changes do not call `containerctl down`, recreate the container, or reconnect build, cache, data,
or results volumes. The public pipeline forwards list and detail rendering to the selected native
PHP, PHP extension, Go, or Rust generator instead of rendering those requests in Node.

### 2026-09-16 — Correct the canonical display entry and renderer scope

The first `/displays/` implementation exposed the internal Cross-Check Console as the public
entry. That was incorrect. `/displays/` now serves a user-facing List/Detail page that renders
the framework-independent HTML output through the same public process. Cross-check render
matrices now include HTML alongside React, Vue and Svelte, so parity covers four renderers.

### 2026-09-15 — Add the canonical list and detail entry

The canonical `crudui.test` entry now links to `/displays/`, which serves the user-facing list and
detail example through the same public process as the form comparison. The internal Cross-Check
Console is not exposed as the canonical display page.

### 2026-09-15 — Use the shared allocator for empty native button text

The PHP extension now creates omitted button content with its shared string allocator, so
strict GCC builds do not depend on the non-standard `strdup` declaration.

The deployed comparison tree then passed 450 generation, 120 persistence and
7,008 browser checks with zero failures.

### 2026-09-15 — Fix the native optional list input path

The PHP extension now initializes and validates the optional `buildList` rows argument before
calling the shared operation, so GCC's required warnings do not reject the native build.

### 2026-09-15 — Install the pinned OrderedJSON JavaScript package

The comparison build now copies the pinned monorepo `js/` package into its build-tree
`node_modules` before building frames, so all five runtimes use the same revision.

### 2026-09-15 — Remove the obsolete validator benchmark

The unused TypeScript benchmark that exercised the legacy validator and silently
substituted a small specification has been removed. `make bench` is the only
repository benchmark and requires its explicit shared fixture inputs.

### 2026-09-15 — Define display markup and validation error order

List and detail renderers now use the documented `crudui-list` and `crudui-detail`
block grammar. Format kinds use `crudui-value--TYPE`; badge variants and boolean
state use data attributes. Validation traverses keyed object entries in sorted key
order for the same first-error result in all five implementations, while data and
rendered row order retain input member order.

### 2026-09-15 — Use explicit ORM display paths

Display substitutions now use `{=path}`; legacy `{.path}` substitutions are removed. List and
detail `field` and `sort.field` paths no longer have a leading dot, so object members and
associative-array keys use one path contract. The naming change makes ORM relationship paths
explicit and prevents literal URL or file-extension dots from being parsed as substitutions.

### 2026-09-15 — Remove the field button text fallback

Button and action fields now read control text only from `content`; the old field
`text` fallback has been removed from all five generators.

### 2026-09-15 — Pin the OrderedJSON comparison source to the updated commit

The comparison source remains version `0.0.1` and uses a clean
`polyspec/ordered-json` checkout.

### 2026-09-15 — Exclude operator-local editor settings from comparison source

Comparison source identity and synchronization exclude operator-local editor settings.

[한국어](CHANGELOG.ko.md).

### 2026-09-15 — Pin the OrderedJSON comparison source to its monorepo

The form-comparison supervisor and cross-language checker now use one immutable
`polyspec/ordered-json` commit. JavaScript, Go, PHP, PHP extension and Rust are
verified as package directories within that checkout; submodule revisions and
submodule updates are no longer part of the source contract.

### 2026-09-15 — Report progress and enforce per-test limits in verification runners

The native generator, PHP extension engine, package, and PHPUnit verification
runners now report active work with elapsed time and stop an individual check at
its own measured timeout. Native checks can select targets and checks, and package
builds are reused only when their source and output digests still match.

### 2026-09-15 — Use GitHub-compatible documentation heading anchors

The documentation web now generates heading anchors without adding an underscore
to headings that start with a digit. Repository-relative document links therefore
use the same fragments as GitHub source pages. The web build test and the package
build specification in English and Korean record this rule.

### 2026-09-15 — Check every repository specification meant to be valid against the meta-schema

`scripts/check-schema.mjs` checked the validity cases only, so specifications the repository relies
on as valid failed the meta-schema without any check noticing. Each failure was decided from the
specification documents and all runtimes:

- Field `messages` is read by every validator as plain strings but was missing from the closed
  `Field` definition; the schema declares it.
- The rendering cases `button-empty`, `action-alias` and `button-behavior-onclick` failed on the field
  key `content`, the control text of the `button` and `action` widgets that every generator reads;
  the schema declares it.
- `$ref` accepts a string or a list of strings in every runtime (`compose:ref-multiple-order`), while
  the schema declared a string; one `Reference` definition applies at every composition position.
- Six validation cases and one list composition file declared child fields without the required
  `type`; they declare `type: text` and their expected results are unchanged.
- The compose cases marked merge sources with a `from:` key that is not a field key; they use
  `label:` for the same purpose.
- The console example `list-search-conditional` wrote `pagination.perPage` where every runtime reads
  `per_page`, and put its select choices under `options` where every runtime reads `items`, so the
  select rendered empty.
- Condition maps: every runtime evaluates non-default keys in order and falls back to the `true`
  value, then `null`; the field specification wrongly said the `true` key is required and now states
  the rule `docs/spec/expressions.md` already gave.
- A large example specification had two duplicate YAML keys, which the benchmark fixture
  generator hid by parsing with `uniqueKeys: false`; the duplicates are removed with an identical
  parse result and the generator parses strictly, leaving the benchmark fixtures byte-identical.
  `examples/legacy/basic-form.yml` did not parse because of an unquoted value and is quoted.

The detail rendering case `content-values` intentionally declares a non-string language map entry to
test the runtime rule that skips it, and is registered with that reason. The legacy specifications in
`tests/fixtures/specs` and `examples/legacy` use the legacy field model, so the check requires them to
parse without duplicate keys and to fail the current meta-schema.

The check covers every fixture family's form, list and detail specifications except cases that expect
an input or composition failure, composition files as the fragment their `$ref` selects, compose
entries, validator CLI requests, form session specifications, `examples/form-structure`, the console
examples and the specifications embedded in the Go, PHP and Rust package examples: 371 checks pass.
Changing `per_page` back to `perPage`, removing a composition file's `type` or making the exempt case
valid each failed the check. The regenerated cases, the TypeScript conformance files that read them
(175 tests) and type checking, the Go validate and compose packages, the PHP compose and validation
filters (144 tests), the Rust fixture tests and the documentation tests passed.

### 2026-09-15 — Type every validation rule and reject forbidden keys at every depth in the meta-schema

The validators register 24 rules (`pattern` shares `match`), while the form meta-schema declared only
`required`, `email` and `match`, and applied the forbidden key names only where it listed an object's
property names. Values it left open were not scanned: a `_` key inside a `validate.max` condition map,
a forbidden key inside an `options.items` element and a forbidden key added by a detail field's
`$patch` passed the meta-schema and were rejected only by the runtime scan; those three cases were
recorded as meta-schema passes.

The meta-schema declares every registered rule. Boolean switches accept a boolean, an expression or a
condition map; numeric rules a number, an expression or a condition map; `range` and `rangelength` two
numbers, an expression or a condition map; `false` or `null` disables any rule. Rules whose parameter
every engine passes unchanged accept only their literal shapes: `match`, `pattern`, `equalTo` and
`enddate` a string, `notEqual` a scalar, `unique` a boolean or string, `accept` a string or list of
strings and `in` a comma string, a list of scalars or a value-to-label map. `validate` stays open, as
the [field specification](docs/spec/schema.md) states, so other rule names are accepted. Every value the
meta-schema leaves open uses one recursive definition whose objects must have allowed key names at
every depth; a schema walk found 38 untyped positions before the change and none after. A condition
map for `match` was accepted before, while TypeScript and Go skip a non-string pattern, so such a
declaration silently disabled the check; it is now rejected, and no specification in the repository
used it. The TypeScript `ValidateSlot` type lists the same rules and the CLI description names the open
bucket.

The three cases record `expect: "fail"` with reason `propertyNames`. Comparing 368 specifications in
the fixtures, `examples/form-structure` and `tests/fixtures/specs` against the previous meta-schema
changed only those three and accepted none newly. `scripts/check-schema.mjs` passed 103 checks, the
four TypeScript meta-schema and forbidden-scan conformance files passed 77 tests, the CLI suite passed
37 tests, and the documentation writing and fixture README tests and lint passed.

### 2026-09-15 — Give every shared fixture family a README in both languages

Six more fixture families under `tests/fixtures` had no README: compose, form-outline, form-session,
specs, translate and validate. Each has `README.md` and `README.ko.md` stating the case fields, what
the cases check, how results are compared, the tests that read them, and either the regeneration command or the
files kept by hand. `tests/docs/fixture-readmes.test.mjs` checks that every family has both files,
that they link to each other and that every relative link resolves; it failed before the READMEs were
written. The list and detail operations document links the validity READMEs instead of their case
files. The translate generator header repeated a word and a Makefile comment described the
documentation check with "now"; both are corrected. The documentation tests (25) and
`make docs-check` passed.

### 2026-09-15 — Hold every runtime to one structure validity case contract

The form specification cases recorded only the engine result, as `expect: "ok"` or
`{error_code, at_path}`, while the list and detail cases recorded the meta-schema result in `expect`
and `reason` and the engine result in `engine`. The tests read different fields.
`scripts/check-schema.mjs` did not run the form cases against the meta-schema. The Go list test ignored
the cases' `engine` and `files`: it classified cases with its own forbidden key list and composed them
with its own files, whose contents differed from the cases. The TypeScript detail meta-schema test did
not read the fixture, so no detail `reason` was checked. For form cases, TypeScript, Go, PHP, Rust and
the PHP extension did not require the `{valid: true, errors: []}` result they required for list and
detail cases.

The three families share one shape: `name`, `note`, `spec`, optional `files`, `expect` (`ok` or `fail`
against the family's meta-schema), `reason` (the ajv keyword, present exactly when `expect` is `fail`)
and `engine` (`"pass"` for `{valid: true, errors: []}`, or the load failure `code` and `at`). The three
fixture READMEs state the contract. `check-schema.mjs` checks the shape of every case and then `expect`
and `reason`; TypeScript has a form meta-schema test and its detail test reads the fixture; TypeScript,
Go, PHP, Rust and the PHP extension read `engine` and `files` from each case and require the clean result
for `pass`. Three passing form cases declared `required: true` and returned `required` errors on empty
data; they declare `required: false` and keep the keys the forbidden key scan walks. Two error cases,
`err-magic-underscore-default-key` and `err-inside-array-element`, pass the form meta-schema because it
does not type `validate.max` or `options.items`; they are recorded as `expect: "ok"` until the
meta-schema is corrected.

Changing a list case's `engine`, or putting a forbidden key in its composition file, made the Go and
Rust tests fail. `check-schema.mjs` passed 103 checks, and TypeScript (1,677 tests), PHP (1,539), the Go
and Rust suites, the PHP extension validation of 115 cases and the gateway suite (204) passed.

### 2026-09-15 — Give every example a README in both languages

`examples/form-structure` had no README and the cross-check console had no Korean README, so the
preview's purpose and start command were written nowhere. Every directory under `examples/` has
`README.md` and `README.ko.md` that link to each other, and `tests/docs/example-readmes.test.mjs`
checks both files, their links to each other and every relative link; it failed before the READMEs
were written. The form structure README gives `npm run build` followed by
`npx vite examples/form-structure`. That command served the page, its modules, the specification, the
data and `crudui.css`, and a headless browser rendered 57 nodes with the stored names. The console
README gives the Rust command its build script runs, `cargo build --locked --release --bin validate`.
The example README and writing tests passed.

### 2026-09-15 — Show lists and details in the package examples and document their operation

The package examples rendered forms only, no operations document described lists and details, and
the four documentation indexes listed different documents. The [examples contract](docs/spec/examples.md)
now requires current examples to cover forms, lists and details. The Go server example serves `/list`
and `/detail` beside the form from its stored record, the PHP example serves `?view=list` and
`?view=detail`, and the Rust example prints a form, a list and details rendered from one record. The
[list and detail operations](docs/operations/displays.md) document describes the build, render and
validation functions of JavaScript, the frameworks, PHP and the PHP extension, Go and Rust, their
options, the examples and the checks. The four documentation indexes list the same documents, and
the examples index lists every example.

The React, Vue and Svelte READMEs told readers to pass a `session` prop to `Form` and to call
`bindForm(template, data)`; `Form` takes a `form` prop and none of the three packages exports
`bindForm`. They also omitted lists, details and server rendering. Each README now shows the `form`
prop, `renderForm`, `List`, `Detail`, `renderList` and `renderDetail` with their return types
(strings in React and Svelte, promises in Vue), and the Svelte README states that the package loads
through a Svelte-aware bundler.

The Go example tests passed. The Rust example ran and printed three form blocks, one list and two
details. The PHP example served the three pages; after a record was saved through the form, the list
linked its name to the detail and the detail linked the email with `mailto:`. The JavaScript, PHP,
Go and Rust code blocks of the operations document ran, and the React and Vue README snippets
rendered their data from the built packages.

### 2026-09-15 — Render and validate details in the cross-check console

The console compared form and list rendering and validated lists and details, but it could not
render a detail. It now fans a detail specification and one record out to React, Vue and Svelte
through `POST /api/render-detail`, runs every shared detail case in its suite, and offers a detail
tab that validates and renders together. The console removed React preload links with its own
pattern while the conformance checks use the shared helper; it now uses that helper. The client
README described a list load failure as a `LOAD-ERROR` cell, which the page shows as `FAILURE`.
The gateway suite passed 204 tests.

### 2026-09-15 — Check list and detail designs as form designs are checked

Lists and details have no compile step, so an unknown `design` key in a list, a column, a detail or a
field was ignored in every runtime; the detail case fixed earlier today styled its cell with such a
key for that reason. The [display formats](docs/spec/display-formats.md#input) now check the
declarations after the input rules and composition with the form declaration rule and messages, at
the paths `list`, `columns.{name}`, `detail` and `fields.{name}`, the own design before its columns or
fields. JavaScript, Go, Rust, PHP and the PHP extension share one design declaration check between
forms, lists and details. Five shared list and detail cases cover unknown keys, value types and the
order.

This change and the member order change below edited the same list, detail and template functions in
Go and Rust at the same time, so they are recorded in one commit.

Both changes were verified together; the results follow the member order entry.

### 2026-09-15 — Use one member order for specification objects in every runtime

JavaScript receives a specification as plain objects, which list array-index member names such as
`10` first in ascending numeric order; PHP, the PHP extension, Go and Rust kept the order in which
members were written. Measuring the six targets with fields written `b`, `10`, `a` showed JavaScript
compiling, rendering and validating them as `10`, `b`, `a` and every other runtime as `b`, `10`, `a`,
and the same split for list columns, detail fields, `items` value maps and the unknown key a closed
bucket reports. The [field specification](docs/spec/schema.md#member-order) now defines this order
for every object in a specification, in composition files, composition results and compiled
templates, while record data keeps the order in which it arrives. Go, Rust, PHP and the PHP extension
reorder specification inputs, loaded composition documents and composition results, and bind
reorders the templates it receives.

Writing the shared cases exposed two defects. Cases generated through JavaScript objects already
held their members in JavaScript order, so they could not fail in any runtime, and Rust compares
maps without member order; those cases were removed. The validation cases now keep the written
order as JSON text, a composed case checks a patched index name, and the native runner sends raw
JSON text for fields, composed fields, `items`, list columns, detail fields and unknown-key reporting,
judging order from arrays, HTML and messages. The JavaScript validator also left an error's `value`
undefined when the field was absent, so the member disappeared from JSON while Go, PHP and Rust
wrote `null`; every error now carries `value`, `null` when absent.

The native comparison passed 259 checks in each of JavaScript, the HTML renderer, PHP, Go, Rust
and the PHP extension (1,555 checks, inputs unchanged during the run). The PHP extension engine
test passed 24 tests; its address sanitizer test runs only on Linux. The PHP generator passed 195
tests, and the PHP API passed 642 checks in each of three configurations and 115 validation cases in
each implementation. `npm run test:forms` passed core 112, HTML 257, React 425, Vue 396 and Svelte
393 and 10 tests. The validators passed TypeScript 1,677 tests, PHP 1,539 tests and the Go and Rust
suites, the gateway suite passed 204 tests, and build, lint, formatting, the documentation tests
(25) and the documentation web checks passed. The working tree for these checks also held changes
committed after this one.

### 2026-09-15 — Lint every TypeScript package without warnings

`npm run lint` covered only the validator, HTML renderer and React sources, so the core, Vue, Svelte
and CLI packages and the validator benchmarks were never linted, and warnings did not fail the
command. It now lints `packages` with `--max-warnings 0`. The wider scope reported 14 problems in
sources and 3 in the benchmarks: the CLI schema projection read JSON Schema through `any` and kept an
unused parameter, the date parser assigned an initial zone it never read, the Vue form imported `h`
without using it, the Svelte widget escaped `/` in template strings, and the benchmarks imported an
unused type and defined a path parsing benchmark that never ran. The CLI reads schema definitions
through one typed node, the unused code is removed and the path benchmark runs with the other parsing
benchmarks. The benchmarks report to the console, so `no-console` is off for them, and `.svelte-kit`,
`target` and `vendor` outputs are ignored.

Lint passed with no warnings, and the CLI (37 tests), core (112) and Svelte (393 and 10) suites
passed. The validator benchmarks are still outside type checking and measure the legacy validator;
that remains open.

### 2026-09-15 — Import the Vue server renderer through the vue peer dependency

`@crudui/generator-vue` imported `@vue/server-renderer`, a development dependency outside its declared
`vue` peer dependency. The build did not treat it as external, so the built entry carried a 2.2 MB
bundled copy whose ES module had no named exports, and `renderForm`, `renderList` and `renderDetail`
failed from the built package with `renderToString is not a function`. The package imports
`vue/server-renderer`, which the peer dependency provides, and no longer declares the development
dependency; the built ES module entry is 24 KB.

The packed install check rendered forms only in a browser build, so server rendering was never run
from an installed package. It now renders a form, a list and a detail from the installed React and
Vue packages through both `import` and `require`, and from the Svelte package through Vite
`ssrLoadModule`. With the old import the check failed with the same error. React imports
`react-dom/server` and Svelte imports `svelte/server`, both covered by their peer dependencies. The
Vue suite passed 396 tests and `npm run test:packages` passed.

### 2026-09-15 — Keep Korean heading anchors on the documentation web

The documentation web built heading ids from NFKD text. NFKD decomposes Hangul syllables into jamo,
so a Korean heading such as `목록 모델` received an id that no Korean fragment link could match.
Heading ids are composed again after combining marks are removed: Hangul keeps its syllables and
accented Latin letters still lose their marks. The web build test covers a Korean heading, a
fragment link to it and `Café`. The web build suite passed 11 tests.

### 2026-09-15 — Compare expected PHP signatures without losing empty objects

Candidate verification stopped in the PHP modes check with `Public PHP and extension
signatures must match`, although both PHP implementations declare the same methods. The check
decoded the expected signatures as associative arrays, which turns an empty object default into
an empty array; the detail methods declare `record = new stdClass()`, so the
expected `{}` became `[]` and no longer matched the reflected `{}`. The check now decodes the
expected signatures as objects and compares them exactly. Locally, the pure PHP signatures written
and read back as objects compared equal, and the associative round trip reproduced the mismatch.

### 2026-09-15 — Reject unknown keys in the buckets the schema closes

The schema closes `multiple`, `lang`, `design`, its nodes and `behavior`, but form compilation
stated that it did not check unknown keys there, and the typed models disagreed with the schema
and with each other: Rust kept unknown keys in all eight buckets, TypeScript opened `multiple` and
`lang`, Go silently dropped unknown keys everywhere except `options`, including rules in the open
`validate` bucket. A misspelled key such as `multiple.maximum` or `design.label.text` therefore
did nothing and reported nothing.

Every form compiler now rejects such a key with `Invalid {bucket}.{key} at {path}: unknown key`,
checking a bucket's keys in declaration order before its values, in the order `buttons` and
`action`, `multiple`, `lang`, `design` and its nodes, and `behavior`. The typed models follow the
schema per bucket: closed buckets reject unknown keys, and `validate`, `options` and dynamic
`items` sources keep them. Go's compiler returned early when a field had no design, which would
have skipped the behavior check; Go's typed `validate` now keeps unknown rules.

Checking every tracked specification against the rule found one shared detail case,
`design-wrapper-and-cell`, that styled its cell with a `design.main` key no runtime reads, so the
case never exercised cell styling; it now declares `design.class` and `design.style`.

Six shared compile rejection cases cover each bucket, a design node and the precedence of an unknown
key over a value error. `make test-native` passed 247 of 247 checks in each of the six targets (1483
including input checks). Validator tests passed in JavaScript (1642), Go, PHP (1529) and Rust (73);
the console suite passed 166 of 166; the meta-schema check passed 80 fixture checks; test:forms,
lint, format-check, manifest:test, test:docs and docs-check passed.

### 2026-09-15 — Build and install what checks run before running them

Three findings recorded during the form structure work stayed open because they needed a rule,
and one shared case contradicted the schema:
- `make test-native` wrote its report to `.git/native-generators`, which cannot be created in a Git
  worktree, where `.git` is a file. The report path now comes from `git rev-parse --git-path`, the
  same path in a normal checkout.
- The cross-check console tests run the Go and Rust validator programs from fixed paths and never
  checked that they matched the sources; today a missing Rust program failed 23 tests locally, and
  earlier runs used programs older than their sources. The console's `npm test` now builds both
  programs first, and CI no longer builds them in a separate step.
- generator-php installs the validator as a copy, as the package build rules require, and the copy
  does not follow later source changes; the native checks twice ran against a stale copy today.
  `make test-native` now reinstalls the copy before any check loads it.
- The forbidden-key case `ok-plain-spec` gave `design.label` a string, which the schema and the form
  compiler reject; it now declares a label class.

`make test-native` reinstalled the copy, wrote its report through the Git path and passed 241 of 241
checks in each of the six targets (1447 including input checks). The console suite built both
validator programs through `pretest` and passed 166 of 166. The forbidden-key cases passed in
JavaScript (24), Go, PHP (23), Rust and the PHP extension (585 API checks in each of three
configurations, 113 validation cases, engine 24 with one existing skip). test:forms, lint,
format-check, manifest:test, test:docs and docs-check passed.

### 2026-09-15 — Enforce the detail input order and keep the rules in the libraries

The display format specification lists the detail input rules in order, but every shared detail
case broke one rule at a time, so the order was never checked. Adding cases that break two rules
at once showed that the JavaScript protocol adapter of the native runner, and the Go and PHP
generator commands, checked the record themselves before calling the library. With an invalid
specification and an invalid record they reported the record, while the libraries report the
specification. The JavaScript adapter also turned a `null` record into an empty object, which no
other runtime does.

The adapters could not simply defer to the libraries: the Go and PHP detail signatures take the
record as an object, so a non-object record can only be rejected where JSON is decoded, and the
documented order put the `fields` rule before the record rule. Instead of copying the `fields`
rule into every adapter, the rule order now follows one principle that the list rules already
followed: argument shapes in argument order (specification, record), then the declaration
(`fields`), then options (`data`). The JavaScript, Rust, PHP and C libraries check in that order,
the JavaScript adapter passes the decoded record unchanged, and the Go command checks the record
only for an object specification. Three shared cases break two rules each.

The detail cases grew to 28. `make test-native` passed 241 of 241 checks in each of the six
targets (1447 including input checks).

### 2026-09-15 — Validate detail specifications in every language

`validateDetail` existed only in JavaScript, its feature was recorded as partial, and the shared
detail validity cases were two meta-schema cases that no engine read. Go, PHP, the PHP extension
and Rust now validate a detail specification as JavaScript does: compose the root and the
`fields` map, then reject a forbidden meta key anywhere as a load failure. The shared cases grew
to ten, each declaring the engine verdict (`pass` or a code and location) next to the meta-schema
verdict, and every language, its command-line adapter and the cross-check console
(`/api/validate-detail`) run them.

Writing the cases corrected two expectations: the meta-schema requires `fields`
on a root that only references a base, and it does not read inside `$patch`, so a forbidden key
added by a patch passes the meta-schema and fails in the engine.

Two divergences surfaced on the way:
- The validator command-line adapters handled `mode` differently: JavaScript and Rust ran form
  validation for any unknown value, Go failed with its own message, and PHP failed with
  `Unsupported validation mode` but, like Go, would have read `"mode": null` as absent. Every
  adapter now accepts an absent `mode` (form) or `form`, `list` or `detail`, and fails any other
  value, `null` included, with `{"error": "Unsupported validation mode"}` and exit 1.
- JavaScript composed a list root and a detail root with two copies of the same function that
  differed in whether own keys written before `$ref` survive. Both validators now share one
  root composition, the list behavior.

Measuring the adapters with malformed requests then showed that only form data handling was
shared. Invalid JSON, a non-object request and a missing or non-object `spec` produced four
different messages (Go and PHP printed their parser or type errors), Go checked `mode` before
`spec`, and a non-object `files`, a non-object file member or a non-string `basepath` was ignored
by JavaScript and Rust but rejected by Go and PHP with their own messages. Every adapter now checks
the request in one order with one message per rule (valid JSON, an object request, an object
`spec`, a supported `mode`, an object `files` with object members, a string `basepath`), and the
shared [command-line request cases](examples/cross-check-console/validators/README.md) run in all four
languages through the cross-check console tests. PHP's own command-line tests sent `files` as a
JSON array and now send an object.

JavaScript validator tests passed 1642 of 1642, Go validator packages passed, Rust 73 of 73, PHP
1528 of 1528, and the PHP extension engine tests passed 24 with one existing skip; the PHP API
check passed 585 checks in each of three configurations and 113 validation cases in each
implementation. The cross-check console suite passed 166 of 166, including the ten detail
validity cases and nineteen request cases in all four languages. The meta-schema check passed 80
fixture checks, `make test-native` passed 238 of 238 in each of six targets, and lint,
format-check, test:forms, manifest:test, test:docs and docs-check passed.

### 2026-09-15 — Resolve content text by one rule in every runtime

The schema defines content as a string or a language map whose entries are strings, but no
specification said how a runtime turns it into text, and measuring the six targets with values
outside that shape found five behaviors:
- A number entry in a language map (`prefix: { en: 7 }`) was used as text by JavaScript, PHP, the
  PHP extension and Go, and skipped by Rust, which fell back to the next language.
- A choice label that is a number (`items: { a: 3 }`) was written as `3` everywhere, while every
  other content setting given a number wrote empty text.
- A language map entry that is an object was written as `[object Object]` by JavaScript.
- The HTML renderer failed with `value.replace is not a function` for a link text, badge or bool
  label whose language map entry is a number, because the JavaScript translator returned the
  number.
- The C extension used the cell value as link text when `text` was `0` or `false`; every other
  runtime wrote empty text and falls back to the cell value only for absent, `null` or empty
  `text`.

The [field specification](docs/spec/schema.md#fields) now states the rule, which Rust already
followed: a string is itself, a language map yields the first non-empty string among its entry for
the display language, `en`, `ko` and its first key, and any other value is empty text. The
translators of JavaScript, PHP, the PHP extension and Go follow it, choice labels use it in every
runtime, and the C extension's link text falls back only as the others do. The translator also
resolves form content, so form labels follow the same rule. The shared detail case
`content-values` covers each behavior.

The detail cases grew to 25. `make test-native` passed 238 of 238 checks in each of the six
targets (1429 including input checks), and the measurement script for format details reported the
same result in all six targets.

### 2026-09-15 — Replace the list pageMeta option with page and total, and give JavaScript input errors their code

The list option `pageMeta` carried the caller's current page and total record count, but its name
said neither, and its members had no value rule: any value became a `data-page` or `data-total`
attribute, and shared cases covered numbers only. Lists now take two options, `page` (an integer
from 1) and `total` (an integer from 0), both at most 9007199254740991, the largest integer every
runtime represents exactly. Other values fail with `List page must be a positive integer` or
`List total must be a nonnegative integer`, checked after `data` and before `layout`. `pageMeta`
is removed, and PHP no longer lists it among the fixed object options.

Adding the rule exposed another divergence: a detail passes its options to the list engine, so
JavaScript, Go and the Rust library would have rejected an invalid `page` in detail options, while
the PHP library dropped them and the C extension never read them. A detail now takes only
`data`, `language`, `files` and `basepath` and neither checks nor uses `page`, `total` or
`layout` in any runtime; the shared detail case `list-options-ignored` enforces it.

CI failed in the cross-check console gateway job.
The JavaScript generators threw input errors as plain `TypeError` without a code, so the gateway
classified them as `RENDER_ERROR` while every other runtime reports `INVALID_FORM_INPUT`. The
native runner had not shown this because its JavaScript adapter filled in `INVALID_FORM_INPUT`
for any error without a code. Every generator-core input error is now the validator's
`FormInputError`, exported from generator-core, the adapter records a missing code as
`INTERNAL_ERROR`, and the gateway compares error messages as well as codes. The gateway also
replaced rows that are not an array with an empty list before rendering; it now passes them
unchanged. Its description of the layout option still named per-framework keys that no longer
exist and now states the single `layout` key.

Removing the adapter default showed that the JavaScript form instance also threw code-less
`Error` and `RangeError` for invalid row operations (an unknown or duplicate row key, the minimum
or maximum row count, an invalid position, an invalid sequence and an empty undo history), which
every other runtime reports as `INVALID_FORM_INPUT`. They are now `FormInputError` as well. The C
extension wrote `A sequence must contain 1-13 decimal digits` with a hyphen where every other
runtime writes an en dash; it now matches.

The list cases grew to 39 and the detail cases to 24. `make test-native` passed 237 of 237 checks
in each of the JavaScript, HTML, PHP, Go, Rust and PHP extension targets (1423 including input
checks), and the gateway suite passed 135 of 135 with the Go and Rust validator commands rebuilt.

### 2026-09-15 — Document display formats and hold every runtime to one input rule

The formats a list column or detail field can declare were described only by the schema and
the implementations. [Display formats](docs/spec/display-formats.md) now lists each format, its
options and defaults, the input rules with their messages and the markup, and the documentation
the documentation web publishes it under Specification.

Measuring the six targets against that document found divergences and defects no shared case
covered:
- Invalid list input failed differently in each runtime. A non-object specification, rows that
  are not an array or not objects, a non-object `data` or `pageMeta` option, and an unknown
  `layout` were rejected by some runtimes, silently replaced by defaults in others, or rejected
  with different messages. Every runtime now checks them in one order with one message, and an
  absent or `null` option uses its default.
- Every runtime counted `truncate` in UTF-16 code units, so a limit could cut an emoji in half,
  and JavaScript and Go also applied a numeric string. Every runtime now counts code points,
  applies only a number, uses its integer part and requires at least 1.
- JavaScript did not check the `decimals` range, and the runtimes that did check it did not
  share a message; PHP, for one, failed with `Decimal places must be between 0 and 100`. Every
  runtime now fails with `Number decimals must be between 0 and 100`.
- No runtime rejected a detail `data` option that is not an object. Every runtime now fails with
  `Detail context must be an object`.
- The Rust library took `pageMeta` as a map and `layout` as a string, so those two rules lived
  only in its command-line adapter, and its shared-case test replaced invalid rows with an empty
  list. Rust now takes both options as values and checks them in the library, as Go does. In Go
  and Rust, whose signatures take rows as a sequence, the rows rule applies where decoded JSON
  becomes that sequence; the specification states this.

The list cases grew to 31 and the detail cases to 23, each rule with its own case, and the native
runner compares error messages for cases that declare one. The JavaScript, HTML, PHP, Go, Rust
and PHP extension targets passed 228 of 228 checks each (1369 including input checks). The
measurement scripts for list input (14 inputs) and format details (19 inputs) reported the same
result in all six targets.

### 2026-09-15 — Keep contract verification commands to package checks

CI failed in the form instance job: `npm run manifest:test` runs every
verification command in the contract manifest, and the detail contracts declared `make test-native` for
`buildDetail` and `renderDetail`. That job has no native PHP toolchain, so building the extension
stopped at `Path contains a symbolic link: /usr/bin/php-config`. Every other contract declares
only package checks; native comparison is recorded through the runner in `tests` and runs in its
own CI jobs, which passed.

The two detail contracts now declare only their package checks, like the others. The core detail
test and the HTML and React detail conformance tests passed through `run-contract-tests.mjs`,
and `make docs-check` and `npm run test:docs` passed.

### 2026-09-15 — Enforce detail views at the same level in every runtime

Detail views existed in JavaScript and Go only, and nothing compared their output. Three
commits added PHP and Rust detail rendering and raw-HTML detail cases to the native runner,
and PHP JSON boundary documentation. They left four gaps: the runner compared HTML only, the C
extension had no detail operations although the runner sent it every case, the JavaScript
renderers kept their own substring tests, and the commit messages described their content only in
part. This change and the preceding one record their implementation and documentation.

Measuring every runtime found three divergences no check had seen:
- For a path the record does not have, JavaScript left the cell's `value` out, Go wrote `{}`,
  Rust wrote `null`, and PHP left it out, so its detail model raised an undefined-property
  warning. A cell's `value` is now `null` when the row has none and the member is always
  present, in lists and details alike; rendered HTML does not change.
- For a declared `null` image width or height, the C extension left both attributes out where
  every other runtime writes `width=""` and `height=""`. It now matches.
- Every PHP API reads an empty PHP array as the empty root object, as the PHP API contract
  states, but the detail methods of the PHP library and the extension rejected it. They now
  follow the contract; the PHP command-line adapter still rejects a JSON array, as every
  runtime does.

The rule is enforced at both levels a runtime exposes. `tests/fixtures/detail-render/cases.json`
holds 19 cases generated from React. React, Vue, Svelte and the HTML renderer run it as
conformance tests in place of their own substring tests. The native runner sends every case to
JavaScript, the HTML renderer, the PHP library, Go, Rust and the PHP extension as `buildDetail`,
whose model must match with its member order, and as `renderDetail`, whose HTML must match byte
for byte, image preload links included. The C extension implements both operations on the cell
code its list path now shares. Every runtime rejects a declaration that is not an object, a
declaration without `fields` and a record that is not an object with the same messages.

Two findings stay open. The C extension still uses the cell value as link text when `text` is
`0` or `false`, which the schema does not accept. Detail specification validation
(`validateDetail`) exists in JavaScript only, so the detail feature stays in progress.

`make test-native` passed 1,285 of 1,285 checks with every target available; each of the six
targets passed 214 of 214. The PHP generator passed 173 tests. The extension passed 396 API checks in each of three
configurations and 24 engine tests, with one Linux-only test skipped. React, Vue, Svelte and the
HTML renderer each passed the 19 detail conformance cases, the Go and Rust generator tests
passed, and `npm run lint`, `npm run test:docs`, the core, React and HTML type checks,
`make docs-check` and `npm run test:forms` passed.

### 2026-09-15 — Share the preload link helper between list and detail fixtures

Framework conformance compares a rendered list without the image preload links that React's
server rendering and the HTML renderer write before it; the native generator suite compares the
complete HTML. That rule was implemented in `tests/fixtures/list-render/list-body.mjs` under the
list-specific name `listBody`. Detail fixtures follow the same rule, so the helper is now
`withoutPreloadLinks` in `tests/fixtures/preload-links.mjs`, used by the list fixture generator
and the React and HTML list conformance tests.

Regenerating the list fixture produced identical bytes, and the React and HTML list conformance
tests passed.

### 2026-09-15 — Build generator-core with its declared library

Every CI job failed in `npm run build`: `detail.ts` called `Object.hasOwn`,
which the package's declared TypeScript library does not include. That commit was described as
a changelog wording fix, but staging every change also committed unfinished detail work: the
detail model's input checks (a declaration that is not an object, a declaration without
`fields` and a record that is not an object each fail with their own message), their tests and
the generator script for a shared detail fixture, without its cases. 

The own-property check now uses `Object.prototype.hasOwnProperty.call`. The detail input checks
stay: they are correct and tested, and the remaining detail work follows as its own change.
`npm run build`, `npm run lint`, `npm run test:docs`, `make docs-check` and the core detail
tests passed.

### 2026-09-15 — Keep the script URL expression through lint

CI failed on the HTML renderer: `no-control-regex` rejected the script-URL expression the
HTML renderer takes from the reference renderer, which skips the control characters a URL may
hide between the letters of the scheme. 

The expression stays as the reference renderer writes it, with the rule disabled on that line
and a comment saying why the control characters are deliberate. `npm run lint` passes and the
HTML renderer passed 207 tests.

### 2026-09-15 — Record the candidate verification of the server-rendered frame

Candidate verification passed. Generation verification passed 450 of 450
results across 899 HTTP requests, which now include the built frame document, the SSR form
HTML with its record payload and ten rejected SSR queries per combination. Each PHP mode
passed 62 generation checks and the repository checks. Every server browser run passed 1,752
of 1,752 checks, and the aggregate passed 7,008 checks with zero failures: 1,216 scenario
checks, 5,376 initialization comparisons, 320 interaction checks, 32 mount-before-load checks
and 64 frame-document checks. PHP completed in 340,871 milliseconds, the PHP extension in
306,669, Go in 276,126 and Rust in 265,581, all below the 900,000 millisecond limit.

The feature record now states these results, the source archive digest and the image digest.

### 2026-09-15 — Apply the rendered-node rule to the column comparison

Candidate verification failed again for Vue, 16 of 168 comparisons in each Vue initialization
report: the hydrated column kept the server's style attribute text
(`--crudui-sticky-depth:0`) while the mounted column carried the block Vue computes
(`--crudui-sticky-depth: 0;`). The specification already states that a style attribute is
compared as the CSS object model serializes its declarations, and that rendering anchors are
left out, but only the frame's hydration check implemented that rule; the page compared raw
attribute text. React normalizes the attribute while hydrating and the HTML renderer writes
the same markup in both columns, so only Vue exposed the gap.

The rule is now one function, `renderedNodes`, in the shared form inspector: it removes the
comments and empty text frameworks keep as anchors and rewrites every style attribute as its
declaration block. The frame's hydration check and the page's column comparison both use it.

The form inspector tests passed 20 tests.

### 2026-09-15 — Compare what the view containers hold

Candidate verification of the frame document change failed for Vue in both rendering paths:
18 of 168 comparisons in each Vue initialization report, with the first difference on the form
view element itself. The `csr` column's container carried `data-v-app=""` and the `ssr`
column's did not. Vue writes that attribute in `createApp().mount()` and not in the
`createSSRApp()` mount that hydrates, so it records how the column started rather than what was
rendered; the earlier comparison never saw it because both columns mounted.

The comparison now covers what the view containers hold, through `renderedViews`, instead of
the containers themselves, which belong to the page. Hydration is still enforced, and more
strictly than before: the SSR frame requires the taken-over form DOM to be unchanged and, for
React, Vue and the HTML renderer, every server-rendered element to survive. The specification
records the Vue mark and where hydration is enforced.

The form inspector tests passed 19 tests.

### 2026-09-15 — State which runtimes implement detail views

The runtime operation table named `Generator::buildDetail`, `build_detail` and their render
counterparts for the PHP library, Rust and the PHP extension. None of those six symbols
exists: detail views are implemented in the JavaScript packages and in Go only, which is what
the feature contract already records (`buildDetail` and `renderDetail` are `partial`, with
PHP, Rust and PHP native `unsupported`).

The table now marks an unimplemented operation with an em dash and says what detail views
lack: the shared fixtures, the renderer conformance tests and the native byte-equality run
cover forms and lists, so nothing compares JavaScript and Go detail output. The four
JavaScript renderers each assert three substrings of their own inline specification, and the
only shared detail fixture holds two specification-validity cases with no record and no
expected HTML.

`make docs-check` passed.

### 2026-09-15 — Load the public browser modules with their imports

Candidate verification of the frame document change failed in the container: the source check
that loads the public frame readiness module in Chromium read the file and imported it from a
`data:` URL, so the shared browser matrix import it now carries could not resolve
(`Failed to resolve module specifier "./runtime-paths.mjs"`). The check had passed only while
every public module was a single file, and the import was added without extending it.

The check now serves the public modules over HTTP, as the deployment does, and loads the
module from a document of that origin, so the whole import graph is exercised, including the
JSON matrix. It also asserts the module's three exports. A frame that cannot initialize now
publishes the reason to the page instead of never publishing readiness, and the page fails
with that reason instead of waiting for the no-progress limit.

The four Chromium source checks passed, comparison source checks passed 150 tests and
`make docs-check` passed.

### 2026-09-15 — Serve the SSR column as a server-rendered frame document

The comparison page's `ssr` column was not server-rendered. Its frame document contained an
empty form view, the browser requested `render`, wrote the returned HTML into the page and
mounted the framework over it, so the first paint came from JavaScript in both columns. The
static-document check required that empty view, so the contract enforced the opposite of
server rendering. The separate SSR document the servers did serve was a page of its own with a
link, a native form and per-server provenance, which the comparison never loaded.

The `ssr` action now serves the frame document itself. Its query is exactly `lang`, `server`
and `initialization=ssr`, each once, and every other query is rejected with one message. The
server reads the built frame page, which must contain exactly one `<html>` start tag, one
empty `<div id="form-view"></div>` and one `</body>`, and returns that page with three
insertions and no other change: the language on the html start tag, the form rendered from the
stored record in the form view, and the record with generator provenance in a
`<script type="application/json" id="crudui-ssr">` before the body end tag, with `<`, `>` and
`&` escaped. PHP, the PHP extension, Go and Rust implement the same rule and the same two
error messages.

The frame document separates the server-rendered form from the browser-only tools:
`#form-view`, `#outline-view` and `#data-view`. Every adapter offers `mountView` and
`hydrateView` and declares what hydration does with the server nodes. React hydrates with
`hydrateRoot`, reports its commit from an effect of the hydrated tree instead of waiting, and
fails on a recoverable error; Vue hydrates with `createSSRApp`; the HTML renderer keeps the
markup and connects the form and structure map bindings. Svelte replaces the nodes: its
hydration reads the `<!--[-->` markers only its own server renderer writes, so it clears the
container and mounts, which the adapter declares and the specification records. The SSR frame
reads its record from the payload, requires the taken-over form DOM to be unchanged, and for
an adapter that adopts nodes requires every server-rendered element to survive. The `mounted`
initialization stage is now the document itself: the page resets the record and loads the
column's document again, so both columns start through their own path.

The checks follow the same contract from one module. `frame-document.mjs` reads a frame
document, removes an SSR document's three insertions and returns the built page; the frame
build, the browser check and the generation check all use it. Browser verification records
both initialization documents of every rendering path and framework, 16 per server, and
compares the pages behind all four servers by SHA-256. Generation verification adds the built
frame document, the payload record and provenance, and ten rejected SSR queries per
combination that every server must reject with the same message: 450 results and 899 requests.
The operations document's generation and aggregate totals were stale (290 results, 411
requests, 912 scenario checks); they now state the current totals.

Comparison source checks passed 149 tests and `make docs-check` passed.

### 2026-09-15 — Render only grammar nodes in Vue components

Measured in jsdom, Vue `createSSRApp` hydration of the server markup for the shared session
form replaced the input elements and reported 40 mismatches: the server markup had no node
where Vue expected a comment. The Vue node and structure map builders passed `null` for an
absent header, footer, number, title, row controls or nested body, and Vue renders a `null`
child as a placeholder comment. The shared comparisons remove comments before comparing, so
the extra nodes were never reported.

The builders now add no child for an absent part. After the change, hydrating the same
markup kept every element with no mismatch, and the rendered form, structure map and data view
contained no comment node on the `createForm` path (empty, after injection and with every row
collapsed) or the `bindForm` path. `npm test -w @crudui/generator-vue` passed 342 tests.

### 2026-09-15 — Make the HTML renderer match the string renderer format

The string renderers were meant to produce the same bytes, but the check never included the
HTML renderer: the native generation check compared PHP, the PHP extension, Go and Rust with
React's server rendering only. Compared byte for byte over the 90 form fixtures, the HTML
renderer differed from React in 60, in input attribute order, attribute name case
(`readonly`, `autocomplete`), void element closing, `style` text and text escaping; it also
wrote no list image preload links and escaped `>` in attribute values differently. The runtime
contract did not say which renderers the byte rule covers.

The contract now names the string renderers (React's server rendering, the HTML renderer and
the PHP, PHP extension, Go and Rust generators), makes React's server rendering the reference
and lists its format. The HTML renderer writes that format: escaping, React attribute names,
an input's `style`, `name`, `checked` and `value` last, void elements closed with `/>`, `style`
as `property:value` joined by `;`, blocked script URLs, a doubled leading newline in a
textarea, raw attributes for controls with event attributes, raw list actions and list image
preload links. The native generation check runs the HTML renderer as a sixth target through
`javascript.mjs --renderer html`, so the rule is enforced for every string renderer. The list
layout tests of React and the HTML renderer and the list fixture generator share
`list-body.mjs`, which removes the preload links before normalization, instead of separate
copies; regenerating the list fixtures produced identical bytes.

`make test-native` passed 1171 checks (195 for each of JavaScript, the HTML renderer, PHP,
Go, Rust and native PHP). `npm run test:forms` passed (core 110, HTML 207, React 352, Vue 342,
Svelte 339 and 10, Chromium 17), `npm run test:form-comparison:source` passed 141 and `:browser`
4, and `make docs-check` passed.

### 2026-09-15 — Write float fixture values as C double literals

`make test-native` stopped in the PHP extension engine test "list rendering has no undefined
behavior findings": the generated C fixture wrote `ps_float_value(1000000000000000100)`, and
Apple clang 21 rejected the implicit integer-to-double conversion that changes the value to
1000000000000000128 (`-Wimplicit-const-int-float-conversion` with `-Werror`). The same check
passed on 2026-09-14; Xcode 27 was installed on 2026-09-15 and `xcode-select` now selects its
clang 21 instead of the Command Line Tools 16.2 compiler. The value comes from the native
number case 1000000000000000128, which JavaScript prints as `1000000000000000100`.

The fixture writer emitted a number outside the safe integer range as JavaScript prints it,
so an integral value became a C integer literal. It now writes a C double literal, adding
`.0` to an integral value; C reads the literal as the same nearest double. The engine test
passed 22 tests; the address sanitizer test is skipped outside Linux by its declared
platform condition and runs in the Linux CI job.

### 2026-09-15 — Keep the comparison page on one screen

After deployment, real Safari pressed Expand all inside the left frame, moved the
pointer to the page header and ran the repeated injection comparison for PHP, React and
bindForm. It stopped with the pointer message after three comparisons instead of matching
168/168. Recorded while it ran: the page stayed at scroll 0 through `saved`; when the `copied`
stage moved focus to the new row, Safari scrolled the page to 602 px, the left frame's top
moved from 602 px to 0 under the resting pointer, and the frame's document element matched
`:hover`. The frames were stacked, each one viewport tall, in a scrolling page, so any focus
move could bring a frame under a pointer that the person had placed outside the frames.

The page now fits one screen and never scrolls. The title, controls, notes, comparison
results, source details and report form a panel limited to 45% of the viewport height that
scrolls inside, and the two frames share the rest side by side (stacked halves at 1000 px and
below), each scrolling inside. Measured with the page's markup and stylesheet, long results
and 3,000 px frame documents in Chromium and Playwright WebKit at 1680×1100 and 900×700: the
page is not scrollable, both frames lie inside the viewport, focusing a control at the bottom
of each frame scrolls that frame (2,474 px and 2,862 px) and leaves the page at 0, and a
pointer on the header is over neither frame. The comparison contract describes the layout.

`npm run test:form-comparison:source` passed 141 and `:browser` 4, and `make docs-check`
passed. On the deployed page, real Safari pressed Expand all inside the left frame,
moved the pointer to the page header and ran the repeated injection comparison for PHP, React
and bindForm: 168/168 matched. With the pointer resting over the left frame, the comparison
stopped with the pointer message and produced no result.

### 2026-09-15 — Capture comparisons only while the pointer is outside the frames

After deployment, real Safari driven by safaridriver repeated the procedure that
reproduced the focus outline difference: a real pointer press on Expand all inside the left
frame, then the repeated injection comparison for PHP, React and bindForm. The focused
control and its `:focus-visible` state were now equal in every stage, but the comparison
failed 7 of 168 on CSS, `copy-removed` through `restored`. The differing property was a
button's `background-color`: `rgb(249, 250, 251)`, the `.crudui-action:hover` background, in
the left column, where the pointer rested, and transparent or white in the right column.

A pointer rests over one frame only. In Chromium, Playwright WebKit and Safari, the frame's
document element matches `:hover` exactly while the pointer is over that frame. No page style
keeps `:hover` out of a frame in every browser: in Safari, `pointer-events: none` on the
iframes left the hover in place, and a transparent element covering the iframe, although it
was the topmost element at the pointer, cleared the hover only until the pointer moved from
the top-level document. Playwright WebKit also restored the hover after a move under both.

The comparison page now captures a column only while the pointer is outside both frames
(`src/frame-pointer.mjs`). When the pointer is over a frame, the comparison stops without a
result and asks to move the pointer outside the frames and compare again, and the list shown
after loading gives the same message instead of comparing. No style is removed from the
comparison. A Chromium check moves the pointer from the page onto a frame and back and reads
the frame's state each time.

`npm run test:form-comparison:source` passed 141 and `:browser` 4, and `make docs-check`
passed.

### 2026-09-15 — Set whether scripted focus is visible

In Safari, the repeated injection comparison for PHP, React and bindForm on the deployed
page failed `expanded-all`, `undone`, `empty` and `restored` on CSS only: focus was on
the same button in both columns, but the left column showed no focus outline and the right
column showed the `:focus-visible` outline. Real Safari driven by safaridriver passed 168/168
four times, once with the comparison started by a real pointer press. After a real pointer
press on Expand all inside the left frame, the comparison failed 8 of 168: `copy-removed`
through `restored` differed on CSS, and the stage records showed the focused control matching
`:focus-visible` in the right column and not in the left.

Measured in Chromium, Playwright WebKit and Safari: after a pointer press focuses a button, a
scripted `focus()` on another control does not match `:focus-visible`, and `focus({ focusVisible
})` decides it in all three. The bindings restored focus with `focus({ preventScroll: true })`
and moved it with `focus()`, and the comparison stages focused controls with `focus()`, so
pointer input earlier in one frame changed only that column.

The bindings now set visibility explicitly. `connectForm` records whether the focused control
matches `:focus-visible` and restores it with that visibility; focus moved to a row or an Add
button after an action, or to a row selected in the structure map, is visible, because the
move relocates the user. The comparison page's bindForm controller follows the same rule, and
the comparison stages focus controls with `focusVisible: true`, as a keyboard user does. The
runtime and comparison contracts state both rules. A Chromium check in the page, box and frame
hosts presses a toggle with the pointer, restores it without visible focus, restores a visibly
focused toggle with visible focus, and presses Add with the pointer to move visible focus to
the new row. Without the `connectForm` change it fails in all three hosts on the visibly
focused toggle; with it all pass.

`npm run test:forms` passed (core 110, HTML 207, React 352, Vue 342, Svelte 339 and 10,
Chromium 17), `npm run test:form-comparison:source` passed 141 and `:browser` 3, and `make
docs-check` passed.

### 2026-09-14 — State that the comparison storage lock covers one browser

While a Playwright WebKit comparison ran against the deployment, a check in Safari
did not finish, so the two runs shared the saved records although each page held its own
storage lock. The lock from `navigator.locks` belongs to one browser. The comparison
contract now states that other browsers, other people and automated runs against the same
deployment read and replace the records without it, so checks from different browsers must
not run at the same time. The servers keep one record store per server, rendering path and
framework; separating stores per run was considered and not adopted.

### 2026-09-14 — Mark unavailable actions with aria-disabled

In Safari, the repeated injection comparison on the deployed page reported
`restored` with CSS and focus differences: the left column kept focus, with its focus
outline, on the disabled Undo button, and the right column had no focus. It did not
reproduce in Chrome (React, bindForm, PHP: 168/168), in Playwright WebKit for all eight PHP
combinations (168/168 each), or in a complete Safari run (96 reports, 0 failed).

The `undone` stage focuses Undo and presses it; with the history empty, every renderer then
wrote `disabled` on that button. Measured in Playwright: a focused button that becomes
disabled keeps focus in Chromium, while WebKit clears focus at the next rendering update.
Either button replaced by an equal disabled button loses focus. "Undoing keeps the focused
action button" therefore depended on the browser and on whether WebKit's focus clearing ran
before or after the frame re-rendered and restored focus.

Every action button, in the form and the structure map, now marks an unavailable action with
`aria-disabled="true"` instead of `disabled`, in the HTML, React, Vue and Svelte renderers and
the Go, PHP, Rust and PHP extension generators. The button stays focusable and a click on it
does nothing: `connectForm`, `connectOutline` and the comparison page's bindForm controller
read `aria-disabled`, and the stylesheet styles `[aria-disabled='true']`. Field controls keep
`disabled`, which is declared data state. The shared form render and structure map fixtures
were regenerated; their only change is this attribute. The markup naming check rejects
`disabled` and any `aria-disabled` value other than `true` on action buttons, and the shared
DOM scenario checks that an unavailable Move up button keeps focus and changes nothing when
clicked.

`npm run test:forms` passed (core 110, HTML 207, React 352, Vue 342, Svelte 339 and 10,
Chromium 14), `make test-native` passed 976/976, the Go generator tests, the Rust generator
tests (20 and 4), the PHP generator tests (163), `npm run test:form-comparison:source` (141)
and `:browser` (3), `make docs-check` and `make format-check` passed.

On the deployed page, measured with Playwright for both frames of every framework and
rendering path on PHP, the Undo button starts with `aria-disabled="true"` and no `disabled`.
Focused and activated by a scripted click, as the `undone` stage does, or by Enter, Undo keeps
focus in Chromium and WebKit after the history empties and several rendering updates pass. A
mouse click on any button leaves focus on the body in WebKit, including Expand all, which
changes no data; that is WebKit's mouse behaviour, the same in both columns, and not a
rendering result.

### 2026-09-14 — Run one comparison storage operation at a time

On the deployed page, pressing Run checks in the left and right frames at the same
time failed several checks in both frames with "Check error". Run in one frame alone, the
same checks passed 19/19. Both frames, the page and every tab of the origin read and replace
the same saved records, but each frame and the page guarded only itself with its own
`running` flag, and the page's repeated injection comparison had no guard. The two runs reset
and saved over each other's records.

Operations started from the page now change the records only while they hold one origin lock
through `navigator.locks` (`src/storage-lock.mjs`): frame buttons, form submission, the
comparison button and the complete check. An operation started while another holds the lock
does not run and reports that another check or save is running. The checks that the complete
check and the verifier call directly run inside the operation that already holds the lock. A
frame that is running its own checks still ignores its other buttons, so their messages do
not replace the result list being written.

`npm run test:form-comparison:source` passed 141 tests, including the lock's two tests,
`npm run test:form-comparison:browser` passed 3 and `make docs-check` passed.

### 2026-09-14 — Query the collection again after an empty-collection addition

The candidate run, the first to build and run the HTML frames, passed generation
(386 results, 547 requests) and then failed 4 of the 1,744 PHP checks: the `empty` scenario
of the HTML renderer on both rendering paths and both transports reported "add into empty
collection: expected 1, actual 0". The run stopped there, so the other servers did not run.
The scenario held the collection element it found before pressing Add and counted rows in it
afterwards. React, Vue and Svelte keep that element, but the HTML renderer writes new markup
on every change, so the held element was detached. The runtime contract already allows rendering to replace
elements, so the scenario was wrong: `addEmpty` now receives a function that finds the
collection and queries it again after the addition renders, as the scenario's
`departmentWrapper` already did. The scenario's other helpers use elements only before the
action they perform.

That run used a separate git worktree of the commit, because candidate preparation refuses to
start in a checkout with uncommitted changes.
`npm run test:form-comparison:source` passed 139 tests.

### 2026-09-14 — Add Go detail model and SSR rendering

The Go generator now provides `BuildDetail` and `RenderDetail`, reusing the
existing ordered display and composition path used by `BuildList`. The command
adapter accepts a single object record for the `renderDetail` operation.

### 2026-09-14 — Add Svelte detail rendering

The Svelte generator now exports the shared read-only `Detail` component and
`renderDetail` SSR entry point. Its display branches consume the core detail
model and preserve the existing raw HTML display boundary.

### 2026-09-14 — Add Vue detail rendering

The Vue generator now exports the shared `Detail` component and asynchronous
`renderDetail` SSR entry point. It consumes the core detail model and the
existing list cell display mapping.

### 2026-09-14 — Add React detail rendering

The React generator now exports the shared `Detail` component and
`renderDetail`, reading the core detail model and existing cell display
components. The output remains read-only and performs no data access or
duplicate display evaluation.

### 2026-09-14 — Add the CRUDUI detail specification and shared read model

CRUDUI now defines a `Detail` declaration with ordered read-only display fields.
The core exports `buildDetail`, which delegates composition, conditions,
localization and display formats to the existing list engine, and the HTML
generator exports `renderDetail`. The TypeScript validator and schema checks
cover the new entry point. Other runtime generators remain incomplete and the
feature is recorded as partial.

### 2026-09-14 — Compare the HTML renderer on the comparison page

The comparison page rendered the client columns with React, Vue and Svelte only;
`@crudui/generator-html`, the framework-independent renderer, was never part of the
browser matrix. `html` is now the fourth framework in `runtime-paths.json`, so the
servers accept its routes and render its SSR documents, and every check covers it.

- `create-form-html.ts` renders `renderForm`, `renderOutline` and `renderData` into the
  frame, connects one `connectForm` binding (which runs both the form's and the
  structure map's actions) before its rendering subscription, and renders again and
  synchronizes on every change. `bind-form-html.ts` renders `renderFormView`,
  `renderOutlineView` and `renderDataPanel` from `bindForm`. The frame build resolves
  `#html` to the renderer source, and the page offers HTML in its framework selector
  and names it in its introduction and README.
- Tests that wrote matrix numbers now derive them: the generation test uses the exported
  generation totals, the interaction test multiplies the matrix by its five actions, and
  the runtime-path test compares the combination counts with the matrix.
- The comparison specification states the new sizes: 64 scenario and 32 initialization
  reports; per server a job of 24 reports (16 scenario, 8 initialization), 80
  interaction, 8 mount-before-load and 8 static-document checks; an aggregate of
  1,216 scenario checks, 5,376 initialization comparisons, 320 interaction, 32 mount
  and 32 static-document checks; and generation verification of 386 results, 547
  requests and 32 combinations. Two errors in that text are corrected with it: the
  aggregate still said 4,608 initialization comparisons although the categories had been reduced
  to seven, and it named the mount-before-load frame `inject`, the
  column name that `csr` replaced. The runtime package and native generator
  documents name the HTML renderer among the browser targets.

`make format-check`, `npm run test:form-comparison` (source 139, library 10, browser
job 3), `npm run test:runtimes` (20), `make docs-check`, the Go server tests and the Rust
server tests (4) passed. The frames, including the HTML frames, are built and run
against the four servers only by the candidate verification.

### 2026-09-14 — Render a bindForm form with the HTML renderer

React, Vue and Svelte render a form owned through `bindForm` with the
stateless `FormFields`, but `@crudui/generator-html` could render a form only from a
`createForm` instance (`renderForm(form)`); its structure map and data view already had
stateless `renderOutlineView` and `renderDataPanel`. `renderFormView(fields, buttons,
messages)` now renders the `crudui-form` block from `bindForm`, `bindButtons` and
`formMessages`, and `renderForm` uses it, so the markup is built in one place. The
README and the form runtime specification describe it.

The HTML renderer's conformance test renders every renderable form fixture through this
path as well. That includes the missing-data case the instance path skips, because
`bindForm` gives missing repeated data its fixed row key. `npm test -w
@crudui/generator-html` passed 206 tests (116 before, plus 90 bindForm cases),
`npm run build -w @crudui/generator-html` succeeded and `make docs-check` passed.

### 2026-09-14 — Correct the runtime contract on attribute order

The form runtime specification still required the restored HTML string to match
"including attribute order" and said the shared DOM binding places a checkbox's `checked`
attribute last. That criterion had been corrected, and the code that enforced it
had been removed, but the contract text was left unchanged. The specification now states
the corrected rule: attribute order is not part of the contract, the bindings never
rearrange attributes, the comparisons use the parsed DOM, and the string renderers'
byte-identical HTML is checked separately.

`make docs-check` passed.

### 2026-09-14 — Derive the browser report counts from the matrix

After the browser matrix moved to one file, the server report policy still wrote its
report counts as numbers: 18 reports in a browser job, 12 scenario reports, 6
initialization reports, 60 interaction checks and 6 mount-before-load and static-document
checks, and `check.mjs` started each job at 18. Adding a framework would have made every
number wrong. The policy now checks each count against the combination functions it
already uses to check the report keys, and `browserJobReportCount()` (scenario reports
plus initialization reports) gives the job size to `check.mjs` and the report test.

`npm run test:form-comparison:source` passed 139 tests.

### 2026-09-14 — Define the comparison browser matrix once

The comparison page's servers, rendering paths, frameworks, transports, initializations
and API actions were written in `runtime-paths.mjs` and again in the browser report
policy, the candidate verification, readiness and startup checks, the frame, the
deployment health check, the PHP API and generator, and the Go and Rust servers and
their tests. Adding a renderer meant finding every list; the framework-independent HTML
renderer was never added to the comparison, partly because of this.

The matrix is now defined once in `examples/form-comparison/src/runtime-paths.json`.
`runtime-paths.mjs` imports it and every JavaScript check uses its exports. The build
publishes the file next to `spec.json`. The Go server (`newServer`) and the Rust server
(`Server::load`) read it once at startup and build their API routes from it, so a
cached-template render still reads no files; their tests load the same file. The PHP
API validates routes with `browserMatrix()` in the new `matrix.php`, and the PHP
generation test iterates it. `FormGeneration::document()` no longer repeats the rendering
path and framework check the API route already makes; a first version that read the
matrix inside `FormGeneration` broke the request-construction checks, which must not
read files, and was replaced by the separate function.

`npm run test:form-comparison` (source 139, library 10, browser job 3), the Go server
tests, the Rust server tests (4), `php -l` for the changed PHP files and `make format-check`
passed; `browserMatrix()` read the rendering paths, frameworks and actions from the file.

### 2026-09-14 — Keep one form snapshot module

`form-snapshot.mjs` and its test existed twice with identical content:
`tests/form-inspector/` (the original) and a copy in `examples/form-comparison/src/`. A
change had to be made in both, and the comparison suite ran the copy's test while CI's
native job ran the original's. The copy and its test are removed. The comparison frame
imports the original, the comparison build publishes the original to the page, and
`test:form-comparison:source` runs the original test, so local checks and the comparison
CI job keep covering it.

`node --test tests/form-inspector/form-snapshot.test.mjs` passed 18 tests and
`npm run test:form-comparison` passed with the original in its source checks.

### 2026-09-14 — Compare browser DOM without attribute order and remove the code that forced it

Running the comparison page's complete check in Safari failed `ssr/restoration`
and `csr/restoration` in the `html` category for Vue with `bindForm` on all four servers,
while every other category, including the parsed DOM, passed. The only difference was one
checkbox: mounted as `checked="" value="1"`, restored as `value="1" checked=""`. The
candidate verification had passed because it runs Chromium only.

The criterion was wrong, not the forms. Serialized HTML exposes the order in which
attributes were created, which the framework and the browser engine decide; attribute
order is not part of the DOM. To satisfy it, three places rearranged attributes for the
test alone and assumed Chromium's order: `connectForm`'s `sync()` moved `checked` last,
the comparison `bindForm` controller recorded and restored each control's attribute
order, and React's `resolvedStyleProps` placed `style` after the rendered attributes.
The corrected rule: string renderers (PHP, the PHP extension, Go, Rust and the HTML
renderer) stay byte-identical, which the generation checks verify; DOM built in a browser
must match as parsed DOM (elements, attribute names and values, text, child order) on any
path and engine; no code rearranges the DOM to satisfy a comparison.

- The initialization comparisons drop the `html` category (seven categories, 168 results
  per report); `formSnapshot` still records the HTML as evidence. The shared
  initialization test compares the snapshot without it, and React's style test compares
  nodes with `isEqualNode`.
- Removed the three attribute-order routines and the controller test that fixed a
  checkbox's attribute order.
- The expected browser totals were written as numbers in the deployment check and two
  tests (456, 2304, 5,808), so the category change left a stale total. They are now
  computed once by `expectedBrowserSections()` in `browser-report-policy.mjs` from the
  browser matrix, and the deployment check and tests use it.

`make format-check`, `npm run test:forms` (core 108, HTML 116, React 350, Vue 341,
Svelte 338 and 10 client tests, 14 Chromium and naming checks),
`npm run test:form-comparison` (source 139, library 10, browser job 3),
`npm run test:build` (9), `npm run test:dependencies` (12), `npm run test:runtimes` (20)
and `make docs-check` passed.

### 2026-09-14 — Build the validator before generator-core in the form comparison checks

The next `main` CI run failed the same job again, one step earlier: building
`@crudui/generator-core` stopped with `Cannot find module '@crudui/validator'`, because
generator-core's declarations import the validator package, which had not been built.
The previous check removed only `packages/generator-core/dist`, so a local validator
build hid it. `test:form-comparison:source` now runs `build:validator` before building
generator-core, the same order `test:forms` uses. With both `packages/validator-ts/dist`
and `packages/generator-core/dist` removed, `npm run test:form-comparison:source` built
both packages and passed 140 tests.

### 2026-09-14 — Run the form suite's Chromium checks with the sandboxed CI Chrome

The same `main` CI run also failed the "Form instances and data injection" job: the six
Chromium style checks that this branch added to `npm run test:forms` could not launch
the browser ("No usable sandbox!"). That job was not a browser job before, so it used
Puppeteer's downloaded Chrome, which has no usable sandbox on the Ubuntu runners, while
the other browser jobs select the regular Chrome at `/opt/google/chrome/chrome`, skip
the Puppeteer download and verify the sandbox with `scripts/check-ci-browser.mjs`. The
job now does the same, and the CI policy test that lists the browser jobs includes it
and checks that `tests/form-styles.test.mjs` never disables the sandbox. Against the
previous workflow the policy test failed with the three missing settings of
`form-runtime`; with the change `npm run test:runtimes` passed 20 tests.

### 2026-09-14 — Build generator-core before the form comparison source checks

After the merge into `main`, the CI job "Form comparison runner regressions" failed:
`examples/form-comparison/src/bind-form-controller.test.mjs` could not load
`@crudui/generator-core/dist/index.mjs`. The comparison `bindForm` controller has used
generator-core's view-state and history functions since this branch, and that CI job
runs `npm run test:form-comparison` on a clean checkout without building packages. It
passed locally only because an earlier build had left `dist` in place.
`test:form-comparison:source` now builds `@crudui/generator-core`, the only package the
comparison sources import, before running, as `test:forms` builds its packages.

With `packages/generator-core/dist` removed, `npm run test:form-comparison:source`
built the package and passed 140 tests.

### 2026-09-14 — Record the screen-sized frame candidate run and its deployment

`node examples/form-comparison/candidate-verification.mjs` passed: PHP, the
PHP extension, Go and Rust each passed 1,452 checks with no failure, and the browser
verification recorded 5,808 checks with no failure. `node
examples/form-comparison/comparison-deployment.mjs --commit <commit>…` deployed it at
`https://crudui.test/` and passed the identical reapplication. In a 798 px browser
window the frame is 798 px tall and the SSR and CSR columns match 8/8. With the page
scrolled to the frame and the frame scrolled by 700 px, the company header is at the
top of the screen on its 0 px line and the store header at 39 px on its 38.5 px line,
both showing their level labels, while the department and Busan headers, not stuck,
hide theirs. A measurement taken right after scrolling, before the page rendered,
still read the labels as hidden; measured again after rendering they showed.

### 2026-09-14 — Size the comparison frames to the screen

After sticky rows became CSS only, the comparison page still behaved differently from a
page. The cause was its layout, not script: each frame was fixed at 1,450 px on a
798 px screen, so the page and the frame both scrolled, and the frame's top edge,
where sticky headers pin, left the screen as soon as the page scrolled. A scrolling box
taller than the screen behaves the same way. Each frame is now `100vh` tall, so its
scroll area is exactly what the viewer sees. Two comments that still said the scroll
position decides the current row (`actions.ts`, `instance.ts`) were corrected; the only
script left around scrolling is focusing a row's control after an action or a map
selection.

The generator-core tests (108) and `npm run test:form-comparison:source` (140) passed.

### 2026-09-14 — Record the CSS-only sticky candidate run and its deployment

`node examples/form-comparison/candidate-verification.mjs` passed. PHP,
the PHP extension, Go and Rust each passed 1,452 checks with no failure, and the
browser verification recorded 5,808 checks with no failure. Earlier runs had stopped:
one failed in the React SSR takeover of sticky rows and one on a Chromium
screenshot error, both fixed or superseded by later commits, and the first run of
this tree failed while building the image because the disk was full. The container
image builder held about 75 GB of build cache from the repeated candidate builds;
`container prune`, `container image prune --all` and deleting the builder (which
rebuilds its cache on the next build) left 83 GiB free, and the running containers
and volumes were not touched. `node examples/form-comparison/comparison-deployment.mjs
--commit <commit>…` deployed it at `https://crudui.test/` and passed the identical
reapplication. In a browser the SSR and CSR columns match 8/8, each frame has four
sticky rows and no `data-crudui-stuck`, `data-crudui-current` or published lengths,
and after scrolling the SSR frame the company header sits on its line with its label
shown while the not yet stuck Busan header hides its label.

### 2026-09-14 — Make sticky rows CSS only and remove scroll measuring

Sticky rows did not behave the same in a frame as in a page because the browser
binding measured the scroll position in script: `connectRows` decided which rows were
stuck and current from bounding rectangles, published lengths for a computed space
after the form, and `alignRow` scrolled rows with `scrollIntoView`, which also scrolls
every enclosing document. Each fix to one of those calculations (the scroll container,
the content after the form) exposed another place where the reference was wrong. Sticky rows now use only what CSS
can do.

- Removed: `connectRows`, `RowTracking`, `markOutline`, `alignRow`, the
  `data-crudui-stuck` and `data-crudui-current` attributes, the `crudui-current` event,
  the structure map's `aria-current` marking, the published
  `--crudui-scroll-height` and `--crudui-form-end-*` lengths, the space after the form,
  the current row border and the rule that showed `controls: outline` on the current
  map line only (map lines now always show their controls). The jsdom stand-in for
  `scrollIntoView` and the takeover comparisons' exclusions for those attributes are
  gone with them, and `contracts/features.json` no longer lists the three functions.
- `crudui.css`: sticky headers still stack on `--crudui-sticky-depth` lines; the level
  label shows only while its header is stuck, through a `scroll-state(stuck: top)`
  container query; controls in a sticky row keep a top scroll margin of the headers
  pinned above them (`--crudui-sticky-cover`) and every form control a bottom scroll
  margin of the footer.
- Moving to a row after a row operation or a structure map selection focuses its
  control, and the browser scrolls it into view (Chromium centres it); the same code
  runs in `connectForm`, `connectOutline` and the comparison `bindForm` controller.
- The Chromium style checks run every case in a page, in a scrolling box and in a
  frame: stacked headers on their lines with labels only while stuck, and focus after
  adding a row and after a map selection clear of the pinned headers and the footer.

`make format-check`, `npm run test:forms` (core 108, HTML 116, React 350, Vue 341,
Svelte 338 and 10 client tests), `npm run test:form-comparison:source` (140),
`npm run test:build`, `npm run test:dependencies`, `make docs-check` and the Chromium
style checks (6: two in each host) passed. The last `make docs-check` run first failed
because the disk was full while rebuilding the Rust crates; after removing the stopped
candidate container, image and directory it passed.

### 2026-09-14 — Take over sticky rows identically in React

A candidate run failed in `browser-php`: the SSR takeover in React
differed on the first sticky row, whose style the server writes as
`--crudui-sticky-depth:0` and React as `--crudui-sticky-depth: 0;`. The local shared
takeover test had not caught it because its specification had no sticky rows; only the comparison example declared sticky rows.

- A `style` attribute is a CSS declaration block, so the takeover comparison, in the
  comparison frame and in `compareServerTakeover`, compares it as the CSS object model
  serializes its declarations.
- The shared form session specification declares sticky rows for companies and stores,
  so the React, Vue and Svelte form tests render and compare them.
- That exposed an earlier React fault: `resolvedStyleProps` removed and
  re-added the style attribute each time React called its ref, on every render, so a
  re-rendered row's style moved after the `data-crudui-current` attribute the browser
  binding had written, and a form given its data later differed in raw HTML from one
  created with it. The style attribute is now placed after the rendered attributes
  only when an element first connects, and later declarations replace it in place.

`make format-check`, `npm run test:forms` (core 108, HTML 116, React 350, Vue 341,
Svelte 338 and 10 client tests), `npm run test:form-comparison:source`,
`npm run test:build`, `npm run test:dependencies`, `make docs-check` and the Chromium
style checks (5) passed.

### 2026-09-14 — Count the content after the form in the trailing space

The trailing space after the form ignored the content that already follows the form in
its scroll container. In the comparison frame, where the results follow the form, it
added 1,037 px (the 1,448 px frame less the 362 px end-row extent and the 49 px footer),
leaving a blank area between the form and the results, and the end row scrolled past
its line by the height of that content. The rule now subtracts the content after the
form, apart from the form's own margin, measured by `connectRows` and published as
`--crudui-form-end-after`, and never goes below zero. Scrolling stops with the end row
on its line when the content after the form is shorter than the space it needs, and
longer content scrolls into view with no space added. The documentation no longer
describes the limit as exact only when nothing follows the form.

Two Chromium checks cover it: 60 px of content after a form in a scrolling box, where
the end row stopped 60 px past its line before the change (27 px against 87 px), and
600 px of content, where no space is added and the content scrolls to its end.

### 2026-09-14 — Apply the sticky rules in any scroll container and declare sticky rows in the comparison example

The comparison page showed no sticky headers because its example specification did
not declare `multiple.header: sticky`; the local preview declared it, so the same
generator behaved differently between the two examples. Checking why exposed a fault
that would appear wherever a form sits in a scrolling box, a dialog or a frame rather
than the page: `crudui.css` computed the trailing space after the form from `100vh`,
the page viewport, while the sticky headers follow their scroll container, and
`connectRows` treated an ancestor as the scroll container only while its content
already overflowed, unlike `position: sticky`. In a 420 px scrolling box inside a
700 px page, scrolling went on until the end row was 193 px above the box instead of
stopping with it on its 87 px line.

- `connectRows` resolves the scroll container as `position: sticky` does (the nearest
  ancestor whose vertical overflow is `auto` or `scroll`, otherwise the document) and
  publishes its height as `--crudui-scroll-height` with the two end-row lengths;
  `crudui.css` uses it in place of `100vh`. The SSR takeover comparisons leave it out
  with the other binding state. A DOM without `scrollingElement`, such as jsdom, uses
  its root element as the document scroller, and the comparison controller test's
  stand-in document has a root element like a real one.
- The comparison example declares `header: sticky` and `title: name` for companies,
  stores and departments, so every server and framework renders and compares sticky
  rows.
- A Chromium check mounts a form in a scrolling box and verifies stuck headers on
  their lines, no scroll pull-back, the end row stopping on its line and being current,
  and the published height. Before the change it failed with the end row at −193 px
  against its 87 px line.

### 2026-09-13 — Record the passing SSR/CSR candidate run and its deployment

`node examples/form-comparison/candidate-verification.mjs` passed. PHP,
the PHP extension, Go and Rust each passed 1,452 checks with no failure, including
192 initialization comparisons per server, rendering path and framework with the SSR
takeover. The browser verification recorded 5,808 checks with no failure. The first
run stopped during image construction because the disk was full; the Go
build cache and temporary check directories were removed and the same commit was run
again. `node examples/form-comparison/comparison-deployment.mjs --commit <commit>…`
deployed it at `https://crudui.test/` and passed the identical reapplication. In a
browser the page shows the SSR and CSR columns (side by side above 1,000 px wide)
with 8/8 comparisons matching for PHP, React and bindForm.

### 2026-09-13 — Use the SSR and CSR column names in the browser interaction checks

A candidate run failed in `browser-php` before any interaction ran: the
interaction check still looked for the frame with `initialization=data`, and the initial
mount check still looked for `initialization=inject`, the column names that `ssr` and `csr` replaced.
The interaction check now uses the `ssr` frame, the initial mount check the `csr` frame,
and the report test fixture the `ssr` column. These checks run only inside the candidate
container, so the local source checks (140 passed) did not reveal the old names.

### 2026-09-13 — Restore the React form session tests removed with the legacy UI

An earlier change deleted `packages/generator-react/src/__tests__/Form.test.tsx` together with
the legacy FormBuilder test in the same file, so React stopped running the shared
initialization, session DOM, control and focus scenarios that Vue and Svelte run. The
file is restored without the legacy test and also runs `compareServerTakeover`.
React passes 350 tests.

### 2026-09-13 — Make Vue and Svelte take over server-rendered forms without changing them

The first candidate run failed in the SSR column. Vue keeps comment nodes as
anchors for conditional blocks, and Svelte 5 kept the whitespace between sibling
elements of its templates as text nodes, left empty text anchors, and did not write the
`value` attribute of inputs, the text of textareas or the `checked` attribute of
checkboxes into the browser DOM. Comments and empty text render nothing, so the takeover
comparison leaves them out in the comparison frame and in a new shared test,
`compareServerTakeover`, which the Vue and Svelte form tests run against the HTML
renderer's output for the same session. The Svelte templates are written without
whitespace between sibling nodes, and inputs, textareas and checkboxes set both the
server attribute or text and `defaultValue`/`defaultChecked`, so Svelte's server output
and its browser DOM equal the other renderers'.

`make format-check`, `npm run test:forms` (core 108, HTML 116, Vue 341, Svelte 338 and
10 client tests), `npm run test:form-comparison:source`,
`npm run test:build`, `npm run test:dependencies`, `make docs-check` and `svelte-check`
passed. The candidate verification is recorded in a separate entry.

### 2026-09-13 — Compare server-side and client-side rendering on the comparison page

The comparison page showed two client-side columns, "create with data" and "mount,
then inject data", so it never showed that the server languages and the browser
frameworks render the same form. The columns are now SSR and CSR. In the SSR column
(`initialization=ssr`) the selected server (PHP, the PHP extension, Go or Rust)
renders the form with the saved record, the frame places that HTML in the page, and
the selected framework takes the form over with the same template and data; the
takeover must leave the parsed form DOM (every element, attribute value, text and
comment) unchanged, apart from the state the browser binding writes
(`data-crudui-stuck`, `data-crudui-current` and the end-row lengths). The first
candidate run compared serialized HTML and failed only on attribute order: React sets
an input's `type`, `value` and `name` after its other attributes. Attribute order is
not part of the DOM, and the string renderers' byte-identical HTML stays covered by the
generation checks, so the takeover compares the parsed DOM.
The CSR column (`initialization=csr`) mounts the form without data and injects the
record. Every stage is then compared between the columns as before. The comparison
labels, the SSR document links, the frame readiness and typing checks and the
documentation use the new names.

The form comparison source checks passed 140, the Go and Rust comparison server tests
passed, and `make docs-check` passed. The SSR takeover itself runs only in the
four-server candidate verification, recorded in a separate entry.

### 2026-09-13 — Record the passing four-server candidate runs for crudui.css and the legacy removal

`node examples/form-comparison/candidate-verification.mjs` passed for form
styling with `crudui.css` alone and for the tree after removing the legacy UI paths
and fixing the build and dependency checks). In each run PHP, the PHP extension, Go
and Rust passed 1,452 checks with no failure, the browser verification recorded
5,808 checks with no failure, and the command returned status 0.

### 2026-09-13 — Fix the build and dependency checks that CI runs

`npm run test:build` and `npm run test:dependencies` were failing, and the form
suites used during this work did not run them:

- `tests/build/public-types.mts` and `public-types.cts` still named `FieldShape` and
  `MultipleSettings`, which the node view model removed. They now name the current
  public types `NodeVM` and `ButtonVM`.
- The form comparison controller imports `@crudui/generator-core`,
  but the root package did not declare it. The root package now declares the
  workspace package as a development dependency.
- `tests/build/package-install-pack.test.mjs` passed paths that do not exist, while
  `packPackage` reads the source manifest to check the package name.
  The tests now write a manifest in a temporary directory.

`npm run test:build`, `npm run test:dependencies` and `npm run test:runtimes` passed,
as did every `tests/build` and `tests/docs` test (67).

### 2026-09-13 — Remove the Bootstrap-based legacy UI paths

The legacy form components and the earlier rendering comparisons were
built on Bootstrap and are replaced by the node grammar and `crudui.css`. They are
removed rather than kept beside the current path:

- `@crudui/generator-react/legacy`, `@crudui/generator-vue/legacy` and
  `@crudui/generator-svelte/legacy` with their sources, the React
  `@crudui/generator-react/styles.css` stylesheet, and the tests that exercised them
  (16 React tests, the Vue and Svelte parity tests and captures, the Svelte legacy
  component test);
- the earlier demo, playground and rendering-comparison examples and `react-usage.tsx`, with their
  docker-compose services and README entries;
- `tests/cross-framework`,
  the CI parity job, whose Vue and
  Svelte steps repeated the form-render job;
- the `lucide-react` and `yaml` dependencies of the React, Vue and Svelte packages,
  which only the legacy components used.

The legacy specification translation and validators (`@crudui/validator/legacy`
and its PHP, Go and Rust counterparts), the legacy validation API examples and their
shared specifications stay: they validate data and render nothing. The public
package test now checks that `@crudui/generator-core/crudui.css` is the only exported
stylesheet.

After the removal `npm run build`, `npm run lint` and the Svelte type check passed.
generator-core and HTML still passed 108 and 116 tests; React, Vue and Svelte passed
347, 341 and 338 (358, 7 and 11 fewer: the removed legacy tests), the Svelte client
10 and the Node checks 11. The form comparison source checks passed 140, the new
stylesheet export check passed, and `make docs-check` passed after the legacy schema
and visibility documents stopped linking the removed React sources. The same run
showed that the declaration compile check in `tests/build/public-packages.test.mjs`
and two dependency and pack checks were already failing; the next entry fixes them.

### 2026-09-13 — Style a form with crudui.css alone: widgets use the crudui grammar instead of Bootstrap

Widget markup still used the Bootstrap vocabulary
(`form-control`, `form-select`, `input-group`, `input-group-text`, `btn`,
`btn-group`, `btn-check`, `btn-switch`, `flex-wrap`, a `data-toggle="buttons"`
attribute, and `p-0 border-0` on an unframed language group), and the core
stylesheet did not style any of it. The preview loaded Bootstrap from a CDN and the
comparison page styled the controls inside `#view`, so a form looked right only with
styles from outside the library. Widgets now follow the class grammar in all five
implementations and eight renderers: `crudui-widget` with `__affix`, `__button`,
`--search` and `--unsupported`; `crudui-input` with `--select` and `--file`;
`crudui-choices` with `__input`, `__label` and `--multiple`; an action widget button
is `crudui-action crudui-action--text`; and a framed language group is
`crudui-node--framed`. The widget model layouts `input-group` and `btn-group` are
now `widget` and `choices`. The only other classes a renderer writes are the
validation hooks `valid-target` and `valid-target-async`, the editor hosts and the
classes a spec declares, and the naming check now fails on any other class.

The core stylesheet is `@crudui/generator-core/crudui.css` (the `./styles.css` export
is removed). It styles every widget, and every rule is scoped to a crudui block,
including box sizing and hiding `[hidden]` elements. Pages style only their own
layout: the preview keeps its layout in the page and no longer loads Bootstrap, the
comparison page stylesheet no longer styles anything inside `#view`, and the SSR
documents of the comparison servers load `crudui.css`. The Go and PHP package
examples also take the form styles from `crudui.css` and no longer append their own
submit button, which duplicated the form footer's.

`make format-check` passed. generator-core, HTML, React, Vue and Svelte passed 108,
116, 705, 348 and 349 tests with the regenerated form-render and structure map
fixtures, the Svelte client 10, and the Node checks 11, including the naming check
that rejects classes outside the grammar. `make test-native` passed all 976 generator
checks (195 per implementation) with PHP API checks 361 per configuration and 103
validation cases. The comparison Go and Rust server tests, the comparison source
checks 140 and its Chromium checks 3, and `make docs-check` passed. In Chrome the
preview loads two stylesheets, its own layout and `crudui.css`, and renders inputs,
selects, textareas, checkboxes, language frames, the structure map and the footer
buttons without Bootstrap.

### 2026-09-13 — Format every Rust crate and Go file, and check it with `make format-check`

No check ran rustfmt or gofmt, so formatting drifted: five Rust crates had 62
rustfmt differences (54 in generator-rust, including code from the recent form
changes) and two Go files had gofmt differences. `tests/runner/go/run_test.go`
repeated its import alias (`validator validator "…"`) and did not compile at all.
All crates and files are now formatted and the import is fixed. `make format-check`
runs `cargo fmt --check` for every tracked `Cargo.toml` through the shared Rust
command entry point and `gofmt -l` for every tracked Go file, and fails on any
difference. The comparison Rust server test that compiles the spec by reference now
keeps `buttons` on the root, as the comparison checks do.

`make format-check` passed. generator-rust passed 20 and 4 tests, validator-rust
all its test targets, the comparison Rust server 4, `go test` for the legacy Go
validator and the Go test runner passed, the legacy Rust API and the Rust bench
built, and `make test-native` passed all 976 generator checks.

### 2026-09-13 — Record the passing four-server candidate run for the buttons and scrolling changes

`node examples/form-comparison/candidate-verification.mjs --ref <commit>` passed:
PHP, the PHP extension, Go and Rust each passed 1,452 checks with no failure, the
browser verification recorded 5,808 checks with no failure, and the command returned
status 0. It covers the form buttons, the naming and DOM scenario checks,
rendering nothing while scrolling and the two comparison fixes
the earlier runs found: one run failed in the PHP generation test
and the next failed in the reference compilation check; both are fixed.

### 2026-09-13 — Scrolling renders nothing: the current row is no longer instance state

Scrolling past a row made it current, and `connectForm` then called
`selectRow`, which published a new snapshot. The views re-render on every
snapshot, so each row boundary crossed while scrolling replaced the whole form, the
structure map and the data view, and restored the focused control and its text
selection. With a control focused, the scroll was pulled back toward it. The
selection existed only to mark the map, so it is removed rather than guarded:
`FormInstance.selectRow`, the snapshot and view state `selection`, `RowSelection`,
`selectRowView` and `OutlineRow.current` are gone, and `setAllExpandedView` takes
only the nodes and the expansion. `connectRows(element)` tracks only form rows (map
rows carry their own `data-field-path`) and dispatches `crudui-current` when another
row becomes current. The new `markOutline(outline, form)` sets `aria-current` on the
map row of the form's current row; `connectOutline` calls it on that event and
whenever the map is rendered again, and the comparison `bindForm` controller calls it
for its map. `select-row` changes no state: `runAction` returns the row to move to and
the binding aligns it. With `multiple.controls: outline` the map renders every row's
controls and the stylesheet shows those of the current row.

The Chromium style checks now render the structure map next to the form and assert
that scrolling through the rows renders nothing and that the map marks exactly the
current form row at every step. A puppeteer probe of the preview, with two members
added and a control focused, measured one or two full renders per scroll gesture
before the change and none after it. generator-core, HTML, React, Vue and Svelte
passed 108, 116, 705, 348 and 349 tests with the regenerated structure map fixture,
the Svelte client 10, the Node checks (normalizer, styles and naming) 11, the form
comparison source checks 140 and its Chromium checks 3, and `make docs-check` passed.

### 2026-09-13 — Check the markup naming rules and the collapse and undo DOM paths

The class naming rules of the form markup (N1–N3: `crudui-{block}`,
`__{element}`, `--{modifier}` with its block, parts inside a node header, nodes
inside a body) were documented but not checked. `tests/form-markup/naming.test.mjs`
now checks every `crudui-` class in the form render and structure map fixtures
against the allowed blocks, elements and modifiers, and rejects five broken samples;
`npm run test:forms` runs it. The shared DOM scenario also collapses and expands
every row, checking each toggle's `aria-expanded` and the `hidden` body it names
with `aria-controls`, and undoes an edit, checking the control and instance values.

The naming check passed 2 tests, and React, Vue and Svelte ran the extended scenario
in their 705, 348 and 349 passing tests.

### 2026-09-13 — Form buttons in a pinned footer, and the space after the form outside it

Specs declare form buttons at the root (`buttons`, with a submission `action`), but
the schema rejected them and compilation kept only `properties`, so declared save,
cancel and back buttons disappeared. Buttons are now part of the form contract in
all five implementations. `buttons` is a list of `{ type: submit | reset | button |
link, text, name, value, href, design, behavior }`; a spec without `buttons` gets one
submit button. Submit and reset default to interface text; a button or link needs
`text` and a link needs `href`. `action` (`method`, `url`, `enctype`) is kept in the
template. Both are rejected below the form root. The template
carries `buttons` and `action`, `bindButtons` evaluates them and the snapshot holds
them, and every renderer puts them in `crudui-form__footer`, one controls group whose
markup comes from `formButtonsHtml`. The footer pins to the bottom of the scroll
container at `--crudui-form-footer-height`, as sticky row headers pin to the top. The
JSON schema, the four validators, the CLI and the legacy translator accept the
declarations.

The row at the end of the form now reaches its line through space outside the form
instead of a minimum height inside the last row, which left a blank inside nested
cards. `connectRows` publishes two measured lengths on the connected element (the
extent from that row's top to the end of the form content, and its aligned top), and
the stylesheet gives `.crudui-form` a bottom margin of the viewport less those lengths
and the footer. Publishing on the form element itself let a re-render drop the
margin and pull the scroll back; the connected element is never replaced.

The form comparison servers (PHP, PHP extension, Go, Rust) appended their own
`_form_complete` submit button after the rendered form, which now rendered a second
submit button in its footer. The comparison spec, and the specs of the Go, Rust and
PHP generation tests, declare that button instead, the servers no longer append one,
and the generation checks require exactly one submit button in the document. The
first four-server candidate run of this change failed in the PHP generation test,
whose own spec did not yet declare the button. The second failed in the generation
check that compiles the published spec through a reference: it put the whole spec,
buttons included, in the referenced file, and composition takes only its fields, so
the referenced template got the default button. The frames compile through the
servers the same way, so their templates silently dropped the declared button too.
Both now keep the root declarations on the root and reference only the fields.

Validation passed: generator-core, HTML, React, Vue and Svelte passed 108, 116, 705,
348 and 349 tests, the Svelte client 10, the normalizer 6 and the Chromium style
checks 3. `make test-native` passed all 976 generator checks, with 361 PHP API checks
per configuration and 103 validation cases. The JSON schema passed 70 checks, the
TypeScript and PHP validators 1629 and 1461, the Rust validator 62, the Go validator
and the CLI 37. The PHP extension engine passed 22 tests, the cross-check console 117,
the form comparison source checks 140 and its Chromium checks 3, the Go and Rust
comparison server tests passed, and `make docs-check` passed. In Chrome the end row
stopped 0.2px from its line without a minimum height, and the space after the form was
a 200px margin outside it.

### 2026-09-13 — Show only form rows in the structure map

The structure map repeated every level twice: a collection line with its count
(for example "Stores 2") and then the row lines, each with its own guide line, and
it listed empty collections. It now follows one rule: one line per form row.
`buildOutline` returns `OutlineRow[]`, each row with the rows nested in it, so the
map nests exactly as the form does; `OutlineCollection` is removed. Collections,
counts and empty collections are not rows and stay in the form, and a nested row
body indents one step without guide lines. With `multiple.controls: outline`, row
controls still move to the selected row's map line, but an empty collection's Add
control is not a row control and now always stays in the collection footer in all
five implementations.

generator-core passed its typecheck and 104 tests; the HTML, React, Vue and Svelte
suites passed 116, 705, 348 and 349 with the regenerated structure map fixture;
form comparison source checks passed 140; and `make test-native` passed 976 generator
checks after the empty collection placement change in all five implementations. In
Chrome the map lists only rows with one indentation step per level. The four-server
candidate run for the previous change passed 1,452 checks per server
(5,808 browser checks) with no failure.

### 2026-09-13 — Align rows to their sticky line and follow the scroll with the current row

Sticky rows now follow rules derived from one value instead of computed offsets.
The row root carries `--crudui-sticky-depth` (moved from the header style in all
five implementations), and its sticky line is that depth times the header height.
The header pins on the line; the row's `scroll-margin-top` puts the header on the
line, so `alignRow` is `scrollIntoView({ block: 'start' })`; and the last row is at
least the viewport below its aligned top, so scrolling ends exactly when its header
reaches the line. An earlier draft of this change added one viewport of trailing
space, which let the page scroll past that point; it is not kept.

One rule decides the current row: the scroll position. `connectRows` marks rows
whose top reached their line (`data-crudui-stuck` on sticky rows) and the current
row, the last such row (`data-crudui-current`, with a highlighted border); the
selected row and the structure map follow it. Moving to a row after a row operation
or from the structure map scrolls it to its line. Focus no longer selects or scrolls,
and the bindings no longer restore scroll positions. A draft that also aligned the
row of a newly focused control, and restored captured scroll positions after
rendering, pulled the page back to the focused row when the user scrolled to the end
with an input focused elsewhere; both are removed. The comparison page controller
uses the same core functions.

`npm run test:forms` passed core 104, HTML 116, React 705, Vue 348, Svelte 349, ten
normalizer checks and nine node checks, including three Chromium checks: stacking at
exact header heights, the current row following the scroll with focus elsewhere, and
the end row stopping exactly at its line with no blank inside rows. Form comparison
source checks passed 140 and its Chromium checks 3. `make test-native` passed 976
generator checks after the depth moved to the row root in all five implementations.
`make docs-check` passed. In Chrome, with focus in the company name, wheel scrolling
reached the end without any backward jump, kept the focus, made 판교점 current and
stopped its top 0.2px from its aligned position.

### 2026-09-13 — Stack sticky row headers at their exact height

Sticky row headers (`multiple.header: sticky`) stack by offsetting each level by
`--crudui-node-header-height`, but a header's real height was its padding, content
and bottom border: 45px against a 44px offset in the reference preview, and more
when a long title or the controls wrapped. Each pinned level overlapped the one
above. A sticky header now has exactly that height, border included, never wraps,
and truncates a long title, so pinned levels meet without overlap. A stuck header
gets a solid background and a shadow, and its level label still shows only while
it is stuck. Stuck detection used an IntersectionObserver with thresholds 0 and 1,
which never fires for a row taller than the viewport, so the outermost pinned
level showed no label. `connectForm` now marks a header stuck when it has left its
natural place at the top of its row, measured on scroll and resize at most once
per animation frame. A Chromium check, `tests/form-styles.test.mjs`, runs in
`npm run test:forms` because jsdom has no layout. The form-structure preview declares sticky headers on all five
levels, which it did not before, so the sequential pinning was not visible there.

`npm run test:forms` passed core 104, HTML 116, React 705, Vue 348, Svelte 349, ten
normalizer checks and seven node checks, including the new Chromium check. That
check timed out waiting for the outermost stuck header before the detection change.
In Chrome the preview pinned all five levels in order with their labels and no
overlap.

### 2026-09-13 — Fix comparison checks that failed the four-server candidate run

The first candidate run of the initialization comparison failed 36 of 1,452 PHP
checks, and the other servers did not run. The empty-collection scenario step
excluded the Add button of a collection inside a row; that condition came from
the recursive node change. The bindForm controller focused the new row before
scrolling it, so the selection render restored the earlier scroll positions and
left the input outside the frame. It now scrolls first, like core. The createForm
checks asserted that the main page does not scroll, which contradicts the row
focus rule for a 1,450px frame; the checks now require the focused input to be
visible in both the frame viewport and the main page viewport. The local source
and Chromium suites do not run these checks; only candidate verification does.

The candidate run then passed: PHP, the PHP extension, Go and Rust each
passed 1,452 checks with no failure, 5,808 browser checks in total, and the command
returned status 0.

### 2026-09-13 — Compare the two initialization paths side by side

The form comparison page now puts the two initialization paths in two columns:
the left frame creates the form with its data, and the right frame mounts an
empty form and then injects the data. The API choice (bindForm or createForm)
moved to a selector, next to the server, framework and language selectors.
Both columns run the same stages with the same fixed row keys: mounting,
repeated injection, hiding and restoring data, editing, saving, reloading,
copying, moving, removing, adding, saving the new row, emptying, restoring,
and the structure map's expand all, collapse all and undo. The columns run
one after the other because both save to the same record, and each right
stage is compared with the stored left stage. Raw HTML, DOM, control state,
fields, computed CSS, submitted data, focus and save responses are compared
without normalization. The list at the top updates as each stage completes.
The frames load the grammar stylesheet, so computed CSS reflects the real
styles. The in-frame initialization check is removed.

The bindForm path now supports the same actions as createForm (toggle, select,
expand all, collapse all, undo) with the same view state, history and focus
rules. generator-core exports those rules as pure view-state and history
functions, which the form instance and the bindForm controller both use. Both
paths render the structure map and the data view in their frames. React, Vue
and Svelte provide stateless `OutlineView` and `DataPanel` (Vue: `outlineVNode`,
`dataVNode`), and the HTML renderer adds `renderOutlineView` and
`renderDataPanel`. A shared fixture, `tests/fixtures/form-outline/cases.json`,
holds the React markup for four languages, top-level and nested selection,
`controls: outline` and data escaping, and all four renderers reproduce it. The
feature contract manifest records the view-state and history functions and the
new fixture.

`make test-native` passed 976 generator checks (195 per implementation), 361
PHP API checks per configuration and 100 validation cases in each PHP
implementation. `npm run test:forms` passed core 104, HTML 116, React 705, Vue
348, Svelte 349 and ten normalizer checks. The structure map fixture passed four
cases in each of the four renderers. Form comparison source checks passed 140
and the Chromium checks passed 3. `make docs-check` passed after documenting the
`UndoResult` type, a type-only change made after the native run. The full
candidate run with the four servers had not run when this change was committed.

### 2026-09-13 — Move focus to the affected row after row operations

Row operations previously kept the active control, its text selection and the
scroll positions, and a pointer press on a row button was prevented from moving
focus. The runtime now follows the focus rule of the reference form: adding or
copying focuses the new row, moving focuses the moved row, and removing focuses
the previous row, then the next row, then the enclosing row, then the collection's
Add button. Focus goes to the row's first enabled visible input, or to its toggle
or Add button, and the row scrolls only as far as needed. Toggling, selecting and
undoing keep the focused control, including a focused action button. Pointer and
keyboard activation behave the same. `runAction` returns `{ focus }` for the row
that receives focus, or `undefined` when the target is incomplete.

generator-core passed its typecheck and 102 tests. `npm run test:forms` passed
HTML 112, React 701, Vue 344, Svelte 345 and ten normalizer checks, with the shared
DOM scenario asserting the focused row after add, remove, copy, move, toggle and
removal of the last row. jsdom does not implement scrolling, so the tests stub
`scrollIntoView`. In Chrome, the form-structure preview focused the new row after
an add and the previous row after a removal. Instrumenting the calls showed the
row scrolls before focus, which prevents scrolling elements that a synchronous
re-render replaces. The automation tab did not scroll the window, so actual
viewport placement was not measured there. The comparison page focus checks move
to the same rule in the next change.

### 2026-09-13 — Render forms as recursive nodes with row cards

Every form renderer (HTML, React, Vue, Svelte, PHP, Go, Rust and the C PHP
extension) now produces one recursive node grammar instead of per-shape wrappers.
Each field, group, collection, row, language field and language item is a
`crudui-node` with `__header`, `__body` and `__footer` slots. Kinds are modifiers
(`crudui-node--row`), and behavior reads only `data-field-path`,
`data-crudui-row-key`, `data-lang`, `data-crudui-action`, `hidden` and ARIA
attributes. `bindForm` returns `NodeVM[]` with the same JSON model in every
implementation. The [form markup](docs/spec/form-markup.md) specification defines
the grammar and records the reference-form behavior that was not adopted.

- **Row cards:** rows show a hierarchical number, an optional title from
  `multiple.title`, and a count or nested-row summary. Move, add, copy and remove
  controls come in a fixed order, with disabled states computed from `min`, `max`
  and position in every renderer; the browser no longer adjusts them after
  rendering. `multiple.controls` (`header`, `footer`, `outline`) and
  `multiple.header` (`static`, `sticky`) are declared in the JSON schema, the four
  validators and the CLI.
- **Messages:** control labels, counts and summaries come from one ko/en/ja/zh
  table shared by all implementations.
- **Runtime:** form instances keep collapsed rows, the selected row and an undo
  history (100 entries, consecutive edits of one path merged) outside the record
  data. `buildOutline`, `connectOutline`, `resolveAction` and `runAction` are
  exported. React, Vue and Svelte provide `Outline` and `DataView`, and the HTML
  renderer provides `renderOutline` and `renderData`.
- **Styles:** `@crudui/generator-core/styles.css` holds the grammar styles.
- **Input rules** in all five implementations: `lang` must be a boolean or an
  object and `lang.only` a list of language-code strings or an object, at
  compilation. Binding rejects, in order, a non-string language, a non-string
  `keyPrefix` or `idPrefix`, an `unsupported` other than `throw` or `marker`, and
  an unsupported language. Previously TypeScript crashed on `lang: null`, the C
  extension read past its default language list for non-string `only` entries,
  and TypeScript treated any `unsupported` string other than `throw` as marker
  mode while PHP threw.
- **API changes:** Go `BindOptions.Language`, `IDPrefix`, `KeyPrefix` and
  `Unsupported` are `any`, `KeyPrefixProvided` is removed, and an empty `IDPrefix`
  is used as given. Rust `BindOptions` string options are JSON values.

`examples/form-structure` is a local preview of a five-level reference form.
The form comparison page, the shared DOM scenario and the cross-check console
now select by attributes.

`make test-native` passed 976 generator checks (195 per implementation plus the
unchanged-input check), 361 PHP API checks per configuration and 100 validation
cases in each PHP implementation, after reinstalling the copied PHP validator. `npm run test:forms` passed core 101, HTML 112, React 701, Vue 344,
Svelte 345 and ten normalizer checks. Form comparison source checks passed 137,
the cross-check console passed 117 after rebuilding the Go and Rust validator
binaries, and `make docs-check` passed.

### 2026-09-13 — Remove check directories after passing runs

`tests/native-generators/run.mjs` created a `crudui-native-generators-*` build
directory on every run and never removed it. `scripts/check-packages.mjs` left a
145 MB `crudui-install-*` project after every run. Repeated runs helped fill the
disk. A passing run now removes its directory. A failing run keeps it, prints its
path, and records it in the report (`buildDirectory`) or with `failure.log`. The
other test files already removed their temporary directories.

`make test-native` passed 886 checks and left no build directory.
`npm run test:packages` passed and left no install project. `make docs-check`
passed.

### 2026-09-13 — Reject wrong multiple and design value types at compilation

Form compilation in TypeScript, PHP, Go, Rust and the C PHP extension previously
ignored a wrong value type in `multiple` and `design`: row settings with the wrong
type were dropped, and an invalid design became an empty design. Compilation now
rejects them with `INVALID_FORM_INPUT` and `Invalid {key} at {path}: expected
{expected}`, where `{path}` is the field's structural path. `multiple` must be a
boolean or an object, with numeric `min` and `max` and boolean `copy` and
`sortable`. `design` must be a boolean or an object. Its `show` must be an
expression, a boolean or a condition map. Its `class` and `style` and those of the
`label`, `wrapper`, `group` and `prepend` nodes must be strings or condition maps,
and the nodes must be objects. A condition map is a non-empty object, as the JSON
schema requires. Unknown keys in these buckets are not checked. The schema
specification documents the rules.

The C template builds messages with a local helper because its engine tests link
only the value, error and composition modules. The native suite adds eight
compile rejections compared as complete records.

`make test-native` passed 886 generator checks (177 per implementation), 361 PHP
API checks per configuration and 100 validation cases in each PHP implementation.
generator-core passed its typecheck and 89 tests; `npm run test:forms` and
`make docs-check` passed.

### 2026-09-13 — Reject generator data with the wrong shape at its full path

`bindForm` and editable instances in TypeScript, PHP, Go, Rust and the C PHP
extension now apply the validators' data shape rules. Root data that is not an
object fails with `Form data must be an object`. A present group value or
repeated group row that is not an object fails with `Group data must be an
object: {path}`. A present repeated value that is not a keyed object fails with
`Repeated data must be a keyed object: {path}`. `{path}` is the full data path,
including row keys; instances previously reported only the field name, and
`bindForm` did not check group data. `addRow` checks a supplied group row value
at `{collection}.{key}`. The form runtime specification documents the rules and
check order. The form comparison controller's copy of instance normalization
uses the same messages and has a test for them.

The native suite checks eight data shapes through both `bindForm` and instances,
and the rejected-operation scenario adds nested `setValue` and `addRow` cases.

`make test-native` passed 846 generator checks (169 per implementation), 361 PHP
API checks per configuration and 100 validation cases in each PHP implementation.
generator-core passed its typecheck and 88 tests, the form comparison controller
passed 5 tests, and `npm run test:forms` and `make docs-check` passed.

### 2026-09-13 — Compare generator error messages across implementations

The native generator suite compared only error code and location, and its README
allowed messages to differ by language. That contradicts the requirement that all
implementations behave identically, so the rule now requires matching code,
message and location. Rejected form inputs are compared as complete records
against JavaScript.

The stricter comparison found 12 existing differences, now fixed:

- The PHP, Go and Rust generator CLIs reported non-object `data` as `Data must be
  an object`, `Group data must be an object` and `data must be an object`. All now
  report `Form data must be an object`.
- Go and Rust worded unsupported field types differently. Both now report
  `Unsupported field type "{type}" at "{path}"`.
- Go named `SequenceRowKey` in the invalid row key message; it now names
  `sequenceRowKey` like the other implementations.

`make test-native` passed 786 generator checks, 361 PHP API checks per
configuration and 100 validation cases in each PHP implementation.

### 2026-09-13 — Report validator load and input failures identically

The TypeScript, PHP, C PHP extension, Go and Rust validators reject submitted
data with the wrong shape as an input failure instead of skipping it or
converting it. Root data must be an object (`Form data must be an object`),
checked before composition. A present group value or repeated group row must be
an object (`Group data must be an object: {path}`). A present repeated value must
be a keyed object (`Repeated data must be a keyed object: {path}`). Each language
has `FormInputError` with code `INVALID_FORM_INPUT` and an empty location; Rust
returns `ValidateError::Load` or `ValidateError::Input`. Keyed rows are traversed
in sorted key order everywhere.

All four validator CLIs now share one process contract. A result exits 0 with
`{valid, errors}`, a load or input failure exits 2 with exactly
`{error, code, at}`, and a malformed request exits 1 with `{error}`. Before this
change, TypeScript and Go exited 1 without `at`, and PHP exited 0 with a
`rule: "compose"` error. Validation fixtures replace `expectLoadError: {code}`
with `expectFailure: {code, message, at}` and add six input-failure cases. Former
array-row cases use keyed rows. The fixture generator now contains the seven
end-date cases that had been added only to `cases.json`, so they are
no longer dropped on regeneration. The cross-check console compares the complete
`failure` record. The comparison and example servers answer an input failure with
HTTP 400.

Comparing complete records exposed a Go-only divergence. Go list validation
prefixed forbidden-key locations with `list.`, and a Go test pinned that
prefix. The shared list fixture and the other implementations use
`columns.<name>`, so Go now does too.

The C extension's allocation-failure fixture uses keyed rows, which need 4 and 3
allocations. Engine fixtures now emit only the C helpers they call. Before
testing, the ignored Go and Rust CLI binaries used by the console were rebuilt,
and generator-php's copied validator was reinstalled; all three predated the
source changes.

TypeScript validator 1618, PHP validator 1458, `go test ./...`, `cargo test` and
cross-check console 117 tests passed. `make test-native` passed 786 generator
checks, 361 PHP API checks per configuration and 100 validation cases in each PHP
implementation. `make docs-check` passed.

### 2026-09-13 — Bind repeated rows from keyed objects only

`bindForm` in TypeScript, PHP, Go, Rust and the C PHP extension creates repeated
rows only from keyed objects. Missing collection data creates one row keyed
`__0000000000000__`. An array, null or scalar collection fails with
`INVALID_FORM_INPUT` and the message `Repeated data must be a keyed object:
{path}`. Field paths no longer carry `#N` array-position segments, so the
position helpers were removed from all five implementations. Go's unused
`rowPosition` function was removed. The shared form fixture uses keyed data, and
the HTML conformance suite now includes the former array cases.

`npm run test:forms` passed (core 88, HTML 112, React 701, Vue 344, Svelte 345,
normalizer 10). `make test-native` passed 786 generator checks, including new
checks that require identical rejection code, message and path in all five
implementations. `make docs-check` passed.

### 2026-09-13 — Align repeated-row declarations across schema, validators and CLI

`multiple.min` is declared in the TypeScript, Go and Rust specification models,
accepted by the PHP `multiple` bucket and reported by `crudui explain` and
`crudui describe`. The PHP bucket previously rejected `min`, although the JSON
schema and form runtime define it. `multiple.copy` is a boolean in the JSON
schema; the object form had no runtime meaning. Model comments describe keyed
row identity instead of hidden identifiers and array order.

Schema checks (58 cases), TypeScript validator tests (1606), PHP validator
tests (1446), Go and Rust validator tests, CLI tests (37) and `make docs-check`
passed.

### 2026-09-13 — Add framework-independent HTML rendering and executable feature contracts

`@crudui/generator-html` renders current form and list view models as HTML
fragments without framework dependencies. It supports table and card lists,
current field shapes, widget layouts, escaping rules and raw display content;
browser event binding remains in `@crudui/generator-core`.

`contracts/features.json` now records package exports, feature contracts,
fixtures, test files, support status and verification commands. The manifest
schema and path checker reject missing links. `manifest:test` executes the
declared verification commands, and feature contract pages are generated from
the manifest. CI runs the manifest checks and commands before form tests.

The HTML renderer passed 110 package tests, including 87 form conformance cases
and 20 list conformance cases. Public package exports, declarations, install
builds, API documentation and `make docs-check` passed. The package is not
deployed.

### 2026-09-12 — Publish static documentation through GitHub Pages

The documentation build supports `DOCS_BASE_PATH` and generates explicit static
HTML links for English, Korean and API documents. Development, preview and 404
pages use the same URL prefix. CI checks documentation,
then deploys the generated documentation web to `https://polyspec.github.io/crudui/` from
`main`.

`make docs-check` and `make docs-verify-idempotent` passed with
`DOCS_BASE_PATH=/crudui/`. Browser checks passed for desktop and mobile layouts,
Korean navigation, stylesheets and nested 404 pages.

### 2026-09-11 — Name the comparison deployment command explicitly

The local comparison deployment entry point is now named
`examples/form-comparison/comparison-deployment.mjs`. Verification procedures,
examples and tests use the explicit comparison deployment name.

### 2026-09-11 — Make native C fixtures compile with Linux toolchains

`packages/php-ext/tests/engine.test.mjs` now links `libm` when compiling native
fixtures and emits cleanup statements separately from guard clauses. The C
engine fixtures compile with the warning-as-error settings used by the PHP 8.4
and 8.5 CI jobs.

### 2026-09-11 — Build JavaScript prerequisites before native tests

`make test-native` now builds the workspace JavaScript packages before running
the C extension engine tests. The native test target provides the built React
generator package required by the engine rendering fixtures in a clean checkout.

### 2026-09-11 — Complete the independent C PHP extension

The PHP extension now implements its form and validation engine in C. The
engine owns ordered values and performs composition, expression evaluation,
template compilation, data binding, form and list rendering, validation, row
operations and PHP value conversion inside the extension process. The package
no longer contains a Cargo manifest, Cargo lock file or Rust source. The direct
builder compiles the complete C source set, and the form-comparison extension
stage no longer copies a Rust toolchain. The comparison generator check hashes
the root package lock file used by the candidate source archive.

The C engine checks passed 29 of 30 tests on macOS, with the Linux-only address
sanitizer test skipped. The module build and load succeeded; PHP API checks
passed 352 cases in each of three configurations and validation passed 94 cases
in each implementation. `make test-native` passed with 766/766 generator
checks, 19 protocol checks, all PHP, Go and Rust package checks, and the widget
and timezone checks. `npm run test:form-comparison` passed 136 source, 10
library and 3 browser-job checks. `make docs-check` passed. The extension and
comparison service are not deployed.

### 2026-09-11 — Render form fields in C

The C extension renders evaluated form fields as server HTML. The renderer
supports leaf, group, repeated and language field structures and all current
widget layouts. It preserves control attribute order, opaque event attributes,
raw display content and script and style elements. Text, attributes, URL values
and final CSS properties use the current rendering rules. Rendering does not
change the evaluated field models.

Focused C checks matched exact HTML for all 90 successful shared form fixtures
and two additional escaping and CSS cases. The same cases passed with strict C11
compiler warnings and undefined-behavior instrumentation. These changes are not
deployed.

### 2026-09-11 — Bind form fields in C

The C extension binds compiled templates to record data without changing either
input. Binding resolves presentation rules, translated content, repeated rows,
language fields, checkbox state and widget models. Explicit empty arrays and
objects produce zero repeated rows, while an omitted repeated value produces one
initial row. Unsupported field types return `UNSUPPORTED_FIELD_TYPE` unless the
caller selects the explicit marker result.

The widget implementation generates complete button and editor scripts and keeps
ordered model members. Focused C checks matched the complete ordered field models
for all 91 compilable shared form fixtures, confirmed input immutability and
completed the same cases with undefined-behavior instrumentation. These changes
are not deployed.

### 2026-09-11 — Evaluate form expressions in C

The C extension resolves object and array paths and evaluates literals, relative
paths, wildcards, comparisons, membership, boolean operations and ternary
expressions. Condition maps select the first matching declaration and use an
explicit `true` entry as the default. The implementation uses standard C11.

The focused C check passed all 38 shared expression specifications and their 77
evaluation cases with strict compiler warnings. The cases cover expression
values and boolean results. These changes are not deployed.

### 2026-09-11 — Compile form templates in C

The C extension composes explicit in-memory files, applies ordered references and
patches, detects reference cycles and returns composition error codes and traces.
Form compilation produces data-independent templates containing the template
kind, optional key prefix and recursively compiled fields. Field specifications
do not retain nested `properties`.

Focused C checks passed all 20 shared composition cases and compiled all 92 shared
form fixtures with the same ordered templates or errors as the JavaScript
implementation. The C sources compile with strict C11 warnings. These changes are
not deployed.

### 2026-09-11 — Add the C extension value model

The C extension engine stores nulls, booleans, integers, finite numbers, UTF-8
strings, arrays and ordered objects without PHP or Rust data structures. Values
own their strings, object keys and children. Copy, replacement and removal keep
object declaration order and produce independent values. Invalid UTF-8 and
nonfinite numbers are rejected.

The focused C test verifies ordering, replacement, deep copies, arrays, UTF-8 and
numeric equality. It passed with strict C11 compiler warnings and undefined
behavior checks. The macOS memory inspector reported zero leaks. The independent
C extension source check excludes declared build output and continues to reject
Rust source and Cargo files in the package. These changes are not deployed.

### 2026-09-11 — Use the Node.js 24 artifact action

Native PHP 8.4 and 8.5 CI jobs upload their comparison reports with
`actions/upload-artifact@v7`. This action declares the Node.js 24 runtime. The
previous action declared Node.js 20, so GitHub-hosted runners replaced its runtime
and reported a deprecation warning. Report names, paths, hidden-file inclusion and
missing-file failure behavior remain unchanged.

The CI configuration regression suite requires the current artifact action and
passed all four checks. These changes are not deployed.

### 2026-09-11 — Enforce npm 12 and sandboxed Chrome CI

The npm dependency policy permits a URL dependency only when the root manifest
declares it directly and pins it to an immutable source revision. Dependency
verification rejects URL dependencies introduced by another dependency. Package
install verification reads the current npm 12 `pack --json` report and requires
exactly one report for the requested package and archive.

Linux browser CI uses the regular Chrome file at `/opt/google/chrome/chrome` and
disables Puppeteer's browser download. The preflight rejects symbolic links in the
browser path, launches Chrome without sandbox-disabling arguments and requires
`chrome://sandbox` to confirm the active first-layer, PID, network and Seccomp-BPF
sandboxes. Both browser CI jobs complete this preflight before starting tests.

A GitHub Actions run completed all 20 jobs successfully.
The run includes package install, public export and type, repeated build, browser
inspector and CSS, form-comparison regression, documentation coverage and PHP 8.4
and 8.5 native generation and PHP API checks. No job failed or was cancelled.
These changes are not deployed.

### 2026-09-11 — Verify clean CI installations

Repository-root form-comparison and cross-check commands declare their direct
JavaScript dependencies in the root manifest. Form comparison uses the root npm
graph, and the cross-check renderer resolves Vite and the Svelte plugin by package
name. Package install verification packs each package from its own directory and
requires one archive result.

The form-comparison CI job installs PHP 8.5 and the validator and generator
Composer graphs before running the complete suite. Native PHP matrix jobs pass
the regular versioned `php-config` path for the selected PHP release. Artifact
upload runs only after native verification creates the report.

A clean source archive passed 136 form-comparison source checks, ten generator
construction checks and three Chromium browser checks. Package install export,
type, production build and three-framework browser verification passed. Public
package checks passed nine cases, repeated builds passed one case, and the form
inspector passed 18 unit and six browser CSS checks. Cross-check rendering passed
33 cases. These changes are not deployed.

### 2026-09-11 — Preserve Svelte editable controls

The Svelte generator renders ordinary input and textarea controls as stable DOM
elements. Session value updates retain each element, focus and text selection.
Controls with string `on*` behavior attributes and controls that require exact
specialized HTML remain on the raw serialization path.

The browser connection formats date and datetime values from the current form
instance before updating live controls. Initial data and later injection use the
same value conversion.

Regression checks cover text, email, number, password, textarea, date and datetime
controls. The Svelte SSR and HTML comparison suite passed 345 checks, the mounted
browser suite passed ten checks, the generator core passed 86 checks and
`svelte-check` reported zero errors and warnings. This change is not deployed.

The complete `make test-native` command returned status 0. The run passed 11
extension build checks, 160 PHP generator tests, all Go package tests, 20 Rust
generator tests, 352 PHP API checks in each of three configurations, 94 validation
cases in each PHP implementation, 19 protocol checks, the 766/766 generator report
and five Chromium widget and timezone checks. The generator report SHA-256 is
`16ab371b3691429ca4e2c1a3eaa3c35fb7209861abd5759f16efea6c1a19aa5d`.

### 2026-09-11 — Verify explicit browser and PHP inputs

The Chromium widget check disables Vite dependency discovery and optimizes only
the five declared React and CRUDUI packages. It fails on page exceptions, HTTP
error responses, failed requests and `console.error` messages during every test
phase. The five widget and timezone checks passed.

The PHP form server reads the `crudui/validator` installation directory from
the selected generator vendor's `composer/installed.php`. Other registered
Composer installations do not affect package selection. The directory must be
inside the selected vendor directory. Every path component and loaded class file
must be regular, and the installed validator file must match the candidate source
file. A missing or malformed selected record, an external path or a changed
package copy fails construction.
The startup health check accepts `Generator` and `Form` only from the generator
source directory and `Validator` only from the selected Composer package copy.
It rejects the repository validator source path. A rejected health response
reports the server and the first response field that failed verification.

The PHP source and construction suite passed ten checks. Five hundred verified
constructions completed within the 250 millisecond limit. The PHP and PHP
extension integration check passed 125 generation checks in each mode together
with JSON conversion, storage, validation, public signature and processor-mode
checks. The form comparison build command passed 131 source checks and ten
construction checks.

Candidate source tests create writable fixtures under the canonical operating
system temporary directory. Every temporary path component must be a regular
directory and must not be a symbolic link. Candidate tests do not require Git
metadata or write under the extracted source directory. The candidate fixture
location regression check and all ten PHP construction checks passed.

### 2026-09-11 — Build PHP extensions directly

One PHP extension builder compiles and loads the CRUDUI and OrderedJSON
modules. Separate entry points declare each module's sources, outputs, platform
libraries and load checks. Candidate images use both entry points and do not run
`phpize`, Autoconf or libtool.

The builder resolves regular `php-config`, C compiler, Cargo and rustc files
before compilation. It rejects relative paths, symbolic links, missing or
ambiguous tools and mismatched PHP installations. Rustup identifies the regular
Cargo and rustc files in one selected toolchain. Cargo receives the regular
rustc and linker paths explicitly. Generated path cleanup validates every
declared target before removal and does not follow symbolic links.

The direct builds loaded both modules on PHP 8.5.10. The combined process called
both modules successfully. The PHP API check passed 352 checks in each of three
configurations and 94 validation cases in each implementation. Six builder and
entry-point regression checks passed.

### 2026-09-11 — Use explicit browser completion signals

The form-comparison runner subscribes to the main-page and frame readiness
messages before navigation. The interaction and typing verifiers reserve each UI
operation before activation and await that operation's completion. React and
Svelte complete synchronous updates with `flushSync`; Vue publishes `nextTick`
completion. The verifiers read DOM results only after renderer completion. They
do not use periodic DOM reads, network-idle inference or fixed rendering delays.

The documentation development server registers its recursive file-system
subscription before the initial build. It excludes generated `docs/.web/`
events, serializes rebuilds and combines source events received during one build
into one additional build. A build failure is reported and the next source event
can request another build. A file-system subscription failure closes the server
with status 1.

The candidate verification procedure runs one commit-specific lifecycle command.
The command prepares and builds the candidate, subscribes to its readiness file
before startup, runs the HTTP and browser checks sequentially and retains only
verified deployment evidence. The procedure does not use a sleep interval or a
readiness retry loop.

The form-comparison source suite passed 129 checks, the generator construction
performance suite passed four checks and the browser job suite passed one check.
The documentation suite passed 15 checks. A development-server check returned
HTTP status 200, rebuilt once for one source event and returned status 0 after
`SIGINT`.

### 2026-09-11 — Resolve the native Cargo command path

The `test-native` target supplies its expanded `PATH` when it starts Cargo. GNU
Make 3.81 now resolves Cargo from the directory added by the Makefile when that
directory is absent from Make's startup environment. A regression check runs the
target with simulated commands and places Cargo only in the added directory.

The regression check and all eight runtime policy checks passed. The complete
`make test-native` command returned status 0 with PHP 8.5.10 and passed 160 PHP
tests, all Go package tests, 20 Rust tests, 19 protocol checks, the 766/766
generator report and three Chromium widget and timezone checks.

### 2026-09-11 — Verify local comparison deployment

The repository verifies candidate metadata, generation, persistence, browser
reports, the exact local image tag and image digest before generating the local
comparison Compose file. Deployment preserves existing data without overwriting
different files. HTTPS verification uses the explicit containerctl certificate
authority and checks the source commit, route, certificate, data mount, stored
files and response bytes. A second identical application must leave every checked
value unchanged.

Successful deployment removes candidate containers, candidate directories, raw
reports, screenshots, previous deployment results and local comparison images
that the deployed service does not use. Eleven deployment cleanup checks and all
96 form-comparison source checks passed.

The checks include failed and stale evidence, exact report totals, deterministic
Compose output, data preservation, certificate authority loading, identical
reapplication changes and cleanup path boundaries. Deployment has not been
performed for this change.

### 2026-09-10 — Declare native test dependencies

Repository-root build and test entry points declare every directly imported
third-party package in the root manifest. The dependency check reads the Node.js
entry points executed by `make test-native` and rejects undeclared imports. The
widget script check resolves Vite 8.2.2 from the root dependency instead of a
transitive installation.

All six dependency checks passed. The complete `make test-native` command returned
status 0 with PHP 8.5.10 and passed 160 PHP tests, all Go package tests, 20 Rust
tests, 19 protocol checks, the 766/766 generator report and three Chromium widget
and timezone checks.

### 2026-09-10 — Enforce dependency install-script approvals

Each independently installed npm graph records exact-version approvals for all
dependency lifecycle scripts. Workspace packages use the root lock file. Clean
installs in CI and container builds use `--strict-allow-scripts` and fail before
installation when an approval is missing.

The dependency checks passed five of five tests across every tracked lock file.
The three browser examples built successfully, the parity suite passed seven
of seven tests, the runtime policy and package-build suites passed seven of seven
tests each, and the complete documentation check passed.

### 2026-09-10 — Current candidate verification

The cross-framework lock files resolve the current package
releases allowed by their manifests. Clean `npm ci` and `npm audit` runs reported
zero vulnerabilities. The cross-framework comparison passed 14 of 14 checks.

The candidate built image
`localhost/crudui-form-comparison:<commit>` with index digest
`sha256:7842bd0a40f1e51d4c975008a9b5bdaf6d148e9faba05e68faf3a935b02fe2c7`.
Image construction passed 81 source checks and four library checks. Runtime
verification passed both PHP modes, 290 generation and SSR checks across 411 HTTP
requests, 120 persistence and validation checks, and three Ordered JSON checks.

Browser verification passed 312 checks for each server and 1,248 checks in total.
PHP completed in 213,288 milliseconds, the PHP extension in 206,475 milliseconds,
Go in 200,691 milliseconds and Rust in 200,500 milliseconds. The aggregate records
`complete: true`, `passed: true`, `failedChecks: 0` and
`performancePassed: true`. Packages and the comparison service were not deployed.

### 2026-09-10 — Complete public TypeScript API types

Package entry points export every named type referenced by their public
TypeScript declarations. Form and list validation use one public file-set type.
TypeDoc validation warnings now fail API generation and documentation coverage.
Two unexported-type regression checks, six public declaration checks and the
isolated five-package install check passed.

### 2026-09-10 — Selected runtime channels

`.node-version`, CI and Node.js container stages select Node.js 26 as the next
LTS release line without fixing a patch release. `.go-version`, CI and Go
container stages select the Go 1.27 stable release line. Rust CI and container
stages select the stable Rust channel. CI installs the current stable npm
release. All six runtime policy checks passed. Package lock files continue to
record resolved package versions.

### 2026-09-10 — Four-server candidate verification

The candidate image verifies one committed source archive before extraction and
runs the complete source suite as the unprivileged user before starting PHP, the
PHP extension, Go and Rust servers. Image construction passed 81 source checks
and four library checks. Runtime verification passed the Chromium process check,
290 generation and SSR checks across 411 HTTP requests, 120 persistence checks
and all PHP processor-mode and Ordered JSON checks.

The browser aggregate passed 960 scenario checks, 240 interaction checks, 24
mount-before-load checks and 24 static-document checks. Every server completed
below the 900,000 millisecond limit. The aggregate recorded zero failures and
`passed: true`. Packages and the comparison service were not deployed.

### 2026-09-09 — CI package and documentation checks

The documentation CI job installs both PHP package dependency graphs before
running `make docs-check`. A package and browser job packs the five JavaScript
packages into an isolated install project, verifies public exports, declarations and
styles, compares repeated build outputs, and runs the form inspector unit and
Chromium CSS checks.

The package install, public build, reproducible build and form inspector checks
passed locally. Native PHP output through the three framework browsers remains a
separate comparison-environment verification and was not established by this CI
change. No remote CI run or deployment was performed.

### 2026-09-09 — Current and retained comparison documentation

The feature status now separates implemented native packages from the pending
four-server integration. The verification procedure requires an explicit library
path and commit, distinguishes the current PHP, PHP extension, Go and Rust targets
from retained comparison modes, and documents the two native modules, generation
checks and SSR routes. Browser use of serialized server-compiled templates is
implemented; seven focused unit tests, the complete Go server package, four Rust
server tests and 12 React, Vue and Svelte frame production builds passed locally.
The candidate image's complete four-server HTTP, browser and storage verification
remains pending and not deployed. The retained running image was not replaced.

### 2026-09-09 — OrderedJSON implementation submodules

The processor checker uses the pinned OrderedJSON common repository and all five
implementation submodules. It uses the current registry API, PHP namespace and
extension name, and rejects changed sources, malformed output and incomplete
results. Reports record source, fixture and module hashes.

The official processor checks passed 575 cases; the CRUDUI checks passed all
50 cases. Five checker unit tests passed and two invalid source inputs were
rejected. These results verify JSON processing, not browser or storage integration.

### 2026-09-09 — Native form generators and common PHP APIs

PHP, Go and Rust provide form compilation, data binding, editable instances,
form and list HTML, CLI adapters and HTTP examples. The CRUDUI PHP extension
registers the same Generator, Form and Validator classes as the PHP packages.
Its C binding converts PHP values directly to statically linked Rust engines.
The implementations share ordered value conversion, UTC date rendering, CSS
declaration handling and widget control contracts.

The shared suite passed 153 checks for each of five implementations and one
input-hash check: 766 passed, zero failed. PHP API checks passed 352 cases in each
of three process configurations; PHP and native validation passed 94 cases each.
Form package tests, package install checks and documentation checks passed.

The full `make test-native` command passed in a new non-root Linux arm64 image
built from the current source snapshot. It rebuilt and loaded the extension, ran
the PHP, Go and Rust package tests, repeated the PHP API and validation checks,
passed all 19 protocol checks and all three Chromium widget and timezone checks,
and produced another complete 766/766 generator report. The image index digest is
`sha256:0612f157880aa4bd9ff05a64dc6044969d0736117164cafec466e45d53c64c02`;
the report SHA-256 is
`3f8a91ccbbdaf72c116f2749aa4b6f5cee0975567f6edcbe1372e602cdcf7442`
and the run-log SHA-256 is
`378f4e3a63a88823b3a15b88859237332c27d36f43ee89bd62f9ad03cd38b0b1`.
This establishes native package verification, not the separate four-server
comparison integration. No package publication or comparison deployment was
performed.

### 2026-09-09 — Validator CLI responses

The comparison console checks process exit status, JSON response types, all
five error fields and consistency between validity and errors. It preserves
returned values instead of filling missing fields or coercing invalid types.
Specification load failures must match the CLI's documented response and exit
status. Process failures and malformed responses fail comparison.

Eight initial regressions failed before the fix. All 116 console tests passed,
including 35 response checks and execution of the four language CLIs.
`make docs-check` passed. These are local checks; no deployment was performed.

### 2026-09-09 — Runtime package contracts

The runtime contract defines form generation, SSR and validation requirements
for JavaScript, PHP, Go, Rust and the PHP extension. The PHP API contract specifies
common `CRUDUI\Generator`, `CRUDUI\Validator` and `CRUDUI\Form` classes,
extension registration before Composer class loading, and matching methods.
The implementation proposal maps packages, source coverage and required checks.
Feature status distinguishes these requirements from implemented packages.

The comparison documentation identifies native JSON parsing separately from
native CRUDUI generation and validation. `make docs-check` passed.

### 2026-09-09 — Legacy translation identifiers

Internal translation variables describe the translated field or schema value.
The naming contract covers file names, public APIs and internal identifiers.
The validator package build, all 1,606 validator tests and `make docs-check` passed.

### 2026-09-09 — CLI dependency build

CLI CI builds the validator package before running tests. Local instructions
include the same prerequisite, and documentation checks include the CLI README
and its Korean translation.

Removing validator output reproduced the missing-package failure. Rebuilding it
passed all 37 CLI tests, the four documented commands and two failure exit-code
checks. `make docs-check` passed.

### 2026-09-09 — Dependency update procedure

Scheduled dependency update pull requests are disabled. Dependency updates are
prepared locally and include the applicable package and documentation checks.
`make docs-check` passed.

### 2026-09-09 — Comparison environment verification

All four HTTP targets passed 120 current browser scenarios and 30 current
interaction checks each, with no page errors. The image installs locked PHP dependencies and passed 240 HTTP checks and PHP
processor-mode checks. The external Compose environment serves local HTTPS
through `containerctl`; repeated `up` calls passed eight state and response
comparisons. English and Korean procedures describe the environment lifecycle.

### 2026-09-09 — Dependency installation and generated outputs

PHP CI jobs install dependencies from `composer.lock`. The PHP `vendor/`
directory and the compiled Go CLI executable are excluded from Git. Package CI
jobs build all required form packages, and the legacy comparison job runs its
regression checks. CI comments and step labels describe the commands actually run.

A clean Composer installation reproduced all 26 dependency versions and source
references. PHP passed 1,418 tests; four-language legacy comparison passed 1,074
cases; the cross-check console passed 81 tests. Documentation checks passed.

### 2026-09-09 — Public API descriptions

Public form and list API comments describe the current operations and error
results. The runtime contract uses form-instance terminology; legacy validator
examples import the explicit legacy entry. Removed an unused Vue type import and a reference to a nonexistent
options type. The five edited files produce identical executable JavaScript.
Package exports, strict install types, production rendering and repeat-build
checks passed.

### 2026-09-09 — End-date field references

TypeScript, PHP and Rust preserve `enddate` field-reference parameters, matching
Go. Dotted start-date paths no longer become boolean conditions that skip date
comparison. TypeScript and PHP use the common resolver for relative references.
The earlier-end-date regressions failed before the fixes. Seven shared cases
verify absolute, sibling and parent references and dates before, equal to and
after the referenced date. TypeScript
passed 1,606 tests, PHP passed 1,418 tests, and Go and Rust package suites passed.

The current rule contract is maintained in English and Korean under `docs/spec/`.
It replaces the mixed current/legacy rule document and separates registration,
parameter evaluation and verification evidence.

### 2026-09-09 — Legacy comparison correctness

The comparison runner loads the explicit JavaScript legacy entry and rebuilds
selected Go and Rust legacy executables. It rejects process failures, unreadable
suites and results that differ from fixture expectations. Source-loading and
developer-home fallbacks are removed. Two failure regressions failed before the
fix and passed afterward. All four implementations passed 1,074 legacy cases.
Default test commands include the runner regressions. English and Korean testing
instructions distinguish current conformance from legacy comparison.

### 2026-09-09 — Test fixture contract

The English and Korean fixture contract distinguishes current validation,
composition, expressions, rendering and legacy cases. It documents complete
validation results separately from load failures and removes outdated counts
from the format specification. The current and legacy TypeScript conformance
checks passed 1,124 cases. Documentation checks and the strict web build passed.

### 2026-09-09 — CLI composition failures and documentation

`check` reports unresolved composition instead of checking uncomposed input as a
substitute. The missing-reference regression failed before the fix and passed
afterward; all 37 CLI tests passed. The English and Korean CLI guide describes
the four registered commands. Package descriptions no longer list unimplemented
commands, and the unimplemented MCP proposal is removed.

### 2026-09-09 — Schema documentation consolidation

Current schema and expression contracts use their existing authoritative documents.
A separate English and Korean legacy schema describes the explicit legacy field
model. The duplicate root schema and condition-parser documents are removed;
references use the appropriate current or legacy contract. The legacy example
passed valid-input and custom required-message checks.

### 2026-09-09 — Legacy visibility contract

The English and Korean legacy visibility contract separates validator conditions
from renderer presentation. It documents map-form renderer processing and links
to the current schema's independent visibility and validation settings. The
duplicate visibility guide is removed. The selected TypeScript legacy
display-switch checks passed 84 cases.

### 2026-09-09 — Documentation web navigation

The web uses English navigation with a Korean index link. Generated API navigation
includes the shared generator core. Documentation checks, the strict web build
and generated navigation destination checks passed.

### 2026-09-09 — Data validation guide

The validation guide documents the current JavaScript, PHP, Go and Rust entry
points with `validate` rules. It separates schema loading, input failures,
visibility and transport processing. The outdated API guide is removed and
navigation uses the English guide with a Korean translation. All four code
examples executed successfully and detected the expected required-input failure.

### 2026-09-09 — Svelte generated output

Git excludes Svelte's temporary `.svelte-kit` output. The 117 generated files are
removed from tracking. Building without the preceding directory passed, as did
packaged exports, install type checking, the production build and browser checks
for React, Vue and Svelte.

### 2026-09-09 — Public API documentation generation

API generation fails when a required tool fails or its output is missing.
TypeScript checks all five public package entries, including Svelte component
declarations. Go documents all validator packages. Rust and PHP HTML references
are included in the static web. The documentation procedure specifies required
tools; the duplicate procedure is removed.

Eight generator failure tests, documentation checks, Svelte's 345 server tests
and 3 mounted tests passed. Two complete documentation generations produced
identical output, including native HTML assets. The strict web build passed.

### 2026-09-09 — Documentation link validation

The web checks internal links during builds. TypeDoc generates relative links
and package index pages. Existing repository files outside the web resolve to
GitHub source URLs; missing files fail. Five link tests run in `make docs-check`.
The strict web build, document checks and generated HTML link checks passed.

### 2026-09-09 — Maintained documentation navigation

The documentation web links to the maintained expression contract. Documentation maintenance
instructions identify the current example index checked by `make docs-check`.
The document checks and static web build passed.

### 2026-09-09 — Shared AST evaluation for ternary parameters

Form appearance and TypeScript, PHP, Go and Rust validation parameters evaluate
complete ternary ASTs. Selected field paths, nested true branches and quoted
escapes no longer use separate string parsers. Three form regressions and one
validation regression failed before the fix and passed afterward. Six shared
validation cases cover path-valued and nested limits. Existing validation results
and expected form HTML remain unchanged. The class-name fixture now quotes its
string branches.

The expression contract is maintained in English and Korean under `docs/spec/`.
It documents current boolean conversion separately from required-input validation,
operator precedence and condition-map defaults. CLI descriptions use this contract.
All four validator suites, all form suites, 36 CLI tests and documentation checks
passed. These results do not update the preserved external browser comparison.

### 2026-09-09 — Current API and fixture descriptions

Console documentation uses the current rendering API name. Composition and
rendering fixture descriptions state their behavior without implementation-version
labels. All 23 targeted composition tests passed; fixture inputs and expected
results are unchanged.

### 2026-09-09 — Repository-local form inspection and JSON order checks

Package tests use repository-local
form inspection and JSON order checks. All 50 JSON order cases and the complete
form test suite passed.

### 2026-09-09 — Reusable form inspector

The form inspector and its Node and browser checks are maintained under
`tests/form-inspector/`. Framework initialization tests use that module directly.
All 18 Node checks and six browser checks passed after relocation.

### 2026-09-09 — Bundled example specifications and nested data

The Bootstrap example includes product and repeated-form specifications in its
static build. Controlled pages apply complete form data instead of assigning
dotted paths as top-level keys. The example build and browser checks for
contact, registration, product and repeated forms passed, including nested
product data and rejection of an unintended dotted key.

### 2026-09-09 — Controlled legacy React updates

Legacy form change notifications execute outside React state updater functions.
Consecutive field changes preserve prior values and notify the controlled parent
once per change. The regression failed before the fix. All 692 React tests and
the package build passed after the fix.

### 2026-09-09 — Legacy example layout and builds

Legacy examples use `examples/legacy`. Imports, package references, build contexts,
tests and documentation use the relocated paths. Container builds install and
build the complete workspace through package commands. PHP integration classes
use individual PSR-4 files. The Node example lock file reflects current manifests.

Local frontend builds, Go tests, Rust compilation, five PHP API checks and Node
HTTP valid/invalid cases passed. Composer strict PSR-4 generation and documentation
checks passed. Linux images for the frontend examples, Node, PHP, Go and Rust built.
All four server images passed valid and invalid HTTP cases. PHP Apache routing
and its document root passed. Frontend browser verification remains pending.

### 2026-09-09 — Repeated-field schema

The declaration schema accepts `multiple.min` and describes collection-key row
identity without hidden fields. Schema validation passed 56 fixtures, including
minimum-count acceptance and rejection of a nonnumeric minimum.

### 2026-09-09 — Current comparison image

The comparison image builds the library source with normal dependency
installation. The image installs the browser archive extractor and resolves
native JavaScript build dependencies through the workspace lock file.
The local comparison environment runs PHP, PHP extension, Go and Rust.
All 240 HTTP checks and PHP processor-mode checks passed. Browser comparison
is in progress for this source and dependency graph.

### 2026-09-09 — Dependency installation and package checks

The workspace lock file resolves declared dependency ranges and includes native
packages for supported platforms. The root declares Vitest for shared test
integration. npm install-script approvals identify reviewed package versions.
The isolated install project uses normal installation with the same script approvals.

Clean installation, public package checks (5), repeated build comparison (1),
install types, production compilation and three-framework browser checks passed.
Form checks passed: core 26, React 691, Vue 344, Svelte 345 and 3 mounted checks,
and 6 HTML normalizer checks. JavaScript validation passed 1,579 tests.
These results do not establish deployment of the comparison environment.

### 2026-09-09 — Field error descriptions

Unsupported field errors identify the field type and path. Current test names
use unversioned operation names. Core checks passed: 26 tests. Documentation
checks passed.

### 2026-09-09 — Independent PHP extension target

PHP extension execution uses a separate process, repository and server identifier.
The native processor is required in extension mode and prohibited in PHP mode.
Server and browser checks include PHP extension as a fourth target.

An isolated container passed 240 HTTP checks across four targets, including
processor-mode assertions. Both PHP codec modes and rejection of missing or
unexpected extensions passed. Full extension browser verification remains pending.
The main comparison container has not yet been replaced with this image.

### 2026-09-09 — Empty collection browser checks

Browser checks locate the collection containing the focused button through its
field wrapper. The current renderer no longer uses wrapper name attributes.
All 18 current empty-collection checks passed across three servers, three
frameworks and both transports. The PHP run passed all six current initialization
comparisons and 30 current-runtime pointer/keyboard interaction checks
(108 across all comparison modes), with no page errors.
Retained source HTML differences remain recorded as failures.

### 2026-09-09 — Shared SSR comparison instance

The cross-check console creates one form instance for the three renderers.
Generated row keys are identical across framework outputs when repeat data is
missing. Console checks passed: 81 tests, including the generated-key comparison.

### 2026-09-09 — Comparison server entries

Current PHP, Go and Rust servers use unversioned validator entries. Retained
Go and Rust servers build from a pinned server-source archive. The comparison
container uses the library source. All 180 HTTP persistence checks passed.
Browser lifecycle verification is in progress. No package was published.

### 2026-09-09 — Comparison browser entries

Comparison browser builds select current and retained source entries explicitly.
Current collection checks use field paths. The build requires an explicit
absolute workspace path. All twelve browser bundles built successfully.
Server integration and lifecycle verification remain pending; the running
comparison environment has not been replaced.

### 2026-09-09 — Public declaration builds

TypeScript package builds generate JavaScript with the bundler and declarations
with the TypeScript compiler. Public entries include the declared legacy exports.
Declaration compilation uses `noEmitOnError` and no deprecated-option suppression.
Watch commands regenerate declarations after successful JavaScript builds.

Verification: clean installation and the full build passed. Five public package
checks passed, including strict ESM/CommonJS type resolution, stylesheet output
and rejection of invalid public declarations. Two complete builds produced
identical output paths and SHA-256 digests. An isolated package install passed
type checking, production build and three-framework browser checks. Runtime
source files were unchanged by this build change. Packages were not published.

### 2026-09-08 — Form instances and input controls

The form API prepares templates with `compileForm`, creates editable instances
with `createForm`, renders `Form` components and accepts an instance in
`renderForm`. List renderers use the same `layout` option. Native controls have
stable, scoped label identifiers; multiple-choice controls submit arrays.
Field containers use `data-field-path` instead of a submission name.
Svelte packages include generated component declarations. Package dependencies
use the `0.0.1` package version. Validation comparisons fail when a required
engine fails, is missing or returns duplicate results.

Verification: 1,409 form tests, 1,579 JavaScript validator tests, 1,392 PHP tests,
Go and Rust tests, 42 console tests, 18 inspector tests, Svelte type checking,
package install compilation/build and documentation checks passed.
The running comparison container has not been updated to this source.

### 2026-09-08 — Record restoration HTML

The shared DOM binding places an existing `checked` attribute after the input's
other attributes. Initial rendering and record restoration now use the same
attribute order without replacing the input. The shared regression compares the
complete restored HTML and verifies that checkbox elements remain unchanged.

Verification: the stricter regression failed in React and Vue before the fix.
Generator builds, all 1,405 generator tests and 18 inspector tests passed after
the fix. The source passed all 360 current-runtime scenarios across 18
server/framework/transport combinations. All 3,024 initialization, repeated
injection and restoration category comparisons passed, including 378 exact HTML
comparisons. The 24 previous restoration differences are resolved.

All 324 actual interactions, 36 mount-before-load checks, 36 static documents,
180 HTTP checks, 36 typing cases and six Chrome CSS detection checks passed.
Korean React and English Vue checks through Rust verified the inspector button,
all 168 categories per run and exact JSON/HTML downloads. No browser page errors
occurred. The complete matrix records 1,290 passed and 150 failed scenarios;
all remaining failures belong to retained sources and match their previous results.

An intermediate run recorded an additional CSS failure after a progress-monitor
connection changed the browser viewport. The monitor was removed, the viewport
change was reproduced separately, and the full matrix was rerun at 1680 × 1100
without an additional connection. Both runs and previous reports are retained.
All 2,160 exported HTML snapshots match the recorded strings. Deployment: the
local container uses the verified source; all 52 example files, the DOM binding source and
served metadata match the verified source. No package was published.

### 2026-09-08 — Form initialization inspector

Added initial-data creation and post-mount injection comparison using the parsed
browser DOM, unmodified HTML, live/default controls, ordered fields, computed CSS,
focus and saved records. The inspector retains category failures and continues
through repeated injection, record replacement and the same row actions. The
example provides a separate check button and downloadable HTML and evidence.
Static HTML responses are checked independently from mounting before data loads.
React now removes the empty style attribute when resolved inline styles are removed.

Verification: generator builds, 1,405 generator tests, 18 inspector tests and six
Chrome CSS detection checks passed. At 15:35 UTC, all three API servers completed
72 reports containing 1,440 scenario results: 1,278 passed and 162 failed.
Current-runtime initial-data/post-mount comparisons passed in all 18 combinations
at 15 stages. Repeated injection passed, including raw HTML. Record restoration
retained 24 raw HTML attribute-order differences in React and Vue; all current
DOM, CSS, control, data, focus and persistence comparisons passed. Earlier
renderer differences remain recorded. Each server runner returned status 1.

All 324 interactions, 36 mount-before-load checks, 36 static HTML checks, 180 HTTP
checks, 36 typing cases and 54 bilingual UI selections passed. No browser page
errors occurred. Exported 2,160 stage snapshots and retained the stopped 42-report
run. Browser protocol calls now execute one API server at a time. Complete report
JSON omits indentation because the indented DOM records exceed the runtime string
limit; snapshot content is unchanged. Deployment is the local Apple container at
`localhost:4317`; no package publication or remote deployment.

### 2026-09-07 — Empty collection merge

Merged the empty-collection correction into `main`, retaining stable row keys and
focus handling. Empty collection Add buttons have an accessible label in React,
Vue and Svelte. Six regression tests cover explicit empty values, missing data,
visibility and nested row order. The tests use the current root group contract.

The pinned correction source is included in `main` history, so preparing the
comparison from a full clone does not require a separate branch.

Verification: generator builds and 1,402 tests passed (core 25, React 689,
Vue 342, Svelte 345 and Svelte client 1). The regression tests use `compileForm`
and `bindForm`. Deployment: no package publication; the local comparison
continues to use its existing pinned sources.

### 2026-09-07 — PHP, Go and Rust form persistence

Added independent Go and Rust servers alongside PHP for native form and JSON
submission, existing CRUDUI validation, atomic JSON storage and hierarchy reload.
Each server and source revision uses its own repository. Go and Rust binaries
compile against the displayed validator revision. Node serves browser assets and
forwards request bytes. Shared fixtures define identical stored records.

The page selects the server and retains that selection when changing language.
Form fields follow the string contract, and multilingual titles accept the
specified `ko` and `en` fields. Invalid structures, reset requests, oversized
requests and invalid required values are rejected without changing records.

The 13:47 UTC browser report contains 72 reports and 1,368 scenario results.
Corrected original and current runtime each passed 19/19 for PHP, Go and Rust in
React, Vue and Svelte with both form and JSON transmission. All 324 interaction
checks and 36 mount-before-load checks passed with no browser page errors.
Unchanged original keyed diagnostics remain 17/19 and array diagnostics 15/19;
the complete runner returned status 1 for the 108 retained diagnostic failures.
All 180 shared HTTP checks, 36 typing checks, 54 bilingual UI selections,
JavaScript/PHP conversion checks, PHP repository checks, Go static analysis,
Rust Clippy and `make docs-check` passed. Earlier failed reports were preserved.

Deployment: local Apple container at `localhost:4317`, using PHP 8.4.24,
Go 1.27.0, Rust 1.98.0 and Node 26.8.1. No package publication or remote deployment.

### 2026-09-07 — Original-controller typing

The original example controller could overwrite newer input with an earlier
rendered value and temporarily lose focus when a framework replaced an input.
It now cancels superseded input renders and restores values and focus immediately
after React, Vue or Svelte commits the DOM. The fixed two-frame delay was removed.

Verification at 13:41 UTC: all 36 native keyboard cases passed across four
comparison variants, three frameworks and 0/10/50 ms character intervals.
Immediate and settled text, focus and caret checks passed; no browser page errors
occurred. Library source snapshots are unchanged. Deployment is the local Apple
container at `localhost:4317`; no package or remote deployment was published.

### 2026-09-07 — Form comparison naming

Applied consistent CRUDUI example names to paths, source, documentation and
container commands.
Comparison library and test files retain their original content. Previous data,
reports and source archives were preserved outside the working tree.

Verification at 12:21 UTC: corrected original and current runtime each passed
19/19 in React, Vue and Svelte for both form and JSON transmission. All 108
interaction checks, 12 mount-before-load checks, JavaScript/PHP conversion checks,
both repository checks and `make docs-check` passed. No browser page errors
occurred. Unchanged original keyed diagnostics remain 17/19 and array diagnostics
15/19; the full runner returns status 1 for those recorded failures.
Deployment: local Apple container at `localhost:4317`; no package publication or
remote deployment.

### 2026-09-07 — Form and ordered JSON transmission

Each form can select native multipart or JSON transmission. Both formats run
the same existing JavaScript/PHP validation and repository save. The JSON path
uses ordered-json for requests, responses and storage files. Separate
transport modules convert its values to form records while preserving the
13-character keys, document order and empty collection types. The container
build includes the pinned source and displays its archive hash.

Added complete lifecycle checks for both transmission choices, identical-data
storage comparisons and malformed JSON rejection. Actual browser requests verify
the selected Content-Type and JSON shape. Invalid browser values block both
formats; invalid direct requests preserve stored records. Required/optional and
display rules continue to use the existing validators.

Verification at 11:35 UTC: corrected original and current runtime each passed
19/19 in React, Vue and Svelte for both formats. All 108 real interaction checks,
12 mount-before-load checks, JavaScript/PHP conversion checks and both repository
checks passed. JavaScript, PHP, Go and Rust validation conformance and
`make docs-check` passed. No browser page errors occurred. Unchanged original
keyed diagnostics remain 17/19 and array diagnostics 15/19 in both formats;
their existing failures remain recorded and the complete runner returns status 1.
Deployment: local Apple container at `localhost:4317`; no package publication or
remote deployment. Comparison sources and previous reports remain available.

### 2026-09-07 — JSON processor contract verification

Added a reproducible check against ordered-json for document member
order, nested 13-character row data and empty collection types. All five
implementations passed ten transport fixtures and the processor's 115 common
cases. The fixtures verify JSON representation; browser behavior and runtime JSON
integration did not change. The local comparison remains available.

### 2026-09-07 — Empty collection correction and browser validation

- Added the corrected original source to the primary comparison with the current
  runtime. The unchanged original keyed and array diagnostics remain
  selectable with their actual failures.
- Connected the existing JavaScript validator before user submission. Invalid
  values stop transmission and display field errors; reload clears obsolete errors.
  PHP independently validates the same rules. No validator rules changed.
- Verified optional blank department storage, hidden required-field failures,
  empty collection visibility, nested and complete deletion, re-addition,
  native/JSON persistence, sibling IDs and parent relationships.
- Added real typing, invalid/valid request counts and empty-collection keyboard
  focus checks. Frame scenarios run sequentially to avoid focus interference.
  The runner preserves prior reports and screenshots before writing new results.

Verification at 10:15 UTC: both primary implementations passed 17/17 in React,
Vue and Svelte. All 54 interactions, 12 mount-before-load checks and both PHP
repository checks passed; no browser page errors occurred. The unchanged original
keyed diagnostic remains 15/17 and the array diagnostic remains 13/17, so the
complete runner returns status 1. Existing shared validation cases passed in
TypeScript, PHP, Go and Rust. `make docs-check` passed.
Deployment: local Apple container at `localhost:4317`; packages not published.

### 2026-09-07 — Focus during native typing

Ignore unchanged input/change events before capturing focus. A native change
event during input replacement previously cleared the pending focus state in
Vue and Svelte, so typing stopped after the first character.

Verification: full Chrome checks retained the complete typed value and input
focus in React, Vue and Svelte. Shared mounted DOM checks and core type checking
passed. Deployment: local comparison environment; packages not published.

### 2026-09-07 — Focus after adding to an empty collection

The browser binding identifies the empty collection's Add button by its wrapper.
After the first row replaces that button, it restores focus to the Add button in
the same collection with `preventScroll`.

Verification: the shared mounted DOM scenario and real Chrome empty-collection
keyboard checks passed in React, Vue and Svelte; core type checking passed.
Deployment: local comparison environment; packages not published.

### 2026-09-07 — Focus during row operations

Row button pointer activation preserves input focus. DOM synchronization restores
text selection and ancestor scroll positions with `preventScroll`. Keyboard
activation retains focus on an existing button. Generator builds and mounted DOM
checks passed in React, Vue and Svelte. Real browser pointer and keyboard checks
passed in all three frameworks. Deployment: running in the local form comparison example;
packages not published.

### 2026-09-07 — Browser comparison and PHP persistence

- Added an Apple container environment for React, Vue, Svelte and PHP at
  `localhost:4317`, with exact original and current Git source snapshots.
- Added a primary comparison using identical 13-character keyed data. The original
  public functions use an example row controller and cached binding; the current
  runtime uses its library session. Original library source remains unchanged.
- Added original-public-function cache preparation with `composeProperties`,
  serialized structure restoration and `buildField` binding. Both keyed adapters
  read a composition reference once and reject further loading after preparation.
- Added native PHP parsing, revision-specific validation, atomic JSON persistence,
  parent ownership, scoped saved-key application, deletion and independent reload.
  Invalid or truncated requests preserve stored records.
- Added ID order `[5, 7, 1]`, insertion as ID 8 and subtree copying as ID 9.
  Keyed JSON uses document member order without additional order or identity
  fields. Editing document order changes stored and rendered order.
- Separated populated row-operation fixtures from explicit empty-collection checks.
  The comparison preserves empty-rendering failures without filtering generated rows.
- Mounted each form before its initial PHP data request. Browser request inspection
  checks that nested inputs exist before the request continues.
- Retained the earlier hidden-field array diagnostic as a selectable example.
  Its hidden fields and lack of cached binding are example configuration choices.
- Added pointer, keyboard and checkbox checks, manual controls, data inspection,
  downloadable results, raw error details and matching English/Korean documents.
  Failure explanations identify example configuration and original renderer behavior.
- The browser runner returns status 1 for any failed check, incomplete result or
  browser error. Recorded diagnostic failures remain failures.

Verification: in each framework, the current runtime passed 17/17 scenarios,
original keyed binding passed 15/17, and the retained array diagnostic passed
13/17. Original keyed failures both concern explicit empty-collection rendering.
Cache binding passed in both keyed examples. All 27 interaction checks, nine
mount-before-load checks and both PHP repository checks passed. No browser page
errors occurred. The comparison runner returned status 1 for recorded failures.
[Feature status](docs/features.md) records the current code's results.
Deployment: local Apple container; packages not published and no remote deployment.

### 2026-09-07 — Compiled forms and 13-character row keys

- Added immutable, JSON-cacheable form templates and separate data binding.
- Added editable sessions with late data injection and scoped nested row addition,
  copying, removal, ordering and saved sequence key updates. New row keys contain
  13 hexadecimal characters; saved sequence keys contain 13 padded decimal digits.
- Connected native inputs and row buttons in React, Vue and Svelte. Corrected
  checkbox data rendering, explicit empty defaults, formatted date synchronization
  and React FormBuilder data prop replacement.
- Extended keyed scalar and group collection validation in four languages, with
  five shared cases for error paths, uniqueness and minimum count.
- Removed the combined `buildForm` entry and obsolete render aliases. SSR source
  functions accept compiled templates.
- Updated form contracts and usage documents with English and Korean versions.
  Added link, translation and status checks and included generator-core API
  documentation in the existing coverage check. Removed outdated form-key and
  schema documents after consolidating current contracts under `docs/spec/`.
- Replaced developer checkout paths with repository-relative imports or required
  external input paths. Corrected fixture regeneration to update existing cases.

Verification: core 19 tests; React 689; Vue 342; Svelte 345 SSR/unit and 1 mounted
DOM test; TypeScript validator 1,579; PHP conformance 61; Go and Rust shared
validation conformance passed. These runs include 43 shared CRUDUI validation cases.
Console SSR 32 tests, CLI 35 tests, lint, type checking and `make docs-check`
passed. API generation, schema generation and the documentation web build
passed. Deployment: not deployed.

### 2026-09-07 — Schema generation

Removed the unnecessary `ignoreDeprecations: "6.0"` compiler setting because the
schema generator's bundled TypeScript compiler rejects it. TypeScript type
checking, schema generation with three example checks, and the documentation
web build passed. Deployment: not deployed.
