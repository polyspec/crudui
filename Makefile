# CRUDUI documentation pipeline.
#
# User entry point for all documentation generation. npm scripts, API Extractor and API Documenter,
# cargo doc, and go doc are building blocks invoked from here.
#
# Everything is idempotent: generation targets clean before they generate, and
# the generators emit deterministic output (no timestamps, no commit hashes, no
# machine-absolute paths). `make docs` run twice yields identical output.

.DEFAULT_GOAL := help
# The tools of this checkout: `make install-tools TOOLS=npm` installs the npm of packageManager and mise into var/tools/bin,
# and `make install-tools` installs the tools of mise.lock into var/tools/mise, whose shims kit.mk puts first on PATH with
# var/tools/bin, so every command of make finds them. The tools of the machine are never changed.
export PATH := $(CURDIR)/var/tools/bin:$(PATH)
# GNU Make 3.81 looks up the program of a recipe line without shell syntax on the PATH that make started with, not on the
# exported one, so every recipe starts npm by its path (tests/build/tool-path.test.mts).
NPM := $(CURDIR)/var/tools/bin/npm
# The exact toolchains of the checkout (docs/operations/package-build.md): rustup runs the toolchain of rust-toolchain.toml and
# never installs one on the first cargo, which fails with rustup's message naming `rustup toolchain install`; go runs the
# installed release and never downloads the toolchain of a go.mod. `make install` installs them.
export RUSTUP_AUTO_INSTALL := 0
export GOTOOLCHAIN := local
# A check reads no network (docs/operations/package-build.md, "Offline checks"): every recipe and the scripts that it starts
# run cargo, go, npm and Composer offline, so a missing download fails at once instead of reaching a registry in one run
# and not in another. The targets that download, install-tools, crudui-install-crates, dependency-review
# and release-consumer-lock, and the downloads of install run their commands with $(ONLINE); cargo-downloads-check
# (the kit.mk of @polyspec/kit) names make install for a missing crate.
export CARGO_NET_OFFLINE := true
export GOPROXY := off
export npm_config_offline := true
export COMPOSER_DISABLE_NETWORK := 1
ONLINE := env -u CARGO_NET_OFFLINE -u GOPROXY -u npm_config_offline -u COMPOSER_DISABLE_NETWORK
.PHONY: help release-assets form-template-validator form-template-validator-check install crudui-install crudui-install-go-modules crudui-install-composer crudui-install-python crudui-install-phpdocumentor crudui-install-browsers check-ci-browser crudui-test-runtimes crudui-test-dependencies crudui-build crudui-lint crudui-docs-check build lint typecheck crudui-test-validator-js crudui-test-validator-php crudui-test-validator-go crudui-test-validator-rust crudui-test-validator-python crudui-test-generator-python crudui-test-cross-check manifest-test require-build crudui-test-cli manifest-check manifest-docs-check crudui-test-forms crudui-test-form-comparison crudui-test-form-comparison-pipeline crudui-test-form-comparison-checks crudui-test-form-comparison-browser crudui-test-form-comparison-summary crudui-test-packages crudui-test-build crudui-test-build-repeat crudui-test-inspector crudui-test-bench check-conformance crudui-install-crates crudui-install-svelte-tools docs docs-api docs-schema docs-web docs-dev docs-preview docs-clean docs-check docs-check-documents docs-check-libs docs-verify-idempotent bench bench-fixtures bench-js bench-php bench-go bench-rust crudui-test-php-engine crudui-test-native-generators crudui-test-php-api crudui-test-native crudui-test-validators crudui-test-form-binding conformance format-check records-check
.NOTPARALLEL: docs docs-web docs-dev docs-preview docs-check docs-verify-idempotent

# The tools that every polyspec repository shares are the package @polyspec/kit of package-lock.json. The copy
# scripts/kit/kit-bootstrap.mk (make kit-sync) includes its kit.mk and sets KIT to the directory of its tools; a change to
# them is made in polyspec/kit, never here.
include ../kit/scripts/kit/kit-bootstrap.mk

# Validator benchmark iteration counts (override on the command line, e.g.
# `make bench BENCH_ITERS=100000`).
BENCH_ITERS  ?= 50000
BENCH_WARMUP ?= 5000
PHP_EXTENSION ?= $(CURDIR)/var/php-ext/polyspec_crudui.so
# Reports live in the Git directory, which is a file-referenced directory in a worktree: NATIVE_REPORT of the JavaScript,
# HTML, Go and Rust targets and PHP_NATIVE_REPORT of the PHP and native PHP targets of tests/native-generators/run.mts.
NATIVE_REPORT ?= $(shell git rev-parse --git-path native-generators/report.json)
PHP_NATIVE_REPORT ?= $(shell git rev-parse --git-path native-generators/report-php.json)
CONFORMANCE_EVIDENCE ?= $(abspath $(shell git rev-parse --git-path conformance-evidence))
# The virtual environment of the Python packages (S3): make crudui-install-python makes it from the Python of mise.toml with
# python-venv of kit and syncs the uv workspace of the root pyproject.toml into it, so the suites, the native generator
# program and the cross-check console import the installed packages and change no sys.path.
PYTHON_VENV := $(CURDIR)/var/python
# install-link (kit) links the Python packages in the environment that crudui-install-python makes: kit's link reads
# UV_PROJECT_ENVIRONMENT, and without it the link finds no environment of the repository and fails (K360-2).
install-link: export UV_PROJECT_ENVIRONMENT := $(PYTHON_VENV)
UV := $(KIT_TOOLS)/mise/shims/uv
# The go and Composer of mise.toml, by the absolute paths of their shims: make 3.81 runs a recipe line without shell syntax
# from the PATH that make started with (kit K171).
GO := $(KIT_TOOLS)/mise/shims/go
COMPOSER_BIN := $(KIT_TOOLS)/mise/shims/composer
export CRUDUI_PYTHON := $(PYTHON_VENV)/bin/python
help: ## 타겟 설명
	@echo "CRUDUI docs — make targets:"
	@echo ""
	@echo "  make install               Install the recorded npm, the npm, Composer and Cargo dependencies, the Rust toolchain and phpDocumentor"
	@echo "  make crudui-install-crates        Download the crates of every Cargo.lock and the OrderedJSON checkout that one reads"
	@echo "  make install-tools         Install the npm, Go and cargo-audit releases that the checkout declares into var/tools"
	@echo "  make toolchain-check       Fail when a tool does not run at the version that the checkout records"
	@echo "  make dependency-review     Ask the registries for newer stable releases and advisories; RECORD=1 records, UPDATE=1 updates first"
	@echo "  make dependency-policy-check  Check the manifests and locks against config/dependency-policy.json and the review record"
	@echo "  make owner-check           Run the owner checks of the changed paths (config/owner-checks.json); PATHS or BASE select the paths"
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
	@echo "  make build-php-ext                Build the native PHP module with phpize (kit)"
	@echo "  make crudui-test-php-engine       Test the C engine of the native PHP module with the C compiler and its sanitizers"
	@echo "  make crudui-test-native-generators  Test the Go and Rust generators and compare JavaScript, HTML, Go and Rust generation"
	@echo "  make crudui-test-php-api          Build the native PHP module, test its PHP API and compare PHP and native PHP generation"
	@echo "  make crudui-test-native           Run crudui-test-php-engine, crudui-test-native-generators and crudui-test-php-api"
	@echo "  make crudui-test-validators       Test the JavaScript, PHP, Go and Rust validators"
	@echo "  make crudui-test-form-binding     Test the browser validation binding, its markup parity and three browsers"
	@echo "  make conformance           Run every conformance suite and check the evidence against the standard"
	@echo "  make format-check          Fail when any Rust crate or Go file is not formatted"
	@echo "  make records-check         The document and checklist rules that need Node.js alone"
	@echo ""
	@echo "CRUDUI validator benchmark — make targets:"
	@echo ""
	@echo "  make bench                 4언어(JS/PHP/Go/Rust) 처리량 비교 (ops/sec + avg µs 표 → benchmarks/validators/results.md)"
	@echo "  make bench-js              JS 검증기만 측정"
	@echo "  make bench-php             PHP 검증기만 측정"
	@echo "  make bench-go              Go 검증기만 측정"
	@echo "  make bench-rust            Rust 검증기만 측정"
	@echo "  make bench-fixtures        벤치 스펙+입력 fixture JSON 재생성"
	@echo "  (반복수 조절: make bench BENCH_ITERS=100000 BENCH_WARMUP=10000)"
	@echo "  주의: 절대시간은 머신 의존 — 같은 스펙 안에서 백엔드 간 비율만 비교하라."
	@echo ""

# The npm, Go and cargo-audit releases that the checkout declares into var/tools and the Rust toolchain of rust-toolchain.toml
# (install-tools of the kit.mk of @polyspec/kit), the dependencies of the lock files, the crates of every Cargo.lock, the OrderedJSON
# checkout of the comparison and the phpDocumentor release that scripts/install-phpdocumentor.mts checks by its SHA-256.
# PHP is installed at the minor of config/toolchain.json by the machine's package manager; Node.js, Python, Go and
# Composer are the tools of mise.toml in var/tools. `make toolchain-check` names every tool at another version.
install: crudui-install ## Install the declared tools with the Rust toolchain, the npm, Composer, Python and Cargo dependencies and phpDocumentor

# crudui-install is the repository step of install: it runs after install-kit, the bootstrap of kit (K246-2). composer install
# writes vendor/composer/platform_check.php from the tracked composer.lock, which demands the PHP of the released polyspec
# packages; install-link, which install runs again at its end, points them at the sibling checkouts and writes the check for the
# PHP of .php-version, so it runs before phpDocumentor, the first step that runs PHP, and after the Python install it needs.
crudui-install: install-kit crudui-install-python crudui-install-composer install-link crudui-install-crates crudui-install-go-modules crudui-install-phpdocumentor crudui-install-browsers

# The parts of make install, which the CI jobs run for what they check: every CI step runs a make target, so the recipes
# start every tool with the offline settings, $(NPM) and the toolchains of the checkout. install-packages of
# kit-bootstrap.mk installs package-lock.json with the npm of var/tools (make install-tools TOOLS=npm).
# .npmrc sets strict-allow-scripts, so an install script that allowScripts of package.json does not approve fails the install.
# install-packages runs crudui-install-svelte-tools after its npm ci (INSTALL_PACKAGES_EXTRA, K428); make install links
# after install-packages through install-link.

# The extra lock projects that install-packages installs after its npm ci (K428): the tools of packages/svelte.
INSTALL_PACKAGES_EXTRA := crudui-install-svelte-tools

# The tools of packages/svelte that need the TypeScript 6 API (svelte-check, @sveltejs/package and the Svelte lint)
# are a project of their own outside the npm workspaces, so that no package that npm hoists to the root reaches the
# TypeScript 7 of the root (C14.4).
crudui-install-svelte-tools: ## Install the tools project of packages/svelte from its package-lock.json; ONLINE
	$(ONLINE) $(NPM) ci --prefix packages/svelte/tools --no-audit --no-fund

# The development root composer.json, never published, resolves the Composer packages of packages/: its path
# repositories link polyspec/crudui-validator and polyspec/crudui-generator into vendor/, each loaded by its own autoload,
# and its artifact repository var/composer-artifacts holds the release zip of polyspec/ordered-json that
# config/release-assets.json pins, which make release-assets-fetch of kit downloads first.
# COMPOSER selects the native manifest; composer.local.json resolves sibling sources and composer.json resolves archives.
ifeq ($(notdir $(or $(COMPOSER),composer.json)),composer.json)
crudui-install-composer: release-assets-fetch
endif
crudui-install-composer: ## Install the native Composer manifest selected by COMPOSER into vendor/
ifeq ($(notdir $(COMPOSER)),composer.local.json)
	$(ONLINE) $(COMPOSER_BIN) update 'polyspec/*' --with-dependencies --no-interaction
else
	$(ONLINE) $(COMPOSER_BIN) install --no-interaction --prefer-dist
endif

crudui-local-composer-check: ## Validate the native local-source manifest, lock and PHP platform requirements
	@status=0; \
	COMPOSER=composer.local.json $(COMPOSER_BIN) validate --strict || status=1; \
	COMPOSER=composer.local.json $(COMPOSER_BIN) check-platform-reqs || status=1; \
	exit $$status

crudui-install-python: ## Make the venv var/python and install the Python packages of the uv workspace into it in editable mode
	$(MAKE) --no-print-directory python-venv DIR=$(PYTHON_VENV)
	UV_PROJECT_ENVIRONMENT=$(PYTHON_VENV) $(ONLINE) $(UV) sync --quiet --locked --all-packages

crudui-install-phpdocumentor: ## Install the phpDocumentor release that scripts/install-phpdocumentor.mts checks by its SHA-256
	$(ONLINE) $(NODE) scripts/install-phpdocumentor.mts

# The browsers that puppeteer and playwright pin (scripts/install-browsers.mts); BROWSERS names the browsers and options.
BROWSERS ?= chrome firefox webkit
crudui-install-browsers: ## Install the pinned browsers of BROWSERS (chrome firefox webkit) into the checkout
	$(ONLINE) $(NODE) scripts/install-browsers.mts $(BROWSERS)

check-ci-browser: ## Check that the pinned Chrome runs sandboxed
	$(NODE) scripts/check-ci-browser.mts

# The crates of every Cargo.lock; a CI job that runs a target with cargo-downloads-check runs it.
crudui-install-crates: cargo-downloads-fetch ## Download the crates of every Cargo.lock

# The modules that the Go workspace of go.work requires, downloaded into the module cache with go mod download at its
# root: the Go checks run with GOPROXY=off and read only that cache (C14.18). A CI job that runs Go runs it after make
# install-tools.
crudui-install-go-modules: ## Download the modules that the Go workspace requires; ONLINE
	$(ONLINE) $(GO) mod download

# The checking commands of the CI workflow, one target each (CI_TARGETS).
crudui-test-runtimes: ## Exact runtime versions and test standards
	$(NPM) run test:runtimes
crudui-test-dependencies: ## The dependency graph, the dependency policy and its recorded review
	@status=0; \
	$(MAKE) --no-print-directory dependency-policy-check || status=1; \
	$(MAKE) --no-print-directory dependency-policy-mutation-check || status=1; \
	$(NPM) run test:dependencies || status=1; \
	exit $$status
# The validator of the compiled form template of packages/generator/ts is ajv's standalone validation code of
# contracts/schema/form-template.schema.json (C14.38): make form-template-validator generates
# packages/generator/ts/src/form-template-validator.mjs, and the build checks that it is current, so the package has no
# runtime dependency on ajv and compiles no schema at run time.
build: crudui-build ## Build the JavaScript packages
crudui-build: form-template-validator-check build-php-ext
	$(NPM) run build
form-template-validator: ## Generate the form template validator of packages/generator/ts from its JSON Schema
	$(NODE) scripts/generate-form-template-validator.mts
form-template-validator-check: ## Check that the form template validator of packages/generator/ts is current
	$(NODE) scripts/generate-form-template-validator.mts --check
# make lint-ts of kit lints every TypeScript and JavaScript source with oxlint, knip and API Extractor; oxlint has no Svelte
# rules, so the components of packages/svelte are linted by the ESLint of that workspace. Both run after a failure.
lint: crudui-lint ## Lint the repository: make lint-ts of kit and the Svelte components
crudui-lint:
	@status=0; \
	$(NODE) $(KIT)/lint-ts.$(KIT_EXT) || status=1; \
	$(NPM) run lint -w @polyspec/crudui-generator-svelte || status=1; \
	exit $$status
# The root tsconfig.json checks the TypeScript of scripts/ and tests/ (S9 of kit) strictly. It sets skipLibCheck: the
# declarations that @tailwindcss/node 4.3.3 publishes import seven modules (./ast, ./candidate, ...) that the package does
# not ship, so a check of the declaration files of node_modules fails on that package and not on this code.
typecheck: ## Type-check every TypeScript package, the TypeScript of scripts/ and tests/ with the root tsconfig.json, and the form comparison
	$(NPM) run typecheck
	node_modules/.bin/tsc -p tsconfig.json
	node_modules/.bin/tsc -p examples/form-comparison/src/tsconfig.json
crudui-test-validator-js: ## The TypeScript validator suite
	$(NPM) test -w @polyspec/crudui-validator
crudui-test-validator-php: ## The PHP validator suite
	$(COMPOSER_BIN) --working-dir=packages/validator/php test
crudui-test-validator-go: ## The Go validator suite
	$(NODE) tests/conformance/run-suite.mts go --cwd packages/validator/go -- ./...
crudui-test-validator-rust: cargo-downloads-check ## The Rust validator suite
	$(NODE) tests/conformance/run-suite.mts cargo -- --locked --manifest-path packages/validator/rust/Cargo.toml
crudui-test-validator-python: ## The Python validator suite
	$(NODE) tests/conformance/run-suite.mts python --venv $(PYTHON_VENV) --cwd packages/validator/python -- discover -s tests -t .
crudui-test-generator-python: ## The Python generator suite
	$(NODE) tests/conformance/run-suite.mts python --venv $(PYTHON_VENV) --cwd packages/generator/python -- discover -s tests -t .
crudui-test-cross-check: cargo-downloads-check ## The cross-check console gateway conformance
	$(NPM) test --prefix examples/cross-check-console/server
manifest-test: cargo-downloads-check ## The verification commands of the feature contracts
	$(NPM) run manifest:test
require-build: ## Build the packages when their sources or output changed
	$(NODE) scripts/require-current-build.mts
crudui-test-cli: ## The command-line interface suite
	$(NODE) scripts/require-current-build.mts
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) vitest --cwd packages/cli
manifest-check: ## The feature contract manifest
	$(NPM) run manifest:check
manifest-docs-check: ## The generated feature contract documents
	$(NPM) run manifest:docs:check
crudui-test-forms: ## Form instances, renderers and the browser checks
	$(NPM) run test:forms
crudui-test-form-comparison: ## The form comparison runner regressions
	$(NPM) run test:form-comparison
crudui-test-form-comparison-pipeline: cargo-downloads-check ## The record stores and the canonical flow
	$(NPM) run test:form-comparison:pipeline
crudui-test-form-comparison-checks: cargo-downloads-check ## The PHP modes, generation, persistence, flow, browser and typing checks against a local stack
	$(NPM) run test:form-comparison:checks
# The same checks in two parts, as CI runs them: crudui-test-form-comparison-browser runs the browser checks of the servers of
# FORM_SERVERS against a local stack and keeps their reports in FORM_BROWSER_REPORTS; crudui-test-form-comparison-summary runs
# every other check against a local stack of its own and summarizes those reports. Every public server takes a port of
# the system, so runs at the same time do not collide; the summary requires the scheme and host of every report.
FORM_SERVERS ?= php,php-ext,go,rust
FORM_BROWSER_REPORTS ?= $(CURDIR)/var/form-comparison/browser
crudui-test-form-comparison-browser: cargo-downloads-check ## The browser checks of the servers of FORM_SERVERS against a local stack
	$(NPM) run test:form-comparison:checks -- --servers $(FORM_SERVERS) --results $(FORM_BROWSER_REPORTS)
crudui-test-form-comparison-summary: cargo-downloads-check ## Every other check against a local stack, with the browser reports of FORM_BROWSER_REPORTS
	$(NPM) run test:form-comparison:checks -- --browser-reports $(FORM_BROWSER_REPORTS)
crudui-test-packages: ## The package install check
	$(NPM) run test:packages
crudui-test-build: ## The public builds
	$(NPM) run test:build
crudui-test-build-repeat: ## The reproducible build
	$(NPM) run test:build:repeat
crudui-test-inspector: ## The browser inspector
	$(NPM) run test:inspector
crudui-test-bench: cargo-downloads-check ## The benchmark drivers
	$(NPM) run test:bench
check-conformance: ## The conformance evidence against contracts/features.json
	$(NODE) scripts/check-conformance.mts

# The owner checks run the checks of the changed paths (config/owner-checks.json), some of which run cargo; make -k skips
# them while a crate is missing.
owner-check: cargo-downloads-check

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

# crudui-docs-check is the repository's doc-coverage gate (documents AND library packages; either arm RED → non-zero exit).
# kit's docs-check runs it through the DOCS_CHECKS hook, with check-documents and every other DOCS_CHECKS target, each regardless of the others.
DOCS_CHECKS += crudui-docs-check
crudui-docs-check: ## doc-coverage 게이트 (문서 + 라이브러리, 미문서화 → 비0 exit)
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
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) node -- scripts/gen-api-docs.test.mts scripts/check-doc-coverage.test.mts scripts/php-doc-coverage.test.mts scripts/json-schema.test.mts || status=1; \
	$(NPM) run test:docs || status=1; \
	$(NPM) run docs:build || status=1; \
	exit $$status

docs-check-libs: cargo-downloads-check ## 라이브러리 packages/* doc-coverage
	$(NPM) run docs:check

docs-clean: ## 생성물 전부 제거
	rm -rf docs/api docs/public/api
	rm -rf docs/.web
	rm -rf packages/validator/rust/target/doc
	rm -rf var/phpdocumentor/cache
	@echo "[make] docs-clean: removed generated docs/api, dist, rustdoc, phpdoc cache"

# Generate twice and compare Markdown, native API assets and the schema. The snapshots and the
# difference go to a directory that this run creates with mktemp and removes at its exit, so
# runs of other checkouts do not overwrite them.
docs-verify-idempotent: ## docs 를 2회 생성하고 diff 가 비는지 검증
	@$(MAKE) docs-clean
	@runs=$$(mktemp -d -t crudui-docs-verify.XXXXXX) && trap 'rm -rf "$$runs"' EXIT && \
	snapshot() { mkdir "$$runs/$$1" && cp -R docs/api "$$runs/$$1/api" && \
		cp -R docs/public/api "$$runs/$$1/native-api" && cp -R docs/.web/dist "$$runs/$$1/docs" && \
		cp contracts/schema/crudui.schema.json "$$runs/$$1/crudui.schema.json"; } && \
	$(MAKE) docs-web && snapshot run1 && $(MAKE) docs-web && snapshot run2 && \
	if diff -r "$$runs/run1" "$$runs/run2" > "$$runs/diff.txt" 2>&1; then \
		echo "[make] docs-verify-idempotent: OK — two runs produced identical deterministic output"; \
	else \
		echo "[make] docs-verify-idempotent: FAILED — outputs differ:"; \
		cat "$$runs/diff.txt"; \
		exit 1; \
	fi

# ----------------------------------------------------------------------------
# Validator throughput benchmark (benchmarks/validators).
#
# Runs the four validators (JS/PHP/Go/Rust) over the same spec+input N times
# in-process and prints an ops/sec + avg-µs table, also written to
# benchmarks/validators/results.md. Absolute times are machine-dependent — compare
# backends RELATIVELY within one spec. See benchmarks/validators/README.md for the
# fairness method (startup excluded, same workload enforced, agreement gate).
# ----------------------------------------------------------------------------

bench-fixtures: ## 벤치 fixture JSON 재생성 (스펙 → spec/input JSON)
	$(NODE) benchmarks/validators/gen-fixtures.js

bench: cargo-downloads-check bench-fixtures ## 4언어 검증기 처리량 비교
	$(NODE) benchmarks/validators/run.js --iters $(BENCH_ITERS) --warmup $(BENCH_WARMUP)

bench-js: cargo-downloads-check bench-fixtures ## JS 검증기만 측정
	$(NODE) benchmarks/validators/run.js --only js --iters $(BENCH_ITERS) --warmup $(BENCH_WARMUP)

bench-php: cargo-downloads-check bench-fixtures ## PHP 검증기만 측정
	$(NODE) benchmarks/validators/run.js --only php --iters $(BENCH_ITERS) --warmup $(BENCH_WARMUP)

bench-go: cargo-downloads-check bench-fixtures ## Go 검증기만 측정
	$(NODE) benchmarks/validators/run.js --only go --iters $(BENCH_ITERS) --warmup $(BENCH_WARMUP)

bench-rust: cargo-downloads-check bench-fixtures ## Rust 검증기만 측정
	$(NODE) benchmarks/validators/run.js --only rust --iters $(BENCH_ITERS) --warmup $(BENCH_WARMUP)

# The native suites in three parts, which CI runs in three jobs (.github/workflows/ci.yml) and crudui-test-native runs in one
# command. crudui-test-php-engine compiles the C engine of the PHP extension with the C compiler and its sanitizers, with the
# contract tests of packages/php-ext/tests/contract that the parity units bind for the extension (K422), and needs no PHP; crudui-test-native-generators runs the Go and Rust generator suites, the widget and protocol tests and the shared
# suite for the JavaScript, HTML, Go and Rust targets and needs no PHP; crudui-test-php-api builds and loads the extension and
# runs the PHP generator suite, the PHP API tests and the shared suite for the PHP and native PHP targets, once for each
# PHP release of the CI matrix. Within a part every suite runs even when an earlier one fails, so one run reports every
# failure; any failure fails the target.
crudui-test-php-engine:
	$(NODE) scripts/require-current-build.mts
	$(NODE) tests/conformance/run-suite.mts node -- packages/php-ext/tests/engine/engine.test.mjs packages/php-ext/tests/contract/*.test.mjs packages/php-ext/tests/comparison/comparison.test.mjs

crudui-test-native-generators: cargo-downloads-check
	$(NODE) scripts/require-current-build.mts
	@status=0; \
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) go --cwd packages/generator/go -- -race ./... || status=1; \
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) cargo -- --locked --manifest-path packages/generator/rust/Cargo.toml || status=1; \
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) node -- tests/native-generators/protocol.test.mts || status=1; \
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) node --timeout 60 -- tests/widget-scripts.test.mts || status=1; \
	$(NODE) tests/native-generators/run.mts --target javascript,html,go,rust,python --report "$(NATIVE_REPORT)" || status=1; \
	exit $$status

crudui-test-php-api: require-build build-php-ext
	@status=0; \
	PHP_EXTENSION="$(PHP_EXTENSION)" $(NODE) tests/conformance/run-suite.mts phpunit --cwd packages/php-ext || status=1; \
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) phpunit --cwd packages/generator/php || status=1; \
	$(NODE) tests/native-generators/run.mts --extension "$(PHP_EXTENSION)" --target php,php-native --report "$(PHP_NATIVE_REPORT)" || status=1; \
	exit $$status

crudui-test-native:
	@status=0; \
	$(MAKE) --no-print-directory crudui-test-php-engine || status=1; \
	$(MAKE) --no-print-directory crudui-test-native-generators || status=1; \
	$(MAKE) --no-print-directory crudui-test-php-api || status=1; \
	exit $$status

crudui-test-validators: cargo-downloads-check
	@status=0; \
	$(NODE) tests/conformance/run-suite.mts vitest --cwd packages/validator/ts || status=1; \
	$(NODE) tests/conformance/run-suite.mts phpunit --cwd packages/validator/php || status=1; \
	$(NODE) tests/conformance/run-suite.mts go --cwd packages/validator/go -- ./... || status=1; \
	$(NODE) tests/conformance/run-suite.mts cargo -- --locked --manifest-path packages/validator/rust/Cargo.toml || status=1; \
	exit $$status

# The browser validation binding (docs/spec/form-runtime.md, "Browser validation"): data
# collection, timing, error markup parity with renderForm and the check in Chromium, Firefox and
# WebKit. It reads the built validator and renderers.
crudui-test-form-binding:
	$(NODE) scripts/require-current-build.mts
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) vitest --cwd packages/form-binding

# Every suite that records conformance evidence, then the check of that evidence against
# contracts/features.json (docs/operations/conformance.md). Every suite runs even when an earlier one
# fails, so the check reports every gap; any failure fails the target.
conformance: cargo-downloads-check
	rm -rf "$(CONFORMANCE_EVIDENCE)"
	@status=0; \
	export CRUDUI_CONFORMANCE_EVIDENCE="$(CONFORMANCE_EVIDENCE)"; \
	$(MAKE) --no-print-directory crudui-test-validators || status=1; \
	$(MAKE) --no-print-directory crudui-test-native || status=1; \
	$(NPM) run test:forms || status=1; \
	$(NPM) test --prefix examples/cross-check-console/server || status=1; \
	$(NODE) scripts/check-conformance.mts || status=1; \
	exit $$status

# Every Rust crate and Go file in the working tree (tracked, or new and not ignored) must match
# rustfmt and gofmt. Tracked files deleted from the working tree are skipped. Every crate and the Go
# files are checked even when an earlier check fails, so one run reports every difference.
WORKTREE_FILES = git ls-files --cached --others --exclude-standard $(1) | while read -r file; do [ -f "$$file" ] && echo "$$file"; done
format-check:
	@status=0; \
	for manifest in $$($(call WORKTREE_FILES,'*Cargo.toml')); do \
		$(NODE) scripts/run-rust-command.mts fmt --check --manifest-path "$$manifest" || status=1; \
	done; \
	unformatted="$$(gofmt -l $$($(call WORKTREE_FILES,'*.go')))"; \
	if [ -n "$$unformatted" ]; then echo "gofmt differences:"; echo "$$unformatted"; status=1; fi; \
	if [ $$status -eq 0 ]; then echo "[make] format-check: Rust crates and Go files are formatted"; fi; \
	exit $$status

# The document and checklist rules that need Node.js alone and read no network: the job push-gate runs them on every
# pushed commit. Both commands run even when the first fails.
records-check: ## Check the document pairs, links, changelog, writing and checklist rules with Node.js alone
	@status=0; \
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) node --timeout 10 -- scripts/documentation-links.test.mts tests/docs/changelog.test.mts tests/docs/repository-writing.test.mts tests/docs/example-readmes.test.mts tests/docs/fixture-readmes.test.mts || status=1; \
	exit $$status

# The release steps are the targets of the kit.mk of @polyspec/kit, run by .github/workflows/release.yml in this order: release-verify,
# release-versions, release-assets, release-consumer, release-publish (docs/operations/repository.md, "Releases"). The
# archives of the npm packages hold their dist directories, so the packages are built before the archives are written.
release-assets: build

# Every target the CI workflow runs after installing tools and dependencies, in workflow order
# (tests/build/ci-local.test.mts keeps this list equal to .github/workflows/ci.yml).
CI_TARGETS = \
	crudui-test-runtimes \
	crudui-test-dependencies \
	build \
	lint \
	lint-python \
	lint-php \
	lint-rust \
	lint-go \
	typecheck \
	hooks-check \
	crudui-test-validator-js \
	crudui-test-validator-php \
	crudui-test-validator-go \
	crudui-test-validator-rust \
	crudui-test-validator-python \
	crudui-test-generator-python \
	docs-check \
	build-php-ext \
	crudui-test-cross-check \
	manifest-test \
	require-build \
	crudui-test-cli \
	manifest-check \
	manifest-docs-check \
	crudui-test-forms \
	crudui-test-form-comparison \
	crudui-test-form-comparison-pipeline \
	crudui-test-form-comparison-browser \
	crudui-test-form-comparison-summary \
	crudui-test-packages \
	crudui-test-build \
	crudui-test-build-repeat \
	crudui-test-inspector \
	crudui-test-php-engine \
	crudui-test-native-generators \
	crudui-test-bench \
	crudui-test-php-api \
	check-conformance

# The gates of kit that this checkout runs (kit-gates of kit.mk); kit-check fails for a gate that this list leaves out.
CHECK_TARGETS = \
	kit-check \
	toolchain-check \
	layout-check \
	docs-check \
	rules-check \
	owner-validate \
	rebuild-check \
	language-check \
	test-markers-check \
	duplication-check \
	dependency-policy-check \
	parity-declarations-check \
	parity-check \
	commits-check \
	link-check \
	link-metadata-check \
	divergence-check \
	link-state-check \
	bypass-check \
	suppression-check \
	lint-ts \
	lint-php \
	lint-python \
	lint-go \
	lint-rust \
	lint-php-ext \
	test-php-ext

# Production imports are resolved from each package's own runtime dependencies.
.PHONY: production-dependencies-check
lint-ts: production-dependencies-check
production-dependencies-check:
	$(NODE) node_modules/knip/bin/knip.js --config config/knip-production.json --production --strict --include unlisted --no-progress --no-config-hints
