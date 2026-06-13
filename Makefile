# Form-Spec documentation pipeline.
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
.PHONY: help docs docs-api docs-schema docs-site docs-dev docs-preview docs-clean docs-check docs-check-libs docs-check-servers docs-check-all docs-verify-idempotent

help: ## 타겟 설명
	@echo "Form-Spec docs — make targets:"
	@echo ""
	@echo "  make docs                  전체 문서 생성 (API doc 멀티언어 + JSON schema + VitePress build)"
	@echo "  make docs-api              멀티언어 API doc (typedoc 4종 + go doc + cargo doc + php 가능시)"
	@echo "  make docs-schema           스펙 JSON Schema 생성 + self-validate + 스모크"
	@echo "  make docs-site             VitePress 정적 빌드 (docs/.vitepress/dist)"
	@echo "  make docs-dev              VitePress 개발 서버"
	@echo "  make docs-preview          VitePress 빌드 결과 미리보기 서버"
	@echo "  make docs-clean            생성물 전부 제거 (docs/api, schema json, dist, target/doc)"
	@echo "  make docs-check            doc-coverage 게이트 (라이브러리 + examples 서버, 미문서화 시 RED)"
	@echo "  make docs-check-libs       라이브러리 packages/* 만 검사"
	@echo "  make docs-check-servers    examples 서버 4종만 검사 (node/go/php/rust)"
	@echo "  make docs-verify-idempotent  docs 를 2회 생성하고 diff 가 비는지 검증"
	@echo ""

docs: docs-clean docs-api docs-schema docs-site ## 전체 문서 생성 (clean-then-generate)
	@echo "[make] docs: complete -> docs/.vitepress/dist"

docs-api: ## 멀티언어 API doc
	npm run docs:api

docs-schema: ## 스펙 JSON Schema 생성
	npm run spec:schema

docs-site: ## VitePress 정적 빌드
	npm run docs:build

docs-dev: ## VitePress 개발 서버
	npm run docs:dev

docs-preview: ## VitePress 미리보기 서버
	npm run docs:preview

# docs-check now gates the library packages AND the examples/* API servers.
# Either arm RED → non-zero exit. (docs-check-all is kept as an explicit alias.)
docs-check: docs-check-libs docs-check-servers ## doc-coverage 게이트 (라이브러리 + 서버, 미문서화 → 비0 exit)
	@echo "[make] docs-check: libraries + servers all GREEN"

docs-check-all: docs-check ## docs-check 별칭 (라이브러리 + 서버)

docs-check-libs: ## 라이브러리 packages/* doc-coverage
	npm run docs:check

docs-check-servers: ## examples 서버 4종 doc-coverage (node/go/php/rust)
	npm run docs:check:servers

docs-clean: ## 생성물 전부 제거
	rm -rf docs/api
	rm -rf docs/.vitepress/dist docs/.vitepress/cache
	rm -f schema/form-spec.schema.json
	rm -rf packages/validator-rust/target/doc
	rm -rf tools/bin/.phpdoc-cache
	@echo "[make] docs-clean: removed generated docs/api, dist, schema json, rustdoc, phpdoc cache"

# Idempotency proof: generate twice, diff the full docs/api tree + schema json.
# (rustdoc HTML lives in the gitignored target/doc, outside docs/api, so it is
# naturally excluded; the docs/api markdown + php/go/rust pages are all
# deterministic and compared in full.)
docs-verify-idempotent: ## docs 를 2회 생성하고 diff 가 비는지 검증
	@$(MAKE) docs-clean
	@$(MAKE) docs-api docs-schema
	@rm -rf /tmp/formspec-docs-run1 && mkdir -p /tmp/formspec-docs-run1
	@cp -R docs/api /tmp/formspec-docs-run1/api
	@cp schema/form-spec.schema.json /tmp/formspec-docs-run1/form-spec.schema.json
	@$(MAKE) docs-api docs-schema
	@rm -rf /tmp/formspec-docs-run2 && mkdir -p /tmp/formspec-docs-run2
	@cp -R docs/api /tmp/formspec-docs-run2/api
	@cp schema/form-spec.schema.json /tmp/formspec-docs-run2/form-spec.schema.json
	@if diff -r /tmp/formspec-docs-run1 /tmp/formspec-docs-run2 > /tmp/formspec-docs-diff.txt 2>&1; then \
		echo "[make] docs-verify-idempotent: OK — two runs produced identical deterministic output"; \
	else \
		echo "[make] docs-verify-idempotent: FAILED — outputs differ:"; \
		cat /tmp/formspec-docs-diff.txt; \
		exit 1; \
	fi
