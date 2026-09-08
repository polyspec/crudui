# CRUDUI 테스트 가이드

이 문서는 실제 저장소에 존재하는 테스트 게이트와 실행 방법을 기술한다.
모든 명령은 검증된 것만 수록한다 — 추측으로 명령을 추가하지 마라.

## 게이트 요약

| 게이트 | 위치 | 실행 | 케이스 수 | 검증 대상 |
|--------|------|------|-----------|-----------|
| 크로스 언어 비교 | `tests/runner/compare-all.js` | `cd tests && npm test` | 1074 | JS/PHP/Go/Rust 검증 결과 일치 (멱등성) + Axis Diagnostics |
| JS 단일 러너 | `tests/runner/run-js.ts` | `cd tests && npm run run:js` | 1074 | JS 검증기 단독 pass/fail |
| PHP 단일 러너 | `tests/runner/run-php.php` | `cd tests && npm run run:php` | 1074 | PHP 검증기 단독 pass/fail |
| Go 브리지 | `tests/runner/go/run_test.go` | `cd tests/runner/go && go test ./...` | 1074 | Go 검증기 단독 pass/fail |
| Rust conformance | `packages/validator-rust/tests/conformance.rs` | `cd packages/validator-rust && cargo test --release` | 1074 | Rust 검증기 단독 pass/fail |
| vitest 브리지 | `packages/validator-ts/src/__tests__/conformance.test.ts` | `cd packages/validator-ts && npx vitest run` | 1074 | JS 검증기 (vitest 리포팅) |
| PHPUnit 브리지 | `packages/validator-php/tests/ConformanceTest.php` | `cd packages/validator-php && ./vendor/bin/phpunit` | 1074 | PHP 검증기 (PHPUnit data provider) |
| Go 내부 테스트 | `packages/validator-go/validator/legacy/validator_test.go` | `cd packages/validator-go && go test ./...` | — | Go 내부 단위 테스트 |
| HTML parity (React) | `tests/parity/parity.test.mjs` | `cd tests/parity && npm test` | 기준 HTML 7종 | React SSR ↔ Limepie 기준 HTML (7/7) |
| HTML parity (Vue) | `packages/generator-vue/test/parity.test.mjs` | `cd packages/generator-vue && npm test` | 기준 HTML 7종 | Vue SSR ↔ Limepie 기준 HTML (7/7) |
| HTML parity (Svelte) | `packages/generator-svelte/test/parity.test.mjs` | `cd packages/generator-svelte && npm test` | 기준 HTML 7종 | Svelte SSR ↔ Limepie 기준 HTML (7/7) |
| 프레임워크끼리 비교 | `tests/cross-framework/cross-framework.test.mjs` | `cd tests/cross-framework && npm test` | 7 specs / 21쌍 | React == Vue == Svelte SSR 직접 비교 |
| legacy 클라이언트 비교 | `tests/legacy-client/gate.js` | `cd tests/legacy-client && npm run gate` | 1074 (비교 가능분) | jQuery dist.validate.js ↔ 새 검증기 (jsdom) |
| 벤치마크 | `tools/bench/run.js` | `make bench` | — | 4언어 처리량 비교 (ops/sec) |
| doc-coverage | `tools/doc-coverage` | `make docs-check` | — | 라이브러리 + examples 서버 미문서화 시 RED |

`tests/cases/*.json` 23개 파일, 총 1074 케이스가 단일진실(single source of truth)이다.
크로스 언어 비교·단일 러너·브리지 4종이 전부 같은 픽스처 디렉터리를 읽는다 —
케이스를 추가하면 모든 게이트가 자동으로 집어간다.

현재 상태 (2026-06 검증): 검증기 게이트는 전부 GREEN (1074/1074, 4개 언어 일치).
HTML parity 도 전부 GREEN — React/Vue/Svelte 3개 generator 가 각각 기준 HTML 7종에
7/7 일치(필드 50/50 + chrome, canonical 일치)다. 프레임워크끼리 직접 비교도 21/21,
legacy 클라이언트 비교는 문서화 gap 0·회귀 0 이다.
기준 픽스처나 정규화 규칙을 약화해 GREEN 을 유지하지 마라 — 회귀 시 generator 를 고쳐라.

검증 의미론의 단일 진실은 "논리적 올바름"이다(legacy 결함은 보완 대상). 원칙
정의는 [VALIDATION-RULES.md](./VALIDATION-RULES.md) "검증 의미론 원칙
(Validation Semantics Principles)" 참조. 픽스처 기대값은 이 원칙을 따른다.

## 디렉터리 구조

```
crudui/
├── packages/
│   ├── validator-ts/        # TS 검증기 (vitest 브리지, benchmarks/ 포함)
│   ├── validator-php/       # PHP 검증기 (PHP ^8.2, PHPUnit 브리지)
│   ├── validator-go/        # Go 검증기 (모듈명 github.com/crudui/crudui/packages/validator-go)
│   ├── validator-rust/      # Rust 검증기 (크레이트 crudui-validator, cargo test 브리지)
│   ├── generator-react/     # React 폼 생성기 (vitest, 기준 HTML 7/7 parity)
│   ├── generator-vue/       # Vue 3 폼 생성기 (vitest, test/parity.test.mjs 7/7)
│   ├── generator-svelte/    # Svelte 5 폼 생성기 (vitest, test/parity.test.mjs 7/7)
│   └── generator-legacy/    # legacy Limepie vendor 체크아웃 + web assets (기준 파이프라인 지원)
├── tests/
│   ├── cases/               # 크로스 언어 픽스처 23개 (1074 케이스) — 단일진실
│   ├── fixtures/
│   │   ├── reference-html/     # Limepie PHP 기준 HTML 7종 (재생성: tools/limepie-baseline)
│   │   └── specs/           # ProductNft.yml 등 테스트용 YAML 스펙
│   ├── runner/
│   │   ├── compare-all.js   # 크로스 언어 비교 게이트 (JS/PHP/Go/Rust) + Axis Diagnostics
│   │   ├── run-js.ts        # JS 단일 러너 (ts-node)
│   │   ├── run-php.php      # PHP 단일 러너
│   │   ├── validate-case.php # PHP stdin 워커 (compare-all.js 가 호출)
│   │   └── go/              # Go 브리지 (go test)
│   ├── parity/              # React SSR ↔ 기준 HTML 비교 하네스 (Vue/Svelte 는 각 패키지 test/)
│   ├── cross-framework/     # React == Vue == Svelte SSR 직접 비교 (21쌍)
│   └── legacy-client/       # legacy jQuery dist.validate.js ↔ 새 검증기 (jsdom)
└── tools/
    ├── limepie-baseline/    # 기준 HTML 재생성 파이프라인 (핀 커밋 강제)
    └── bench/               # 4언어 검증기 처리량 벤치마크 (make bench)
```

## 1. 크로스 언어 비교 게이트 (compare-all.js)

**목적:** 동일 스펙 + 동일 입력 → JS/PHP/Go/Rust 가 동일 결과를 내는지 비교.
기대값과의 일치가 아니라 **언어 간 일치**를 검사한다 (기대값 검사는 단일
러너/브리지의 몫).

실행 끝에 **Axis Diagnostics** 를 출력한다. 불일치를 두 축으로 분류한다 —
클라이언트(js) ↔ 서버(php/go/rust) 불일치(브라우저 코어가 백엔드 합의와
어긋남), 서버끼리 불일치(php/go/rust 가 서로 어긋남). 어느 축이 깨졌는지
즉시 드러나 회귀 추적이 빠르다.

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

- **JS**: `packages/validator-ts/dist/index.js` 를 직접 require (없으면 ts-node 로 src).
- **PHP**: 케이스마다 `runner/validate-case.php` 워커를 서브프로세스로 실행.
- **Go**: `packages/validator-go/validate` CLI 바이너리 실행 (없으면
  `go build -o validate ./cmd/validate-legacy` 로 자동 빌드).
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

같은 1074 케이스를 각 언어의 표준 테스트 프레임워크로 실행한다. CI/IDE 통합과
케이스 단위 리포팅이 목적이다. 브리지에서 단언을 약화해 RED 를 GREEN 으로
만들지 마라 — 구현을 고쳐라.

```bash
# JS — vitest (packages/validator-ts/src/__tests__/conformance.test.ts)
cd packages/validator-ts
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
cargo test --release      # ../../tests/cases/*.json 을 읽어 1074 케이스 전부 검사
```

이 밖에 언어별 전용 테스트:

- `packages/validator-ts/benchmarks/` — 성능 벤치마크 (`npm run bench`).
- `packages/validator-go/validator/legacy/validator_test.go` — Go 내부 단위 테스트.
- `packages/generator-react` — 컴포넌트 테스트 (`npm test`, vitest, 353 테스트).
- `packages/generator-vue` — 컴포넌트 + parity 테스트 (`npm test`, vitest, 7 테스트).
- `packages/generator-svelte` — 컴포넌트 + parity 테스트 (`npm test`, vitest, 11 테스트).

## 4. HTML parity 하네스 (3개 프레임워크)

`tests/fixtures/reference-html/*.html`(legacy Limepie PHP 출력, 단일진실)과
React/Vue/Svelte 3개 generator 의 SSR 출력을 정규화 후 비교한다. 세 generator
모두 프레임워크 무관 PHP-cast 헬퍼 `src/limepieParity.ts` 를 공유 패턴으로 쓰고,
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

비교 대상: `examples/legacy/shared-specs/*.yml` 6종 + `tests/fixtures/specs/ProductNft.yml`.
모두 빈 데이터 렌더 기준. 세 프레임워크 모두 기준 HTML 7종에 7/7 GREEN 이다.

## 5. 기준 HTML 재생성 (tools/limepie-baseline)

기준 픽스처를 손으로 수정하지 마라. 재생성은 이 파이프라인으로만 하라.
핀 커밋(`a47ccba7...`)이 아닌 Limepie 로 재생성하지 마라 — `generate-all.sh` 가
HEAD 가드로 즉시 중단한다. 상세는 `tools/limepie-baseline/README.md` 참조.

```bash
# 1. 핀 확인 (clean tree + 핀 커밋)
git -C $LIMEPIE_SRC rev-parse HEAD      # a47ccba... 여야 함
git -C $LIMEPIE_SRC status --porcelain  # 출력 없어야 함

# 2. 전체 재생성
bash tools/limepie-baseline/generate-all.sh

# 3. 단일 스펙 렌더 (확인용)
php tools/limepie-baseline/render.php examples/legacy/shared-specs/product-form.yml
```

## 6. 프레임워크끼리 직접 비교 (cross-framework)

HTML parity(4절)는 각 프레임워크를 PHP 기준 HTML 과만 비교한다 — 셋이 모두 PHP 와
같으면 서로 같다는 추론(transitive)이다. 이 게이트는 그 추론을 명시 검증한다:
React/Vue/Svelte SSR 출력을 서로 직접 비교한다.

```bash
cd tests/cross-framework
npm install        # 최초 1회
npm test           # = capture(3 프레임워크) → compare
```

스펙은 parity 게이트와 동일한 7종(`examples/legacy/shared-specs/*.yml` 6종 +
`tests/fixtures/specs/ProductNft.yml`). 스펙마다 세 순서쌍(React==Vue, Vue==Svelte,
React==Svelte)을 단언한다 — 7specs × 3 = **21쌍**. 한 프레임워크만 어긋나면 그것이
닿는 두 쌍만 RED 가 되고 세 번째는 GREEN 으로 남아 범인을 좁힌다. 현재 21/21 GREEN.

세 프레임워크 SSR 을 한 프로세스에서 로드하면 충돌하므로 캡처는 프레임워크별로
분리 실행(Svelte 는 `@sveltejs/vite-plugin-svelte` 로 소스 컴포넌트를 컴파일)한 뒤
산출물을 모아 비교한다. 상세는 `tests/cross-framework/README.md` 참조.

## 7. legacy 클라이언트 비교 (legacy-client)

legacy Limepie 의 jQuery 브라우저 검증기 `examples/legacy/limepie-original/assets/js/
dist.validate.js` 를 jsdom + jquery 로 구동해 새 검증기와 비교한다. legacy 폼이
브라우저에서 통과하는데 새 검증기가 거부하면(또는 그 반대) 마이그레이션 회귀다.

```bash
cd tests/legacy-client
npm install        # jquery + jsdom + vitest (이 디렉터리 로컬)
npm run gate       # standalone 보고 (exit 0 = pass)
npm test           # vitest 래퍼 (gate.test.mjs)
```

1074 케이스 중 jsdom 으로 DOM 합성이 불가능한 케이스(array group `[__uniqid__]`
naming, display_switch 게이팅 없음, file/image 입력, 합성 불가 cross-field 등)는
구조적 사유로 제외(excluded)하고, 비교 가능한 케이스에서 legacy ↔ 새 검증기가
일치하는지 본다. 현재 문서화 gap 0·회귀 0 — 비교 가능분 전부 일치다.

단일 진실은 legacy 런타임이 아니라 "논리적 올바름"이다
([VALIDATION-RULES.md](./VALIDATION-RULES.md) "검증 의미론 원칙"). legacy 결함
3종(required 공백 미트림,
암묵 number 미강제, malformed min/max 임계값)은 `dist.validate.js` 를 새 검증기
방향으로 패치해 보완했다. 문서화되지 않은 새 불일치 또는 해소되어야 할 gap 잔존은
모두 게이트를 RED 로 만든다(`tests/legacy-client/known-gaps.js` 회귀 가드).

## 8. 벤치마크 (tools/bench)

4언어 검증기의 처리량(ops/sec, 평균 µs)을 같은 스펙·입력으로 비교한다.

```bash
make bench                              # 4언어 전부 → tools/bench/results.md
make bench-js | bench-php | bench-go | bench-rust   # 단일 언어
make bench BENCH_ITERS=100000 BENCH_WARMUP=10000    # 반복수 조절
```

절대 시간은 머신 의존이다 — 한 스펙 안에서 백엔드끼리 **상대 비교**하라.
상세는 `tools/bench/README.md` 참조.

## 9. CI

`.github/workflows/ci.yml` 가 push/PR 마다 8개 잡을 돌린다: `build-lint`,
`cross-language`(JS/PHP/Go/Rust 1074 비교), 검증기 단위 4종(`validator-unit-js`/
`-php`/`-go`/`-rust`), `parity`(React SSR ↔ 기준 HTML), `docs-coverage`
(`make docs-check`). 툴체인 핀: node 24, php 8.5, go 1.26, rust stable, npm 11.17.
`.github/dependabot.yml` 가 모든 생태계(github-actions/npm/gomod/cargo/composer)의
의존성을 주간 갱신한다.

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
- 형식 상세와 케이스 파일 현황은 [테스트 사례](./spec/test-fixtures.ko.md) 참조.

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
