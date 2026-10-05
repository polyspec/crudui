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
.PHONY: help docs docs-api docs-schema docs-web docs-dev docs-preview docs-clean docs-check docs-check-documents docs-check-libs docs-verify-idempotent bench bench-fixtures bench-js bench-php bench-go bench-rust build-php-extension test-php-extension test-native test-native-suites test-validators test-form-binding conformance format-check deploy deploy-verify deploy-watch github-settings github-settings-check hooks hooks-check ci rerun-failed test-form-styles-linux remove-form-styles-image
.NOTPARALLEL: docs docs-web docs-dev docs-preview docs-check docs-verify-idempotent

# Validator benchmark iteration counts (override on the command line, e.g.
# `make bench BENCH_ITERS=100000`).
BENCH_ITERS  ?= 50000
BENCH_WARMUP ?= 5000
PHP_EXTENSION ?= $(CURDIR)/packages/php-ext/modules/crudui.so
# Reports live in the Git directory, which is a file-referenced directory in a worktree.
NATIVE_REPORT ?= $(shell git rev-parse --git-path native-generators/report.json)
CONFORMANCE_EVIDENCE ?= $(abspath $(shell git rev-parse --git-path conformance-evidence))
# Every make run installs the tracked Git hooks: it sets core.hooksPath to .githooks when the setting differs, so the
# pre-push hook .githooks/pre-push refuses a push while a checklist task is [~] (scripts/push-gate.mjs, AGENTS.md).
HOOKS_PATH := $(shell [ "$$(git config core.hooksPath)" = .githooks ] || git config core.hooksPath .githooks; git config core.hooksPath)

help: ## 타겟 설명
	@echo "CRUDUI docs — make targets:"
	@echo ""
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
	@echo "  make test-php-extension    Test the native PHP engine, its builder and its PHP API"
	@echo "  make test-native           Test PHP, Go, Rust and native PHP generation"
	@echo "  make test-validators       Test the JavaScript, PHP, Go and Rust validators"
	@echo "  make test-form-binding     Test the browser validation binding, its markup parity and three browsers"
	@echo "  make conformance           Run every conformance suite and check the evidence against the standard"
	@echo "  make format-check          Fail when any Rust crate or Go file is not formatted"
	@echo "  make ci                    Run every command of the CI workflow in order, once per tree (scripts/full-run.mjs)"
	@echo "  make rerun-failed          Rerun the commands of make ci that did not pass on the current tree"
	@echo "  make test-form-styles-linux  Run the stylesheet layout checks on Linux in the Playwright image"
	@echo "  make remove-form-styles-image  Remove that Playwright image unless a check holds it"
	@echo "  make deploy                Deploy the comparison service from the current tree"
	@echo "  make deploy-verify         Verify the deployed comparison service"
	@echo "  make deploy-watch          Publish working-tree changes to the comparison service"
	@echo "  make github-settings       Apply the repository settings in .github/repository.json"
	@echo "  make github-settings-check Fail when the repository settings differ from the declaration"
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

docs: docs-clean docs-web ## 전체 문서 생성 (clean-then-generate)
	@echo "[make] docs: complete -> docs/.web/dist"

docs-api: ## 멀티언어 API doc
	$(NPM) run docs:api

docs-schema: ## 스펙 JSON Schema 검사
	$(NPM) run spec:schema

docs-web: ## 문서 정적 웹 빌드
	$(NPM) run docs:build

docs-dev: ## 문서 개발 서버
	$(NPM) run docs:dev

docs-preview: ## 문서 빌드 결과 미리보기 서버
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
docs-check-documents:
	@status=0; \
	$(NPM) run manifest:check || status=1; \
	$(NPM) run manifest:docs:check || status=1; \
	node scripts/check-documents.mjs || status=1; \
	node scripts/run-tests.mjs node -- scripts/checklist-markers.test.mjs scripts/documentation-links.test.mjs scripts/gen-api-docs.test.mjs scripts/check-doc-coverage.test.mjs scripts/php-doc-coverage.test.mjs || status=1; \
	$(NPM) run test:docs || status=1; \
	$(NPM) run docs:build || status=1; \
	exit $$status

docs-check-libs: ## 라이브러리 packages/* doc-coverage
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

bench: bench-fixtures ## 4언어 검증기 처리량 비교
	node tools/bench/run.js --iters $(BENCH_ITERS) --warmup $(BENCH_WARMUP)

bench-js: bench-fixtures ## JS 검증기만 측정
	node tools/bench/run.js --only js --iters $(BENCH_ITERS) --warmup $(BENCH_WARMUP)

bench-php: bench-fixtures ## PHP 검증기만 측정
	node tools/bench/run.js --only php --iters $(BENCH_ITERS) --warmup $(BENCH_WARMUP)

bench-go: bench-fixtures ## Go 검증기만 측정
	node tools/bench/run.js --only go --iters $(BENCH_ITERS) --warmup $(BENCH_WARMUP)

bench-rust: bench-fixtures ## Rust 검증기만 측정
	node tools/bench/run.js --only rust --iters $(BENCH_ITERS) --warmup $(BENCH_WARMUP)

# The JavaScript packages are built only when their sources or output changed; the
# extension build and the native suite both read the built packages. Every test runs through
# scripts/run-tests.mjs, which prints each test with its elapsed time and gives it its own
# timeout.
build-php-extension:
	node scripts/require-current-build.mjs
	node scripts/build-crudui-php-extension.mjs

test-php-extension: build-php-extension
	node scripts/run-tests.mjs node -- tests/native-generators/php-extension-builder.test.mjs packages/php-ext/tests/engine.test.mjs packages/php-ext/tests/api.test.mjs

# Both suites run even when the first fails, so one run reports every failure; any failure fails the target.
test-native:
	@status=0; \
	$(MAKE) --no-print-directory test-php-extension || status=1; \
	$(MAKE) --no-print-directory test-native-suites || status=1; \
	exit $$status

test-native-suites: build-php-extension
	# generator-php installs the validator as a copy; refresh it from source before any check loads it.
	composer --working-dir=packages/generator-php reinstall crudui/validator --no-interaction
	@status=0; \
	node scripts/run-tests.mjs phpunit --cwd packages/generator-php || status=1; \
	node scripts/run-tests.mjs go --cwd packages/generator-go -- -race ./... || status=1; \
	node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/generator-rust/Cargo.toml || status=1; \
	node scripts/run-tests.mjs node -- tests/native-generators/protocol.test.mjs || status=1; \
	node scripts/run-tests.mjs node --timeout 60 -- tests/widget-scripts.test.mjs || status=1; \
	node tests/native-generators/run.mjs --extension "$(PHP_EXTENSION)" --report "$(NATIVE_REPORT)" || status=1; \
	exit $$status

test-validators:
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
	$(NPM) test -w @crudui/form-binding

# Every suite that records conformance evidence, then the check of that evidence against
# contracts/features.json (docs/spec/conformance.md). Every suite runs even when an earlier one
# fails, so the check reports every gap; any failure fails the target.
conformance:
	rm -rf "$(CONFORMANCE_EVIDENCE)"
	@status=0; \
	export CRUDUI_CONFORMANCE_EVIDENCE="$(CONFORMANCE_EVIDENCE)"; \
	$(MAKE) --no-print-directory test-validators || status=1; \
	$(MAKE) --no-print-directory test-php-extension || status=1; \
	$(MAKE) --no-print-directory test-native-suites || status=1; \
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

# The comparison service in its long-running container (docs/operations/verification.md).
# Deployment is idempotent: it recreates nothing that already matches the tree.
deploy: ## Deploy the comparison service from the current tree
	node examples/form-comparison/comparison-deployment.mjs

deploy-verify: ## Verify the deployed comparison service
	node examples/form-comparison/verification.mjs

# The host's source watcher: it signals the supervisor of the comparison service at every file
# event of the working tree, and runs until it is stopped or a watch or delivery fails.
deploy-watch: ## Publish working-tree changes to the comparison service
	node examples/form-comparison/source-events.mjs

# GitHub repository settings declared in .github/repository.json (docs/operations/repository.md).
github-settings: ## Apply the declared repository settings (idempotent)
	node scripts/github-repository.mjs apply

github-settings-check: ## Fail when the repository settings differ from the declaration
	node scripts/github-repository.mjs check

# The pre-push hook of every push (scripts/push-gate.mjs): `make hooks` installs it, `make hooks-check` fails while
# core.hooksPath is not .githooks or the hook is not an executable file.
hooks: ## Install the tracked Git hooks (.githooks) and check them
	git config core.hooksPath .githooks
	node scripts/push-gate.mjs hooks-check

hooks-check: ## Fail when the pre-push hook is not installed
	node scripts/push-gate.mjs hooks-check

# Every command the CI workflow runs after installing tools and dependencies, in workflow order,
# with the conformance evidence collected and checked like the final CI job
# (tests/build/ci-local.test.mjs keeps this list equal to .github/workflows/ci.yml).
CI_COMMANDS = \
	'npm run test:runtimes' \
	'npm run test:dependencies' \
	'npm run build' \
	'npm run lint' \
	'npm run typecheck' \
	'npm test -w @crudui/validator' \
	'composer --working-dir=packages/validator-php test' \
	'node scripts/run-tests.mjs go --cwd packages/validator-go -- ./...' \
	'node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml' \
	'make docs-check' \
	'make build-php-extension' \
	'npm test --prefix examples/cross-check-console/server' \
	'npm run manifest:test' \
	'node scripts/require-current-build.mjs' \
	'npm test -w @crudui/cli' \
	'npm run manifest:check' \
	'npm run manifest:docs:check' \
	'npm run test:forms' \
	'npm run test:form-comparison' \
	'npm run test:form-comparison:pipeline' \
	'npm run test:packages' \
	'npm run test:build && npm run test:build:repeat' \
	'npm run test:inspector' \
	'make test-native' \
	'npm run test:bench' \
	'node scripts/check-conformance.mjs'
# The stylesheet layout checks as the Linux CI runner runs them (WebKit, Chromium and Firefox in
# the Playwright image of the pinned version), through `container` on macOS or `docker`. It is not
# part of `make ci`, which runs the workflow commands on this machine.
test-form-styles-linux: ## Run the stylesheet layout checks on Linux in the Playwright image
	sh scripts/test-form-styles-linux.sh

remove-form-styles-image: ## Remove that Playwright image unless a check holds it
	sh scripts/test-form-styles-linux.sh --remove-image

# `make ci` runs CI_COMMANDS through the guard scripts/full-run.mjs, which refuses while a checklist task is [~], while
# tracked changes are uncommitted or when var/full-run.json records a run of the current tree, removes the conformance
# evidence of earlier runs, runs each command with `sh -c` to its end and records its result; `make rerun-failed` reruns
# the commands of the current tree that did not pass and keeps the evidence of those that passed.
ci: ## Run every command of the CI workflow in order through the guard: once per tree, when no checklist task is [~]
	CRUDUI_CONFORMANCE_EVIDENCE="$(CONFORMANCE_EVIDENCE)" node scripts/full-run.mjs run $(CI_COMMANDS)

rerun-failed: ## Rerun only the commands of make ci that did not pass on the current tree
	CRUDUI_CONFORMANCE_EVIDENCE="$(CONFORMANCE_EVIDENCE)" node scripts/full-run.mjs rerun-failed
