# CRUDUI documentation pipeline.
#
# User entry point for all documentation generation. npm scripts, typedoc,
# cargo doc, and go doc are building blocks invoked from here.
#
# Everything is idempotent: generation targets clean before they generate, and
# the generators emit deterministic output (no timestamps, no commit hashes, no
# machine-absolute paths). `make docs` run twice yields identical output.

.DEFAULT_GOAL := help
# The npm of this checkout (scripts/checkout-npm.mjs): `node scripts/install-npm.mjs` installs the release that
# packageManager of package.json records into the ignored .tools/npm, and every command of make finds it first on PATH.
# The npm of the machine is never changed.
export PATH := $(CURDIR)/.tools/npm/node_modules/.bin:$(PATH)
# GNU Make 3.81 looks up the program of a recipe line without shell syntax on the PATH that make started with, not on the
# exported one, so every recipe starts npm by its path (tests/build/checkout-npm.test.mjs).
NPM := $(CURDIR)/.tools/npm/node_modules/.bin/npm
# The exact toolchains of the checkout (docs/spec/package-build.md): rustup runs the toolchain of rust-toolchain.toml and
# never installs one on the first cargo, which fails with rustup's message naming `rustup toolchain install`; go runs the
# installed release and never downloads the toolchain of a go.mod. `make install` installs them.
export RUSTUP_AUTO_INSTALL := 0
export GOTOOLCHAIN := local
# A check reads no network (docs/spec/package-build.md, "Offline checks"): every recipe and the scripts that it starts
# run cargo, go, npm and Composer offline, so a missing download fails at once instead of reaching a registry in one run
# and not in another. The targets that download, install-crates, install-ordered-json, install-cargo-audit,
# dependency-review and the consumer installs release-install-check and release-install-lock, and the downloads of install
# run their commands with $(ONLINE); cargo-downloads-check names make install for a missing crate.
export CARGO_NET_OFFLINE := true
export GOPROXY := off
export npm_config_offline := true
export COMPOSER_DISABLE_NETWORK := 1
ONLINE := env -u CARGO_NET_OFFLINE -u GOPROXY -u npm_config_offline -u COMPOSER_DISABLE_NETWORK
.PHONY: help ci-targets ci-passed release-verify release-versions release-assets release-install-check release-install-lock release-install-head release-publish push-gate-check install install-npm install-node-modules install-composer install-rust install-phpdocumentor install-browsers check-ci-browser test-runtimes test-dependencies build lint typecheck test-validator-js test-validator-php test-validator-go test-validator-rust test-validator-python test-generator-python test-cross-check manifest-test require-build test-cli manifest-check manifest-docs-check test-forms test-form-comparison test-form-comparison-pipeline test-form-comparison-checks test-form-comparison-browser test-form-comparison-summary test-packages test-build test-build-repeat test-inspector test-bench check-conformance install-crates install-ordered-json install-cargo-audit cargo-downloads-check dependency-review toolchain-check owner-check test-ordered-json docs docs-api docs-schema docs-web docs-dev docs-preview docs-clean docs-check docs-check-documents docs-check-libs docs-verify-idempotent bench bench-fixtures bench-js bench-php bench-go bench-rust build-php-extension test-php-engine test-native-generators test-php-api test-native test-validators test-form-binding conformance format-check github-settings github-settings-check records-check hooks hooks-check ci rerun-failed
.NOTPARALLEL: docs docs-web docs-dev docs-preview docs-check docs-verify-idempotent

# Validator benchmark iteration counts (override on the command line, e.g.
# `make bench BENCH_ITERS=100000`).
BENCH_ITERS  ?= 50000
BENCH_WARMUP ?= 5000
PHP_EXTENSION ?= $(CURDIR)/packages/php-ext/modules/crudui.so
# Reports live in the Git directory, which is a file-referenced directory in a worktree: NATIVE_REPORT of the JavaScript,
# HTML, Go and Rust targets and PHP_NATIVE_REPORT of the PHP and native PHP targets of tests/native-generators/run.mjs.
NATIVE_REPORT ?= $(shell git rev-parse --git-path native-generators/report.json)
PHP_NATIVE_REPORT ?= $(shell git rev-parse --git-path native-generators/report-php.json)
CONFORMANCE_EVIDENCE ?= $(abspath $(shell git rev-parse --git-path conformance-evidence))
# Every make run installs the tracked Git hooks: it sets core.hooksPath to .githooks when the setting differs, so the
# pre-push hook .githooks/pre-push refuses a push while a checklist task is [~] (scripts/push-gate.mjs, AGENTS.md).
HOOKS_PATH := $(shell [ "$$(git config core.hooksPath)" = .githooks ] || git config core.hooksPath .githooks; git config core.hooksPath)

help: ## 타겟 설명
	@echo "CRUDUI docs — make targets:"
	@echo ""
	@echo "  make install               Install the recorded npm, the npm, Composer and Cargo dependencies, the Rust toolchain and phpDocumentor"
	@echo "  make install-crates        Download the crates of every Cargo.lock and the OrderedJSON checkout that one reads"
	@echo "  make install-cargo-audit   Install the cargo-audit release of config/toolchain.json into .tools/cargo-audit"
	@echo "  make toolchain-check       Fail when a tool does not run at the version that the checkout records"
	@echo "  make dependency-review     Ask the registries for newer stable releases and advisories; RECORD=1 records, UPDATE=1 updates first"
	@echo "  make owner-check           Run the owner checks of the changed paths (scripts/owner-checks.json); PATHS or BASE select the paths"
	@echo "  make test-ordered-json     Test the processor checks of tests/ordered-json without an OrderedJSON checkout"
	@echo "  make docs                  전체 문서 생성 (API doc 멀티언어 + JSON schema 검사 + 정적 웹)"
	@echo "  make docs-api              Generate API references for all languages"
	@echo "  make docs-schema           스펙 JSON Schema와 공유 고정 데이터 검사"
	@echo "  make docs-web             정적 웹 빌드 (docs/.web/dist)"
	@echo "  make docs-dev              문서 개발 서버"
	@echo "  make docs-preview          문서 빌드 결과 미리보기 서버"
	@echo "  make docs-clean            생성물 전부 제거 (docs/api, dist, target/doc)"
	@echo "  make docs-check            doc-coverage 게이트 (문서 + 라이브러리, 미문서화 시 RED)"
	@echo "  make docs-check-libs       라이브러리 packages/* 만 검사"
	@echo "  make docs-verify-idempotent  docs 를 2회 생성하고 diff 가 비는지 검증"
	@echo "  make build-php-extension   Build and load the native PHP module"
	@echo "  make test-php-engine       Test the C engine of the native PHP module with the C compiler and its sanitizers"
	@echo "  make test-native-generators  Test the Go and Rust generators and compare JavaScript, HTML, Go and Rust generation"
	@echo "  make test-php-api          Build the native PHP module, test its builder and PHP API and compare PHP and native PHP generation"
	@echo "  make test-native           Run test-php-engine, test-native-generators and test-php-api"
	@echo "  make test-validators       Test the JavaScript, PHP, Go and Rust validators"
	@echo "  make test-form-binding     Test the browser validation binding, its markup parity and three browsers"
	@echo "  make conformance           Run every conformance suite and check the evidence against the standard"
	@echo "  make format-check          Fail when any Rust crate or Go file is not formatted"
	@echo "  make ci                    Run every command of the CI workflow in order, once per tree (scripts/full-run.mjs)"
	@echo "  make rerun-failed          Rerun the commands of make ci that did not pass on the current tree"
	@echo "  make github-settings       Apply the repository settings and the ruleset main in .github/repository.json"
	@echo "  make github-settings-check Fail when the repository settings differ from the declaration"
	@echo "  make records-check         The document and checklist rules that need Node.js alone"
	@echo "  make ci-passed             Fail unless every job of RESULTS, the toJSON(needs) of the CI job ci-passed, succeeded"
	@echo "  make release-verify        Check that the commit of TAG is on main and passed push-gate and ci-passed"
	@echo "  make release-versions      Check the version of TAG in every package file and the change log section"
	@echo "  make release-assets        Build the packages and write the npm and Composer archives of TAG to var/release/assets"
	@echo "  make release-install-check Install the archives of var/release/assets from the consumer fixtures"
	@echo "  make release-install-head  Write the archives of HEAD and install them from the consumer fixtures"
	@echo "  make release-install-lock  Write the consumer fixtures and regenerate their locks from var/release/assets"
	@echo "  make release-publish       Create the GitHub Release of TAG with its change log section and archives"
	@echo ""
	@echo "CRUDUI validator benchmark — make targets:"
	@echo ""
	@echo "  make bench                 4언어(JS/PHP/Go/Rust) 처리량 비교 (ops/sec + avg µs 표 → tools/bench/results.md)"
	@echo "  make bench-js              JS 검증기만 측정"
	@echo "  make bench-php             PHP 검증기만 측정"
	@echo "  make bench-go              Go 검증기만 측정"
	@echo "  make bench-rust            Rust 검증기만 측정"
	@echo "  make bench-fixtures        벤치 스펙+입력 fixture JSON 재생성"
	@echo "  (반복수 조절: make bench BENCH_ITERS=100000 BENCH_WARMUP=10000)"
	@echo "  주의: 절대시간은 머신 의존 — 같은 스펙 안에서 백엔드 간 비율만 비교하라."
	@echo ""

# The npm of packageManager into .tools/npm, the dependencies of the lock files, the Rust toolchain of
# rust-toolchain.toml, the crates of every Cargo.lock, the OrderedJSON checkout of the comparison and the phpDocumentor release that scripts/install-phpdocumentor.sh checks by its SHA-256. Node.js, Go, PHP and Composer are installed at the versions of .node-version, .go-version and
# config/toolchain.json by the machine's package manager; `make toolchain-check` names every tool at another version.
install: install-node-modules install-composer install-rust install-crates install-phpdocumentor ## Install the recorded npm, the npm, Composer and Cargo dependencies, the Rust toolchain and phpDocumentor

# The parts of make install, which the CI jobs run for what they check: every CI step runs a make target, so the recipes
# start every tool with the offline settings, $(NPM) and the toolchains of the checkout.
install-npm: ## Install the npm release of packageManager into .tools/npm
	$(ONLINE) node scripts/install-npm.mjs

install-node-modules: install-npm install-ordered-json ## Install the npm dependencies of package-lock.json with their approved install scripts
	$(ONLINE) $(NPM) ci --strict-allow-scripts

# The development root composer.json, never published, resolves the Composer packages of packages/: its path
# repository installs polyspec/crudui-validator as a copy into vendor/, and its autoload reads the generator sources.
install-composer: ## Install the Composer dependencies of the development root composer.json into vendor/
	$(ONLINE) composer install --no-interaction --prefer-dist

install-rust: ## Install the Rust toolchain of rust-toolchain.toml
	rustup toolchain install --no-self-update

install-phpdocumentor: ## Install the phpDocumentor release that scripts/install-phpdocumentor.sh checks by its SHA-256
	$(ONLINE) sh scripts/install-phpdocumentor.sh

# The browsers that puppeteer and playwright pin (scripts/install-browsers.mjs); BROWSERS names the browsers and options.
BROWSERS ?= chrome firefox webkit
install-browsers: ## Install the pinned browsers of BROWSERS (chrome firefox webkit) into the checkout
	$(ONLINE) node scripts/install-browsers.mjs $(BROWSERS)

check-ci-browser: ## Check that the pinned Chrome runs sandboxed
	node scripts/check-ci-browser.mjs

# The crates of every Cargo.lock, after the OrderedJSON checkout that the lock of the Rust record server reads; a CI job
# that runs a target with cargo-downloads-check runs it.
install-crates: install-ordered-json ## Download the crates of every Cargo.lock
	$(ONLINE) node scripts/check-cargo-downloads.mjs --fetch

# The OrderedJSON checkout of the comparison record servers (examples/form-comparison/install-ordered-json.mjs);
# the Cargo lock of the Rust record server reads it.
install-ordered-json: ## Install the OrderedJSON checkout of the comparison record servers
	$(ONLINE) node examples/form-comparison/install-ordered-json.mjs

# The cargo-audit release of config/toolchain.json in .tools/cargo-audit, which the dependency review runs.
install-cargo-audit: ## Install the cargo-audit release of config/toolchain.json into .tools/cargo-audit
	$(ONLINE) node scripts/install-cargo-audit.mjs

# The crates of every Cargo.lock in the registry of CARGO_HOME; every target that runs cargo depends on it, and it names
# make install for a missing crate instead of cargo's advice to retry without --offline.
cargo-downloads-check: ## Check that the crates of every Cargo.lock are downloaded; names make install otherwise
	node scripts/check-cargo-downloads.mjs

# The dependency review (docs/spec/package-build.md, "Dependency review"): it asks the registries for the latest stable
# release of every registry dependency and for the advisories of every npm, Composer and Cargo lock. RECORD=1 writes config/dependency-review.json,
# which `npm run test:dependencies` compares with the checkout without a network; UPDATE=1 updates first. No check runs it;
# the scheduled workflow .github/workflows/dependency-review.yml runs it every day.
dependency-review: install-cargo-audit ## Ask the registries for newer stable releases and advisories; RECORD=1 records the review, UPDATE=1 updates first
	$(ONLINE) node scripts/dependency-review.mjs $(if $(RECORD),--record) $(if $(UPDATE),--update)

# TOOLS names the tools that a CI job set up.
TOOLS ?= node npm go rust php python composer
toolchain-check: ## Fail when a tool of TOOLS does not run at the version that the checkout records
	node scripts/check-toolchain.mjs $(TOOLS)

# Every CI job runs its checks through ci-targets (scripts/ci-targets.mjs): each target of TARGETS runs as make -k to its
# end, also after an earlier one failed, and var/report/ci-targets holds the log of each target and summary.md with the
# first failure lines of each failed one, which the job uploads and writes to its job summary.
ci-targets: ## Run the targets of TARGETS to their end and write var/report/ci-targets
	node scripts/ci-targets.mjs var/report/ci-targets $(TARGETS)

# The checking commands of the CI workflow, one target each (CI_COMMANDS).
test-runtimes: ## Exact runtime versions and test standards
	$(NPM) run test:runtimes
test-dependencies: ## The dependency graph and its recorded review
	$(NPM) run test:dependencies
build: ## Build the JavaScript packages
	$(NPM) run build
lint: ## Lint the repository
	$(NPM) run lint
typecheck: ## Type-check every TypeScript package
	$(NPM) run typecheck
test-validator-js: ## The TypeScript validator suite
	$(NPM) test -w @polyspec/crudui-validator
test-validator-php: ## The PHP validator suite
	composer --working-dir=packages/validator-php test
test-validator-go: ## The Go validator suite
	node scripts/run-tests.mjs go --cwd packages/validator-go -- ./...
test-validator-rust: cargo-downloads-check ## The Rust validator suite
	node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml
test-validator-python: ## The Python validator suite
	python3 -m unittest discover -s packages/validator-python/tests -p 'test_*.py'
test-generator-python: ## The Python generator suite
	python3 -m unittest discover -s packages/generator-python/tests -p 'test_*.py'
test-cross-check: cargo-downloads-check ## The cross-check console gateway conformance
	$(NPM) test --prefix examples/cross-check-console/server
manifest-test: cargo-downloads-check ## The verification commands of the feature contracts
	$(NPM) run manifest:test
require-build: ## Build the packages when their sources or output changed
	node scripts/require-current-build.mjs
test-cli: ## The command-line interface suite
	$(NPM) test -w @polyspec/crudui-cli
manifest-check: ## The feature contract manifest
	$(NPM) run manifest:check
manifest-docs-check: ## The generated feature contract documents
	$(NPM) run manifest:docs:check
test-forms: ## Form instances, renderers and the browser checks
	$(NPM) run test:forms
test-form-comparison: ## The form comparison runner regressions
	$(NPM) run test:form-comparison
test-form-comparison-pipeline: cargo-downloads-check ## The record stores and the canonical flow
	$(NPM) run test:form-comparison:pipeline
test-form-comparison-checks: cargo-downloads-check ## The PHP modes, generation, persistence, flow, browser and typing checks against a local stack
	$(NPM) run test:form-comparison:checks
# The same checks in two parts, as CI runs them: test-form-comparison-browser runs the browser checks of the servers of
# FORM_SERVERS against a local stack and keeps their reports in FORM_BROWSER_REPORTS; test-form-comparison-summary runs
# every other check against a local stack of its own and summarizes those reports. Every public server takes a port of
# the system, so runs at the same time do not collide; the summary requires the scheme and host of every report.
FORM_SERVERS ?= php,php-ext,go,rust
FORM_BROWSER_REPORTS ?= $(CURDIR)/var/form-comparison/browser
test-form-comparison-browser: cargo-downloads-check ## The browser checks of the servers of FORM_SERVERS against a local stack
	$(NPM) run test:form-comparison:checks -- --servers $(FORM_SERVERS) --results $(FORM_BROWSER_REPORTS)
test-form-comparison-summary: cargo-downloads-check ## Every other check against a local stack, with the browser reports of FORM_BROWSER_REPORTS
	$(NPM) run test:form-comparison:checks -- --browser-reports $(FORM_BROWSER_REPORTS)
test-packages: ## The package install check
	$(NPM) run test:packages
test-build: ## The public builds
	$(NPM) run test:build
test-build-repeat: ## The reproducible build
	$(NPM) run test:build:repeat
test-inspector: ## The browser inspector
	$(NPM) run test:inspector
test-bench: cargo-downloads-check ## The benchmark drivers
	$(NPM) run test:bench
check-conformance: ## The conformance evidence against contracts/features.json
	node scripts/check-conformance.mjs

# The checks that own the changed paths (scripts/owner-checks.json): the paths of PATHS, the paths changed since BASE, or
# the uncommitted changes and the new files that are not ignored. It never runs the full suite.
owner-check: cargo-downloads-check ## Run the owner checks of the changed paths: PATHS, the paths since BASE, or the uncommitted changes
	node scripts/owner-check.mjs $(if $(PATHS),--paths "$(PATHS)") $(if $(BASE),--base "$(BASE)")

# The unit tests of the processor checks of tests/ordered-json (docs/operations/ordered-json.md); the checks themselves need
# an OrderedJSON checkout and run by hand.
test-ordered-json: ## Test the processor checks of tests/ordered-json without an OrderedJSON checkout
	python3 -m unittest discover -s tests/ordered-json -p 'test_*.py'

docs: docs-clean docs-web ## 전체 문서 생성 (clean-then-generate)
	@echo "[make] docs: complete -> docs/.web/dist"

docs-api: cargo-downloads-check ## 멀티언어 API doc
	$(NPM) run docs:api

docs-schema: ## 스펙 JSON Schema 검사
	$(NPM) run spec:schema

docs-web: cargo-downloads-check ## 문서 정적 웹 빌드
	$(NPM) run docs:build

docs-dev: cargo-downloads-check ## 문서 개발 서버
	$(NPM) run docs:dev

docs-preview: cargo-downloads-check ## 문서 빌드 결과 미리보기 서버
	$(NPM) run docs:preview

# docs-check gates the documents AND the library packages.
# Either arm RED → non-zero exit.
# Both arms run even when the first fails.
docs-check: ## doc-coverage 게이트 (문서 + 라이브러리, 미문서화 → 비0 exit)
	@status=0; \
	$(MAKE) --no-print-directory docs-check-documents || status=1; \
	$(MAKE) --no-print-directory docs-check-libs || status=1; \
	if [ $$status -eq 0 ]; then echo "[make] docs-check: documents and libraries passed"; fi; \
	exit $$status

# Every check runs even when an earlier one fails, so one run reports every failure.
docs-check-documents: cargo-downloads-check
	@status=0; \
	$(NPM) run manifest:check || status=1; \
	$(NPM) run manifest:docs:check || status=1; \
	$(MAKE) --no-print-directory records-check || status=1; \
	node scripts/run-tests.mjs node -- scripts/gen-api-docs.test.mjs scripts/check-doc-coverage.test.mjs scripts/php-doc-coverage.test.mjs || status=1; \
	$(NPM) run test:docs || status=1; \
	$(NPM) run docs:build || status=1; \
	exit $$status

docs-check-libs: cargo-downloads-check ## 라이브러리 packages/* doc-coverage
	$(NPM) run docs:check

docs-clean: ## 생성물 전부 제거
	rm -rf docs/api docs/public/api
	rm -rf docs/.web
	rm -rf packages/validator-rust/target/doc
	rm -rf tools/bin/.phpdoc-cache
	@echo "[make] docs-clean: removed generated docs/api, dist, rustdoc, phpdoc cache"

# Generate twice and compare Markdown, native API assets and the schema. The snapshots and the
# difference go to a directory that this run creates with mktemp and removes at its exit, so
# runs of other checkouts do not overwrite them.
docs-verify-idempotent: ## docs 를 2회 생성하고 diff 가 비는지 검증
	@$(MAKE) docs-clean
	@runs=$$(mktemp -d -t crudui-docs-verify.XXXXXX) && trap 'rm -rf "$$runs"' EXIT && \
	snapshot() { mkdir "$$runs/$$1" && cp -R docs/api "$$runs/$$1/api" && \
		cp -R docs/public/api "$$runs/$$1/native-api" && cp -R docs/.web/dist "$$runs/$$1/docs" && \
		cp schema/crudui.schema.json "$$runs/$$1/crudui.schema.json"; } && \
	$(MAKE) docs-web && snapshot run1 && $(MAKE) docs-web && snapshot run2 && \
	if diff -r "$$runs/run1" "$$runs/run2" > "$$runs/diff.txt" 2>&1; then \
		echo "[make] docs-verify-idempotent: OK — two runs produced identical deterministic output"; \
	else \
		echo "[make] docs-verify-idempotent: FAILED — outputs differ:"; \
		cat "$$runs/diff.txt"; \
		exit 1; \
	fi

# ----------------------------------------------------------------------------
# Validator throughput benchmark (tools/bench).
#
# Runs the four validators (JS/PHP/Go/Rust) over the same spec+input N times
# in-process and prints an ops/sec + avg-µs table, also written to
# tools/bench/results.md. Absolute times are machine-dependent — compare
# backends RELATIVELY within one spec. See tools/bench/README.md for the
# fairness method (startup excluded, same workload enforced, agreement gate).
# ----------------------------------------------------------------------------

bench-fixtures: ## 벤치 fixture JSON 재생성 (스펙 → spec/input JSON)
	node tools/bench/gen-fixtures.js

bench: cargo-downloads-check bench-fixtures ## 4언어 검증기 처리량 비교
	node tools/bench/run.js --iters $(BENCH_ITERS) --warmup $(BENCH_WARMUP)

bench-js: cargo-downloads-check bench-fixtures ## JS 검증기만 측정
	node tools/bench/run.js --only js --iters $(BENCH_ITERS) --warmup $(BENCH_WARMUP)

bench-php: cargo-downloads-check bench-fixtures ## PHP 검증기만 측정
	node tools/bench/run.js --only php --iters $(BENCH_ITERS) --warmup $(BENCH_WARMUP)

bench-go: cargo-downloads-check bench-fixtures ## Go 검증기만 측정
	node tools/bench/run.js --only go --iters $(BENCH_ITERS) --warmup $(BENCH_WARMUP)

bench-rust: cargo-downloads-check bench-fixtures ## Rust 검증기만 측정
	node tools/bench/run.js --only rust --iters $(BENCH_ITERS) --warmup $(BENCH_WARMUP)

# The JavaScript packages are built only when their sources or output changed; the
# extension build and the native suite both read the built packages. Every test runs through
# scripts/run-tests.mjs, which prints each test with its elapsed time and gives it its own
# timeout.
build-php-extension:
	node scripts/require-current-build.mjs
	node scripts/build-crudui-php-extension.mjs

# The native suites in three parts, which CI runs in three jobs (.github/workflows/ci.yml) and test-native runs in one
# command. test-php-engine compiles the C engine of the PHP extension with the C compiler and its sanitizers and needs
# no PHP; test-native-generators runs the Go and Rust generator suites, the widget and protocol tests and the shared
# suite for the JavaScript, HTML, Go and Rust targets and needs no PHP; test-php-api builds and loads the extension and
# runs the PHP generator suite, the PHP API tests and the shared suite for the PHP and native PHP targets, once for each
# PHP release of the CI matrix. Within a part every suite runs even when an earlier one fails, so one run reports every
# failure; any failure fails the target.
test-php-engine:
	node scripts/require-current-build.mjs
	node scripts/run-tests.mjs node -- packages/php-ext/tests/engine.test.mjs

test-native-generators: cargo-downloads-check
	node scripts/require-current-build.mjs
	@status=0; \
	node scripts/run-tests.mjs go --cwd packages/generator-go -- -race ./... || status=1; \
	node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/generator-rust/Cargo.toml || status=1; \
	node scripts/run-tests.mjs node -- tests/native-generators/protocol.test.mjs || status=1; \
	node scripts/run-tests.mjs node --timeout 60 -- tests/widget-scripts.test.mjs || status=1; \
	node tests/native-generators/run.mjs --target javascript,html,go,rust --report "$(NATIVE_REPORT)" || status=1; \
	exit $$status

test-php-api: build-php-extension
	# The root vendor/ holds the validator as a copy; refresh it from source before any check loads it, under the
	# checkout lock of that vendor directory, so two runs never reinstall it at once.
	node scripts/holder-lock.mjs hold "$(CURDIR)/var/locks/composer-vendor.lock" -- composer reinstall polyspec/crudui-validator --no-interaction
	@status=0; \
	node scripts/run-tests.mjs node -- tests/native-generators/php-extension-builder.test.mjs packages/php-ext/tests/api.test.mjs || status=1; \
	node scripts/run-tests.mjs phpunit --cwd packages/generator-php || status=1; \
	node tests/native-generators/run.mjs --extension "$(PHP_EXTENSION)" --target php,php-native --report "$(PHP_NATIVE_REPORT)" || status=1; \
	exit $$status

test-native:
	@status=0; \
	$(MAKE) --no-print-directory test-php-engine || status=1; \
	$(MAKE) --no-print-directory test-native-generators || status=1; \
	$(MAKE) --no-print-directory test-php-api || status=1; \
	exit $$status

test-validators: cargo-downloads-check
	@status=0; \
	node scripts/run-tests.mjs vitest --cwd packages/validator-ts || status=1; \
	node scripts/run-tests.mjs phpunit --cwd packages/validator-php || status=1; \
	node scripts/run-tests.mjs go --cwd packages/validator-go -- ./... || status=1; \
	node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml || status=1; \
	exit $$status

# The browser validation binding (docs/spec/form-runtime.md, "Browser validation"): data
# collection, timing, error markup parity with renderForm and the check in Chromium, Firefox and
# WebKit. It reads the built validator and renderers.
test-form-binding:
	node scripts/require-current-build.mjs
	$(NPM) test -w @polyspec/crudui-form-binding

# Every suite that records conformance evidence, then the check of that evidence against
# contracts/features.json (docs/spec/conformance.md). Every suite runs even when an earlier one
# fails, so the check reports every gap; any failure fails the target.
conformance: cargo-downloads-check
	rm -rf "$(CONFORMANCE_EVIDENCE)"
	@status=0; \
	export CRUDUI_CONFORMANCE_EVIDENCE="$(CONFORMANCE_EVIDENCE)"; \
	$(MAKE) --no-print-directory test-validators || status=1; \
	$(MAKE) --no-print-directory test-native || status=1; \
	$(NPM) run test:forms || status=1; \
	$(NPM) test --prefix examples/cross-check-console/server || status=1; \
	node scripts/check-conformance.mjs || status=1; \
	exit $$status

# Every Rust crate and Go file in the working tree (tracked, or new and not ignored) must match
# rustfmt and gofmt. Tracked files deleted from the working tree are skipped. Every crate and the Go
# files are checked even when an earlier check fails, so one run reports every difference.
WORKTREE_FILES = git ls-files --cached --others --exclude-standard $(1) | while read -r file; do [ -f "$$file" ] && echo "$$file"; done
format-check:
	@status=0; \
	for manifest in $$($(call WORKTREE_FILES,'*Cargo.toml')); do \
		node scripts/run-rust-command.mjs fmt --check --manifest-path "$$manifest" || status=1; \
	done; \
	unformatted="$$(gofmt -l $$($(call WORKTREE_FILES,'*.go')))"; \
	if [ -n "$$unformatted" ]; then echo "gofmt differences:"; echo "$$unformatted"; status=1; fi; \
	if [ $$status -eq 0 ]; then echo "[make] format-check: Rust crates and Go files are formatted"; fi; \
	exit $$status

# GitHub repository settings declared in .github/repository.json (docs/operations/repository.md), the ruleset main
# included: every change reaches main through a pull request and the merge queue. These targets act on the repository on
# GitHub, so neither make ci nor a CI job runs them.
github-settings: ## Apply the declared repository settings (idempotent)
	node scripts/github-repository.mjs apply

github-settings-check: ## Fail when the repository settings differ from the declaration
	node scripts/github-repository.mjs check

# The document and checklist rules that need Node.js alone and read no network: the job push-gate runs them on every
# pushed commit, so the check that the ruleset main requires fails a commit that breaks them. Both commands run even
# when the first fails.
records-check: ## Check the document pairs, links, changelog, writing and checklist rules with Node.js alone
	@status=0; \
	node scripts/check-documents.mjs || status=1; \
	node scripts/run-tests.mjs node --timeout 10 -- scripts/checklist-markers.test.mjs scripts/documentation-links.test.mjs tests/docs/changelog.test.mjs tests/docs/repository-writing.test.mjs tests/docs/example-readmes.test.mjs tests/docs/fixture-readmes.test.mjs || status=1; \
	exit $$status

# The pre-push hook of every push (scripts/push-gate.mjs): `make hooks` installs it, `make hooks-check` fails while
# core.hooksPath is not .githooks or the hook is not an executable file.
hooks: ## Install the tracked Git hooks (.githooks) and check them
	git config core.hooksPath .githooks
	node scripts/push-gate.mjs hooks-check

hooks-check: ## Fail when the pre-push hook is not installed
	node scripts/push-gate.mjs hooks-check

# The last job ci-passed of .github/workflows/ci.yml: RESULTS holds toJSON(needs), the results of every other job of the
# workflow, and the target fails unless each one is success (scripts/ci-passed.mjs). The ruleset main of
# .github/repository.json requires this check and push-gate.
ci-passed: ## Fail unless every job of RESULTS, the toJSON(needs) of the job ci-passed, succeeded
	node scripts/ci-passed.mjs

# The release of a pushed tag, run by .github/workflows/release.yml in this order (scripts/release.mjs, AGENTS.md). The
# workflow sets TAG in the environment and each recipe passes it as "$$TAG", so the name of a tag never becomes shell
# text; verify reads the repository from GITHUB_REPOSITORY, and gh reads GH_TOKEN. release-verify requires the commit
# of the tag on origin/main with the check runs push-gate and ci-passed concluded success; release-versions the version
# of the tag in every package file that the tag covers and the section ## X.Y.Z of CHANGELOG.md; release-assets runs
# make build and writes the npm tarballs and Composer zips of packages/ to var/release/assets, and a Go module tag
# builds and attaches nothing; release-publish creates the GitHub Release with that section as its notes.
release-verify: ## Check that the commit of TAG is on main and its checks push-gate and ci-passed succeeded
	$(if $(TAG),,$(error make $@ needs TAG=<tag>, a tag vX.Y.Z or <directory>/vX.Y.Z))
	node scripts/release.mjs verify "$$TAG"

release-versions: ## Check the version of TAG in every package file that it covers and the change log section
	$(if $(TAG),,$(error make $@ needs TAG=<tag>, a tag vX.Y.Z or <directory>/vX.Y.Z))
	node scripts/release.mjs versions "$$TAG"

release-assets: ## Build the packages and write the npm and Composer archives of TAG to var/release/assets
	$(if $(TAG),,$(error make $@ needs TAG=<tag>, a tag vX.Y.Z or <directory>/vX.Y.Z))
	node scripts/release.mjs assets "$$TAG"

# The install of the archives of var/release/assets as a consumer installs them, from the fixtures of
# tests/release-install (scripts/release-install.mjs): npm ci and composer install with empty caches and the scope
# @polyspec on an unreachable registry. release-install-lock writes the fixtures of the version of package.json and
# regenerates their locks from the archives; `make release-assets TAG=vX.Y.Z RELEASE_COMMIT=HEAD` writes the archives
# of a release commit before its tag exists.
release-install-check: ## Install the archives of TAG from var/release/assets with the consumer fixtures of tests/release-install
	$(if $(TAG),,$(error make $@ needs TAG=<tag>, a tag vX.Y.Z or <directory>/vX.Y.Z))
	$(ONLINE) node scripts/release-install.mjs check "$$TAG"

# The same install in CI, before any tag: the archives of HEAD at the version of package.json, written as
# release-assets writes them, then release-install-check.
release-install-head: ## Write the archives of HEAD at the version of package.json and install them from the consumer fixtures
	RELEASE_COMMIT=HEAD node scripts/release.mjs assets "v$$(node -p "require('./package.json').version")"
	$(ONLINE) node scripts/release-install.mjs check

release-install-lock: ## Write the consumer fixtures of tests/release-install and regenerate their locks from var/release/assets
	$(ONLINE) node scripts/release-install.mjs lock

release-publish: ## Create the GitHub Release of TAG with its change log section and archives
	$(if $(TAG),,$(error make $@ needs TAG=<tag>, a tag vX.Y.Z or <directory>/vX.Y.Z))
	node scripts/release.mjs publish "$$TAG"

# The push check of .github/workflows/push-gate.yml: the checked-out commit has no checklist task in progress and tracks
# the hook.
push-gate-check: ## Fail when the checked-out commit has a checklist task in progress or does not track the pre-push hook
	node scripts/push-gate.mjs commit HEAD

# Every command the CI workflow runs after installing tools and dependencies, in workflow order,
# with the conformance evidence collected and checked like the final CI job
# (tests/build/ci-local.test.mjs keeps this list equal to .github/workflows/ci.yml).
CI_COMMANDS = \
	'make test-runtimes' \
	'make test-dependencies' \
	'make build' \
	'make lint' \
	'make typecheck' \
	'make test-ordered-json' \
	'make release-install-head' \
	'make test-validator-js' \
	'make test-validator-php' \
	'make test-validator-go' \
	'make test-validator-rust' \
	'make test-validator-python' \
	'make test-generator-python' \
	'make docs-check' \
	'make build-php-extension' \
	'make test-cross-check' \
	'make manifest-test' \
	'make require-build' \
	'make test-cli' \
	'make manifest-check' \
	'make manifest-docs-check' \
	'make test-forms' \
	'make test-form-comparison' \
	'make test-form-comparison-pipeline' \
	'make test-form-comparison-browser' \
	'make test-form-comparison-summary' \
	'make test-packages' \
	'make test-build' \
	'make test-build-repeat' \
	'make test-inspector' \
	'make test-php-engine' \
	'make test-native-generators' \
	'make test-bench' \
	'make test-php-api' \
	'make check-conformance'

# `make ci` runs CI_COMMANDS through the guard scripts/full-run.mjs, which refuses while a checklist task is [~], while
# tracked changes are uncommitted or when var/full-run.json records a run of the current tree, removes the conformance
# evidence of earlier runs, runs each command with `sh -c` to its end and records its result; `make rerun-failed` reruns
# the commands of the current tree that did not pass and keeps the evidence of those that passed.
ci: ## Run every command of the CI workflow in order through the guard: once per tree, when no checklist task is [~]
	CRUDUI_CONFORMANCE_EVIDENCE="$(CONFORMANCE_EVIDENCE)" node scripts/full-run.mjs run $(CI_COMMANDS)

rerun-failed: ## Rerun only the commands of make ci that did not pass on the current tree
	CRUDUI_CONFORMANCE_EVIDENCE="$(CONFORMANCE_EVIDENCE)" node scripts/full-run.mjs rerun-failed
