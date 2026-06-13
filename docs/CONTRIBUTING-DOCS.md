# 문서 자동생성

이 저장소의 문서는 두 갈래다.

1. **수기 마크다운** — `docs/*.md` (스펙·검증·조건식·테스트 가이드). 직접 편집한다.
2. **자동생성** — 멀티언어 API 레퍼런스(`docs/api/`)와 기계가독 JSON Schema
   (`schema/form-spec.schema.json`). 소스 주석·타입에서 생성하며 직접 편집하지 않는다.

사용자 진입점은 루트 **Makefile** 이다. npm scripts 는 하위 빌딩블록으로 둔다.

## Make 타겟

```bash
make help          # 타겟 설명
make docs          # 전체: API doc(멀티언어) + JSON schema + VitePress build
make docs-api      # 멀티언어 API doc (typedoc 4종 + go doc + cargo doc + php 가능시)
make docs-schema   # 스펙 JSON Schema 생성 + self-validate + 스모크
make docs-site     # VitePress 정적 빌드 (.vitepress/dist)
make docs-dev      # VitePress 개발 서버
make docs-preview  # 빌드 결과 미리보기 서버
make docs-clean    # 생성물 전부 제거
make docs-check    # doc-coverage 게이트 (공개 API 미문서화 시 RED)
```

## npm scripts (하위 빌딩블록)

```bash
npm run docs:api     # = node scripts/gen-api-docs.mjs
npm run docs:build   # = vitepress build docs
npm run docs:dev     # = vitepress dev docs
npm run docs:preview # = vitepress preview docs
npm run spec:schema  # = node scripts/gen-schema.mjs
```

## 멱등성

문서 생성은 항상 멱등하다. `make docs` 를 몇 번 실행해도 동일한 산출물이 나온다.

- **clean-then-generate**: `make docs` 는 `docs-clean` 을 선행한다. 각 생성기도
  자신의 출력 디렉토리를 비우고 다시 쓴다.
- **결정적 출력**: typedoc 은 `disableGit: true` 로 커밋 해시·날짜·머신 절대경로를
  산출물에 박지 않는다(`scripts/typedoc.base.json`). VitePress 는 `lastUpdated: false`.
  `go doc`·`cargo doc` 은 기본 결정적이다. JSON Schema 는 정렬된 안정 출력.

검증: `make docs` 를 연속 2회 실행하면 두 산출물의 diff 가 비어야 한다.

## 멀티언어 API doc 처리

| 언어 | 도구 | 출력 | 비고 |
|------|------|------|------|
| TypeScript | typedoc + typedoc-plugin-markdown | `docs/api/<pkg>/` (markdown, VitePress 통합) | validator-js, generator-react/vue/svelte |
| Go | `go doc -all ./validator` 캡처 | `docs/api/go.md` | CI 친화적 텍스트 캡처 |
| Rust | `cargo doc --no-deps` | `target/doc` (HTML, gitignored) + `docs/api/rust.md` 포인터 | cargo 는 `~/.cargo/bin` |
| PHP | phpDocumentor (가능시) | `docs/api/php/` (HTML, gitignored) + `docs/api/php.md` | 미설치 시 skip 노트 |

generator-svelte 의 `index.ts` 는 `.svelte` 파일을 re-export 하므로 typedoc 이
파싱할 수 없다. 대신 프레임워크 독립 TypeScript 헬퍼(`render`/`fieldHtml`/`i18n`/…)를
`scripts/tsconfig.svelte-docs.json` 으로 문서화한다.

phpDocumentor 가 환경에 없으면 PHP HTML 생성은 건너뛰고 `docs/api/php.md` 에 노트만
남긴다(거짓 green 금지). 로컬 phar(`tools/bin/phpDocumentor.phar`)가 있으면 사용한다.

## JSON Schema

`schema/form-spec.schema.json` 은 `packages/validator-js/src/types.ts` 의 `Spec`
타입에서 생성한 draft-07 스키마다. 생성 후 Ajv 로 self-validate 하고
`examples/shared-specs/*.yml` 로 스모크한다. 한계·에디터 연결법은
[`schema/README.md`](https://github.com/yejune/form-spec/blob/main/schema/README.md).

## doc-coverage 게이트

`make docs-check` (= `node scripts/check-doc-coverage.mjs`) 는 4언어 공개 API 의
doc 주석 존재를 강제한다. 미문서화 공개 심볼이 추가되면 해당 언어 arm 이 RED 이고,
하나라도 RED 면 게이트가 비0 exit.

| 언어 | 메커니즘 | 각 패키지 test 편입 |
|------|----------|---------------------|
| Rust | `#![deny(missing_docs)]` (validator-rust `lib.rs`) | `cargo build`/`cargo test` 에 자동 반영 |
| Go | `go/ast` 기반 `validator/doc_coverage_test.go` | `go test ./validator` 에 포함 |
| PHP | public 클래스/메서드 docblock 검사 (`scripts/php-doc-coverage.php`) | `DocCoverageTest` 로 phpunit 에 포함 |
| TypeScript | typedoc `validation.notDocumented` + `treatValidationWarningsAsErrors` (`scripts/typedoc.check.json`) | `npm run docs:check:ts` |

게이트 범위는 검증기/렌더러 패키지의 공개 API (`packages/*`) 다. 예제 서버
(`examples/*`)는 사용 데모이므로 게이트 대상이 아니다.

현 상태: Go·Rust·PHP·generator-svelte arm GREEN. validator-js / generator-react
/ generator-vue 의 TSDoc 보강은 진행 중이라 해당 arm 은 RED 일 수 있다 — 미문서화
public export 가 채워지면 GREEN 으로 전환된다.
