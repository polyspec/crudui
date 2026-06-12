# Form-Spec 테스트 가이드

이 문서는 실제 저장소에 존재하는 테스트 게이트와 실행 방법을 기술한다.
모든 명령은 검증된 것만 수록한다 — 추측으로 명령을 추가하지 마라.

## 게이트 요약

| 게이트 | 위치 | 실행 | 케이스 수 | 검증 대상 |
|--------|------|------|-----------|-----------|
| 크로스 언어 비교 | `tests/runner/compare-all.js` | `cd tests && npm test` | 1013 | JS/PHP/Go/Rust 검증 결과 일치 (멱등성) |
| JS 단일 러너 | `tests/runner/run-js.ts` | `cd tests && npm run run:js` | 1013 | JS 검증기 단독 pass/fail |
| PHP 단일 러너 | `tests/runner/run-php.php` | `cd tests && npm run run:php` | 1013 | PHP 검증기 단독 pass/fail |
| Go 브리지 | `tests/runner/go/run_test.go` | `cd tests/runner/go && go test ./...` | 1013 | Go 검증기 단독 pass/fail |
| Rust conformance | `packages/validator-rust/tests/conformance.rs` | `cd packages/validator-rust && cargo test --release` | 1013 | Rust 검증기 단독 pass/fail |
| vitest 브리지 | `packages/validator-js/src/__tests__/conformance.test.ts` | `cd packages/validator-js && npx vitest run` | 1013 | JS 검증기 (vitest 리포팅) |
| PHPUnit 브리지 | `packages/validator-php/tests/ConformanceTest.php` | `cd packages/validator-php && ./vendor/bin/phpunit` | 1013 | PHP 검증기 (PHPUnit data provider) |
| Go 내부 테스트 | `packages/validator-go/validator/legacy/validator_test.go` | `cd packages/validator-go && go test ./...` | — | Go 내부 단위 테스트 |
| HTML parity (React) | `tests/parity/parity.test.mjs` | `cd tests/parity && npm test` | 골든 7종 | React SSR ↔ Legacy 골든 HTML (7/7) |
| HTML parity (Vue) | `packages/generator-vue/test/parity.test.mjs` | `cd packages/generator-vue && npm test` | 골든 7종 | Vue SSR ↔ Legacy 골든 HTML (7/7) |
| HTML parity (Svelte) | `packages/generator-svelte/test/parity.test.mjs` | `cd packages/generator-svelte && npm test` | 골든 7종 | Svelte SSR ↔ Legacy 골든 HTML (7/7) |

`tests/cases/*.json` 19개 파일, 총 1013 케이스가 단일진실(single source of truth)이다.
크로스 언어 비교·단일 러너·브리지 4종이 전부 같은 픽스처 디렉터리를 읽는다 —
케이스를 추가하면 모든 게이트가 자동으로 집어간다.

현재 상태 (2026-06 검증): 검증기 게이트는 전부 GREEN (1013/1013, 4개 언어 일치).
HTML parity 도 전부 GREEN — React/Vue/Svelte 3개 generator 가 각각 골든 7종에
7/7 일치(필드 50/50 + chrome, canonical 일치)다.
골든 픽스처나 정규화 규칙을 약화해 GREEN 을 유지하지 마라 — 회귀 시 generator 를 고쳐라.

## 디렉터리 구조

```
form-spec/
├── packages/
│   ├── validator-js/        # TS 검증기 (vitest 브리지, benchmarks/ 포함)
│   ├── validator-php/       # PHP 검증기 (PHP ^8.2, PHPUnit 브리지)
│   ├── validator-go/        # Go 검증기 (모듈명 github.com/polyspec/crudui/packages/validator-go)
│   ├── validator-rust/      # Rust 검증기 (크레이트 formspec-validator, cargo test 브리지)
│   ├── generator-react/     # React 폼 생성기 (vitest, 골든 7/7 parity)
│   ├── generator-vue/       # Vue 3 폼 생성기 (vitest, test/parity.test.mjs 7/7)
│   ├── generator-svelte/    # Svelte 5 폼 생성기 (vitest, test/parity.test.mjs 7/7)
│   └── generator-legacy/    # legacy Legacy vendor 체크아웃 + web assets (골든 파이프라인 지원)
├── tests/
│   ├── cases/               # 크로스 언어 픽스처 19개 (1013 케이스) — 단일진실
│   ├── fixtures/
│   │   ├── golden-html/     # Legacy PHP 골든 HTML 7종 (재생성: tools/legacy-baseline)
│   │   └── specs/           # LargeForm.yml 등 테스트용 YAML 스펙
│   ├── runner/
│   │   ├── compare-all.js   # 크로스 언어 비교 게이트 (JS/PHP/Go/Rust)
│   │   ├── run-js.ts        # JS 단일 러너 (ts-node)
│   │   ├── run-php.php      # PHP 단일 러너
│   │   ├── validate-case.php # PHP stdin 워커 (compare-all.js 가 호출)
│   │   └── go/              # Go 브리지 (go test)
│   └── parity/              # React SSR ↔ 골든 HTML 비교 하네스 (Vue/Svelte 는 각 패키지 test/)
└── tools/
    └── legacy-baseline/    # 골든 HTML 재생성 파이프라인 (핀 커밋 강제)
```

## 1. 크로스 언어 비교 게이트 (compare-all.js)

**목적:** 동일 스펙 + 동일 입력 → JS/PHP/Go/Rust 가 동일 결과를 내는지 비교.
기대값과의 일치가 아니라 **언어 간 일치**를 검사한다 (기대값 검사는 단일
러너/브리지의 몫).

```bash
cd tests
npm test                       # = node runner/compare-all.js (JS+PHP+Go+Rust)
npm run test:js                # --js-only
npm run test:php               # --php-only
npm run test:go                # --go-only
npm run test:rust              # --rust-only
npm run idempotency:js-php     # --no-go
node runner/compare-all.js -f required.json   # 특정 파일만
node runner/compare-all.js --verbose          # 전체 결과 출력
```

언어별 실행 방식 (`tests/runner/compare-all.js` 기준):

- **JS**: `packages/validator-js/dist/index.js` 를 직접 require (없으면 ts-node 로 src).
- **PHP**: 케이스마다 `runner/validate-case.php` 워커를 서브프로세스로 실행.
- **Go**: `packages/validator-go/validate` CLI 바이너리 실행 (없으면
  `go build -o validate ./cmd/validate` 로 자동 빌드).
- **Rust**: `packages/validator-rust/target/release/validate` CLI 바이너리 실행
  (없으면 `cargo build --release` 로 자동 빌드 — cargo/rustc 가 PATH 에 없으면
  실패하므로 `export PATH="$HOME/.cargo/bin:$PATH"` 후 미리 빌드하라).

### stdin JSON 프로토콜

PHP 워커와 Go·Rust CLI 는 동일한 프로토콜을 쓴다 (`tests/runner/validate-case.php`,
`packages/validator-go/cmd/validate-legacy/main.go`,
`packages/validator-rust/src/bin/validate-legacy.rs`):

```
stdin:  {"spec": <spec>, "input": <input>}
stdout: {"valid": bool, "error": string|null, "field": string|null}
```

spec/input 을 argv 나 인라인 코드로 전달하지 마라 — stdin 이 raw JSON 을
운반하므로 셸/문자열 이스케이프가 개입하지 않는다.

### 스펙 래핑 규약

모든 러너가 공유하는 규약:

- `type: group` + `properties` 가 아닌 단순 필드 스펙은
  `{type:'group', properties:{value: spec}}` 으로 감싸고 입력도 `{value: input}` 으로 감싼다.
- 입력 마커 `"__undefined__"` 는 undefined 로 매핑한다 (JSON 은 undefined 를 표현 못 함).

## 2. 단일 언어 러너

기대값(`expected.valid` / `expected.error` / `expected.field`)과 실제 결과를
비교해 pass/fail 을 보고한다.

```bash
cd tests
npm run run:js     # ts-node runner/run-js.ts
npm run run:php    # php runner/run-php.php

cd tests/runner/go
go test ./...      # Go 브리지 (tests/cases/*.json 을 읽음)
```

`expected.field` 는 dot notation 경로다 (예: `option_single.items.0.price`) —
배열 인덱스도 점으로 잇는다.

## 3. 언어별 테스트 프레임워크 브리지

같은 1013 케이스를 각 언어의 표준 테스트 프레임워크로 실행한다. CI/IDE 통합과
케이스 단위 리포팅이 목적이다. 브리지에서 단언을 약화해 RED 를 GREEN 으로
만들지 마라 — 구현을 고쳐라.

```bash
# JS — vitest (packages/validator-js/src/__tests__/conformance.test.ts)
cd packages/validator-js
npx vitest run            # npm test 는 watch 모드로 열린다

# PHP — PHPUnit (packages/validator-php/tests/ConformanceTest.php)
cd packages/validator-php
./vendor/bin/phpunit      # 또는 composer test
# 최초 1회: composer install

# Go — tests/runner/go (위 2절) + 내부 단위 테스트
cd packages/validator-go
go test ./...

# Rust — cargo test (packages/validator-rust/tests/conformance.rs)
export PATH="$HOME/.cargo/bin:$PATH"
cd packages/validator-rust
cargo test --release      # ../../tests/cases/*.json 을 읽어 1013 케이스 전부 검사
```

이 밖에 언어별 전용 테스트:

- `packages/validator-js/benchmarks/` — 성능 벤치마크 (`npm run bench`).
- `packages/validator-go/validator/legacy/validator_test.go` — Go 내부 단위 테스트.
- `packages/generator-react` — 컴포넌트 테스트 (`npm test`, vitest, 353 테스트).
- `packages/generator-vue` / `packages/generator-svelte` — 컴포넌트 + parity 테스트 (`npm test`, vitest).

## 4. HTML parity 하네스 (3개 프레임워크)

`tests/fixtures/golden-html/*.html`(legacy Legacy PHP 출력, 단일진실)과
React/Vue/Svelte 3개 generator 의 SSR 출력을 정규화 후 비교한다. 세 generator
모두 프레임워크 무관 PHP-cast 헬퍼 `src/legacyParity.ts` 를 공유 패턴으로 쓰고,
정규화 규칙(`tests/parity/normalize.js`)을 읽기 전용으로 재사용한다. 정규화 상세
규칙(토큰 마스킹, 속성 정렬, 공백 처리 등)은 `tests/parity/README.md` 참조.

```bash
# React — 루트 tests/parity 하네스
cd tests/parity
npm install          # 최초 1회
npm test             # vitest run — 픽스처별 구조화 diff 리포트
# 또는 tests/ 에서: npm run test:parity
node capture-react.mjs <spec.yml> [data.json]   # 단일 스펙 SSR 캡처
node normalize.js <file.html>                   # 정규화 결과 확인

# Vue — packages/generator-vue/test (@vue/server-renderer SSR)
cd packages/generator-vue && npm test           # test/parity.test.mjs — 7/7

# Svelte — packages/generator-svelte/test (Svelte 5 SSR)
cd packages/generator-svelte && npm test        # test/parity.test.mjs — 7/7
```

비교 대상: `examples/shared-specs/*.yml` 6종 + `tests/fixtures/specs/LargeForm.yml`.
모두 빈 데이터 렌더 기준. 세 프레임워크 모두 골든 7종에 7/7 GREEN 이다.

## 5. 골든 HTML 재생성 (tools/legacy-baseline)

골든 픽스처를 손으로 수정하지 마라. 재생성은 이 파이프라인으로만 하라.
핀 커밋(`a47ccba7...`)이 아닌 Legacy 로 재생성하지 마라 — `generate-all.sh` 가
HEAD 가드로 즉시 중단한다. 상세는 `tools/legacy-baseline/README.md` 참조.

```bash
# 1. 핀 확인 (clean tree + 핀 커밋)
git -C /path/to/ai/gui/legacy rev-parse HEAD      # a47ccba... 여야 함
git -C /path/to/ai/gui/legacy status --porcelain  # 출력 없어야 함

# 2. 전체 재생성
bash tools/legacy-baseline/generate-all.sh

# 3. 단일 스펙 렌더 (확인용)
php tools/legacy-baseline/render.php examples/shared-specs/product-form.yml
```

## 테스트 케이스 형식

```json
{
  "testSuite": "required",
  "version": "1.0.0",
  "description": "Required 규칙 검증 테스트",
  "tests": [
    {
      "id": "required-001",
      "description": "빈 문자열은 필수 검증 실패",
      "spec": { "type": "text", "rules": { "required": true } },
      "cases": [
        { "input": "", "expected": { "valid": false, "error": "required" } },
        { "input": "hello", "expected": { "valid": true } }
      ]
    }
  ]
}
```

- `expected.error` — 실패 시 규칙명. 성공 케이스에서는 생략.
- `expected.field` — 그룹 스펙에서 에러 필드의 dot notation 경로. 단순 스펙에서는 생략.
- 형식 상세와 케이스 파일 현황은 [TEST-CASES.md](./TEST-CASES.md) 참조.

## 케이스 추가 가이드

1. `tests/cases/` 의 기존 JSON 파일에 추가하거나 새 파일 생성 (기존 파일 형식 참고).
2. `cd tests && npm test` 로 4개 언어 일치 확인.
3. 새 검증 규칙을 추가할 때는 **4개 언어 전부에 구현**한 뒤 케이스를 추가하라 —
   한 언어에만 구현된 규칙은 크로스 언어 게이트가 잡는다.
4. 픽스처 기대값을 구현에 맞춰 고치지 마라 — 픽스처가 단일진실이다.

## 멱등성 원칙

```
동일한 스펙 + 동일한 입력 데이터
            ↓
┌─────────┬─────────┬─────────┬─────────┐
│   JS    │   PHP   │   Go    │  Rust   │
└─────────┴─────────┴─────────┴─────────┘
            ↓
      동일한 검증 결과 {valid, error, field}
```

검증기 테스트는 전부 이 원칙을 검증하기 위해 존재한다. HTML parity 는 같은
원칙의 렌더링 판이다 — 동일 스펙은 동일 마크업 규약을 따라야 한다.
