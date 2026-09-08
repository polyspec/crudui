# CRUDUI documentation pipeline.
#
# User entry point for all documentation generation. npm scripts, typedoc,
# cargo doc, and go doc are building blocks invoked from here.
#
# Everything is idempotent: generation targets clean before they generate, and
# the generators emit deterministic output (no timestamps, no commit hashes, no
# machine-absolute paths). `make docs` run twice yields identical output.

# cargo lives in ~/.cargo/bin which is not on PATH by default.
export PATH := $(HOME)/.cargo/bin:$(PATH)

.DEFAULT_GOAL := help
.PHONY: help docs docs-api docs-schema docs-site docs-dev docs-preview docs-clean docs-check docs-check-libs docs-check-servers docs-check-all docs-verify-idempotent bench bench-fixtures bench-js bench-php bench-go bench-rust

# Validator benchmark iteration counts (override on the command line, e.g.
# `make bench BENCH_ITERS=100000`).
BENCH_ITERS  ?= 50000
BENCH_WARMUP ?= 5000

help: ## 타겟 설명
	@echo "CRUDUI docs — make targets:"
	@echo ""
	@echo "  make docs                  전체 문서 생성 (API doc 멀티언어 + JSON schema 검사 + VitePress build)"
	@echo "  make docs-api              Generate API references for all languages"
	@echo "  make docs-schema           스펙 JSON Schema와 공유 고정 데이터 검사"
	@echo "  make docs-site             VitePress 정적 빌드 (docs/.vitepress/dist)"
	@echo "  make docs-dev              VitePress 개발 서버"
	@echo "  make docs-preview          VitePress 빌드 결과 미리보기 서버"
	@echo "  make docs-clean            생성물 전부 제거 (docs/api, dist, target/doc)"
	@echo "  make docs-check            doc-coverage 게이트 (라이브러리 + examples 서버, 미문서화 시 RED)"
	@echo "  make docs-check-libs       라이브러리 packages/* 만 검사"
	@echo "  make docs-check-servers    examples 서버 4종만 검사 (node/go/php/rust)"
	@echo "  make docs-verify-idempotent  docs 를 2회 생성하고 diff 가 비는지 검증"
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

docs: docs-clean docs-api docs-schema docs-site ## 전체 문서 생성 (clean-then-generate)
	@echo "[make] docs: complete -> docs/.vitepress/dist"

docs-api: ## 멀티언어 API doc
	npm run docs:api

docs-schema: ## 스펙 JSON Schema 검사
	npm run spec:schema

docs-site: ## VitePress 정적 빌드
	npm run docs:build

docs-dev: ## VitePress 개발 서버
	npm run docs:dev

docs-preview: ## VitePress 미리보기 서버
	npm run docs:preview

# docs-check now gates the library packages AND the examples/* API servers.
# Either arm RED → non-zero exit. (docs-check-all is kept as an explicit alias.)
docs-check: docs-check-documents docs-check-libs docs-check-servers ## doc-coverage 게이트 (라이브러리 + 서버, 미문서화 → 비0 exit)
	@echo "[make] docs-check: documents, libraries and servers passed"

docs-check-all: docs-check ## docs-check 별칭 (라이브러리 + 서버)

docs-check-documents:
	node scripts/check-documents.mjs
	node --test scripts/documentation-links.test.mjs
	node --test scripts/gen-api-docs.test.mjs

docs-check-libs: ## 라이브러리 packages/* doc-coverage
	npm run docs:check

docs-check-servers: ## examples 서버 4종 doc-coverage (node/go/php/rust)
	npm run docs:check:servers

docs-clean: ## 생성물 전부 제거
	rm -rf docs/api docs/public/api
	rm -rf docs/.vitepress/dist docs/.vitepress/cache
	rm -rf packages/validator-rust/target/doc
	rm -rf tools/bin/.phpdoc-cache
	@echo "[make] docs-clean: removed generated docs/api, dist, rustdoc, phpdoc cache"

# Generate twice and compare Markdown, native API assets and the schema.
docs-verify-idempotent: ## docs 를 2회 생성하고 diff 가 비는지 검증
	@$(MAKE) docs-clean
	@$(MAKE) docs-api docs-schema
	@rm -rf /tmp/crudui-docs-run1 && mkdir -p /tmp/crudui-docs-run1
	@cp -R docs/api /tmp/crudui-docs-run1/api
	@cp -R docs/public/api /tmp/crudui-docs-run1/native-api
	@cp schema/crudui.schema.json /tmp/crudui-docs-run1/crudui.schema.json
	@$(MAKE) docs-api docs-schema
	@rm -rf /tmp/crudui-docs-run2 && mkdir -p /tmp/crudui-docs-run2
	@cp -R docs/api /tmp/crudui-docs-run2/api
	@cp -R docs/public/api /tmp/crudui-docs-run2/native-api
	@cp schema/crudui.schema.json /tmp/crudui-docs-run2/crudui.schema.json
	@if diff -r /tmp/crudui-docs-run1 /tmp/crudui-docs-run2 > /tmp/crudui-docs-diff.txt 2>&1; then \
		echo "[make] docs-verify-idempotent: OK — two runs produced identical deterministic output"; \
	else \
		echo "[make] docs-verify-idempotent: FAILED — outputs differ:"; \
		cat /tmp/crudui-docs-diff.txt; \
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

bench-fixtures: ## 벤치 fixture JSON 재생성 (YAML 스펙 → spec/input JSON)
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
