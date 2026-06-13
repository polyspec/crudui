# 테스트 케이스 명세서

> JS, PHP, Go, Rust 네 언어에서 멱등성(idempotency) 검증을 보장하기 위한
> 크로스 언어 테스트 케이스의 형식과 현황을 기술한다.
> 실행 방법과 게이트 체계는 [TESTING.md](./TESTING.md) 참조.

## 개요

`tests/cases/*.json` 이 단일진실이다. 동일한 픽스처를 여러 경로가 소비한다:

1. `tests/runner/compare-all.js` — 크로스 언어 비교 (JS/PHP/Go/Rust 결과 일치)
2. `tests/runner/run-js.ts` / `run-php.php` / `runner/go` — 단일 언어 기대값 검사
3. `packages/validator-js/src/__tests__/conformance.test.ts` — vitest 브리지
4. `packages/validator-php/tests/ConformanceTest.php` — PHPUnit 브리지
5. `packages/validator-rust/tests/conformance.rs` — cargo test 브리지

픽스처 기대값을 구현에 맞춰 고치지 마라 — 구현을 픽스처에 맞춰라.

## JSON 테스트 케이스 형식

실제 픽스처가 사용하는 형식이다 (`tests/cases/required.json` 등 기준).

```json
{
  "testSuite": "required",
  "version": "1.0.0",
  "description": "Required 규칙 검증 테스트",
  "tests": [
    {
      "id": "required-001",
      "description": "필수 입력 규칙 - 빈 문자열",
      "spec": { "type": "text", "rules": { "required": true } },
      "cases": [
        { "input": "", "expected": { "valid": false, "error": "required" } },
        { "input": "값 있음", "expected": { "valid": true } }
      ]
    }
  ]
}
```

### 필드 설명

루트 레벨:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `testSuite` | string | 예 | 테스트 스위트 식별자 |
| `version` | string | 예 | 테스트 스위트 버전 |
| `description` | string | 아니오 | 테스트 스위트 설명 |
| `tests` | array | 예 | 테스트 목록 |

테스트 객체:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `id` | string | 예 | 고유 테스트 ID (예: `required-001`) |
| `description` | string | 아니오 | 테스트 설명 |
| `spec` | object | 예 | 필드/그룹 스펙. 그룹은 `{type:'group', properties:{...}}` |
| `cases` | array | 예 | 케이스 목록 |

케이스 객체:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `input` | any | 예 | 입력값. `"__undefined__"` 마커는 undefined 로 매핑 |
| `expected` | object | 예 | 예상 결과 |
| `description` | string | 아니오 | 케이스 설명 |

예상 결과 객체:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `valid` | boolean | 예 | 검증 성공 여부 |
| `error` | string | 실패 시 | 첫 에러의 규칙명 (필드당 첫 에러에서 중단) |
| `field` | string | 그룹 스펙 실패 시 | 에러 필드의 dot notation 경로 (예: `option_single.items.0.price`) |

조건부 검증은 별도 `context` 키가 아니라 **그룹 스펙 + 그룹 입력**으로 표현한다 —
조건식(`.sibling == '1'` 등)이 같은 입력 데이터 안의 형제/부모 필드를 참조한다.

### 스펙 래핑 규약

`type: group` 이 아닌 단순 필드 스펙은 러너가
`{type:'group', properties:{value: spec}}` 으로 감싸고 입력도
`{value: input}` 으로 감싼다. 모든 러너/브리지가 동일하게 적용한다.

## 케이스 파일 현황 (실측)

총 **23개 파일, 1074 케이스**. 2026-06 기준 4개 언어(JS/PHP/Go/Rust) 전부 1074/1074 GREEN.

| 파일 | 테스트 수 | 케이스 수 | 영역 |
|------|-----------|-----------|------|
| `required.json` | 22 | 66 | 필수 입력 |
| `email.json` | 16 | 43 | 이메일 형식 |
| `minlength.json` | 10 | 28 | 최소 길이 |
| `maxlength.json` | 10 | 27 | 최대 길이 |
| `min-max.json` | 18 | 64 | 숫자 범위 (min/max) |
| `pattern.json` | 33 | 169 | 정규식 (pattern/match 별칭 포함) |
| `unique.json` | 22 | 65 | 배열 중복 검사 |
| `conditional.json` | 23 | 85 | 조건식 기반 조건부 검증 |
| `display-switch.json` | 21 | 84 | display_switch / display_target 검증 스킵 |
| `nested-groups.json` | 15 | 52 | 중첩 그룹, 에러 경로 |
| `multiple-fields.json` | 24 | 86 | multiple 필드, mincount/maxcount |
| `array-wildcard.json` | 15 | 46 | 와일드카드 경로 (`items.*.x`) |
| `large-form.json` | 14 | 59 | LargeForm 실폼 부분 시나리오 |
| `large-form-full.json` | 15 | 77 | LargeForm 실폼 전체 시나리오 |
| `pattern-unanchored.json` | 4 | 15 | 미앵커 정규식 경계 회귀 |
| `number-implicit.json` | 2 | 10 | 암시적 number 타입 검증 회귀 |
| `length-codepoint.json` | 4 | 13 | 코드포인트 단위 길이 계산 회귀 |
| `accept.json` | 5 | 18 | `accept` 파일 확장자 규칙 회귀 |
| `malformed-threshold.json` | 3 | 6 | 비숫자 임계값(min/max) 스킵 회귀 |
| `array-suffix-key.json` | 6 | 17 | `[]`-suffix 키 정규화 (`items[]` → `items`) 회귀 |
| `count-object-key.json` | 7 | 12 | 객체키(`__uid__`) multiple group 엔트리 카운트 회귀 |
| `number-nonfinite.json` | 5 | 18 | 비유한 number 입력(Infinity/NaN) 거부 회귀 |
| `object-key-multiple.json` | 6 | 14 | 객체키 multiple group 에러 경로(uniqid 보존) 회귀 |
| **합계** | **300** | **1074** | |

마지막 9개(`pattern-unanchored` 부터)는 회귀 잠금 스위트다. 검증 의미론의 단일
진실은 "논리적 올바름"이다 — 상세는 [VALIDATION-RULES.md](./VALIDATION-RULES.md)
"검증 의미론 원칙(Validation Semantics Principles)" 참조.

## 규칙 커버리지

4개 언어 공통 구현 규칙은 24개 등록명(23개 구현 + `pattern` = `match` 별칭)이다.
출처: `packages/validator-js/src/rules/index.ts`,
`packages/validator-go/validator/legacy/rules.go` `DefaultRules()`,
`packages/validator-php/src/Rules/` + `Validator.php` 의 pattern/match 별칭.

### 픽스처가 직접 행사하는 규칙

`required`, `email`, `minlength`, `maxlength`, `min`, `max`,
`pattern`/`match`, `unique`, `mincount`, `maxcount`, `accept`

암시적 number 타입 검증(`number-implicit.json`), 코드포인트 단위 길이 계산
(`length-codepoint.json`), 미앵커 정규식 경계(`pattern-unanchored.json`),
비숫자 임계값 스킵(`malformed-threshold.json`), `[]`-suffix 키 정규화
(`array-suffix-key.json`), 객체키 multiple group 엔트리 카운트
(`count-object-key.json`), 비유한 number 입력 거부(`number-nonfinite.json`),
객체키 multiple group 에러 경로 보존(`object-key-multiple.json`)도 회귀 스위트로
고정돼 있다.

### 구현됨 — 전용 픽스처 스위트 없음 (Planned)

다음 규칙은 4개 언어에 구현되어 있으나 `tests/cases/` 에 전용 스위트가 없다.
스위트 추가가 계획 항목이다:

`url`, `rangelength`, `number`, `digits`, `range`, `step`,
`equalTo`, `notEqual`, `in`, `date`, `dateISO`, `enddate`

### 미구현 (Planned — 문서상으로만 존재했던 규칙)

`minformcount` / `maxformcount` 는 **어떤 언어에도 구현되어 있지 않고**
픽스처·LargeForm 스펙 어디에도 사용되지 않는다 (grep 검증).
구현된 것처럼 기술하지 마라. 폼 반복 횟수 제한은 현재 `mincount`/`maxcount` 로
커버되는 범위만 동작한다.

## ID 명명 규칙

```
{규칙명 또는 영역}-{번호}
```

예: `required-001`, `pattern-014`, `display-switch-007`.

## 케이스 추가 절차

1. 해당 영역의 기존 파일에 추가하거나 새 `tests/cases/*.json` 생성.
2. `cd tests && npm test` — 4개 언어(JS/PHP/Go/Rust) 일치 확인 (게이트).
3. 브리지 4종(vitest/PHPUnit/go test/cargo test)은 같은 디렉터리를 glob 하므로 자동 반영된다.

## CI/CD

`.github/workflows/ci.yml` 가 push/PR 마다 8개 잡(build-lint, cross-language,
검증기 단위 4종, parity, docs-coverage)을 돌린다. `.github/dependabot.yml` 가
의존성을 주간 갱신한다. 게이트 상세는 [TESTING.md](./TESTING.md) 참조.

## 참고 자료

- [TESTING.md](./TESTING.md) — 게이트 체계와 실행 방법
- [VALIDATION-RULES.md](./VALIDATION-RULES.md) — 검증 규칙 상세
- [SPEC.md](./SPEC.md) — 스펙 형식
