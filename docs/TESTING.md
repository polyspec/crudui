# Form-Spec 테스트 가이드

## 테스트 구조

```
form-spec/
├── tests/                          # 크로스 언어 테스트 (멱등성)
│   ├── cases/*.json               # 테스트 케이스 정의
│   └── runner/                    # 언어별 테스트 러너
│
└── packages/
    ├── validator-js/              # JS 검증기
    │   └── benchmarks/            # 성능 벤치마크 (JS 전용)
    ├── validator-php/             # PHP 검증기
    ├── validator-go/              # Go 검증기
    └── generator-react/           # React 폼 생성기
        └── src/__tests__/         # React 컴포넌트 테스트
```

## 테스트 규칙

### 1. 크로스 언어 테스트 (Validator)

**위치:** `tests/cases/*.json`

**목적:** JS, PHP, Go에서 동일한 입력에 대해 동일한 결과를 반환하는지 검증 (멱등성)

**대상:**
- 검증 규칙 (required, email, min, max, pattern 등)
- 조건부 검증 (display_switch, 조건식)
- 중첩 그룹, 상대 경로 참조
- multiple 필드, mincount/maxcount
- 와일드카드 경로

**테스트 케이스 형식:**
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

**실행:**
```bash
cd tests
npm run compare        # JS + PHP 비교
npm run compare:all    # JS + PHP + Go 비교
npm run idempotency    # 멱등성 전체 테스트
```

### 2. 언어별 단위 테스트

**목적:** 각 언어의 내부 구현 세부사항 테스트

**대상:**
- 캐싱 동작 (ConditionCache)
- 벤치마크/성능
- 내부 유틸리티 함수 (isEmpty, parseCondition 등)

**참고:** 이 테스트들은 언어마다 API가 다르므로 크로스 언어로 통합 불가능

### 3. Generator 테스트

**위치:** `packages/generator-*/src/__tests__/`

**목적:** UI 프레임워크별 컴포넌트 동작 테스트

**현재:**
- React: `packages/generator-react/src/__tests__/`

**향후 (Vue, Svelte 추가 시):**
- 동일한 테스트 케이스 구조로 통합 가능
- 입력: 스펙 + 사용자 액션
- 출력: 폼 상태 (값, 에러, visibility)

**실행:**
```bash
cd packages/generator-react
npm test
```

## 테스트 케이스 추가 가이드

### 크로스 언어 테스트 케이스 추가

1. `tests/cases/`에 JSON 파일 생성 또는 수정
2. 기존 파일 형식 참고 (required.json, email.json 등)
3. `npm run compare`로 JS/PHP 결과 비교 확인

### 새로운 검증 규칙 추가 시

1. 각 언어에 규칙 구현 (JS, PHP, Go)
2. `tests/cases/`에 테스트 케이스 추가
3. `npm run idempotency`로 멱등성 확인

## 테스트 파일 목록

### 크로스 언어 테스트 케이스

| 파일 | 설명 |
|------|------|
| `required.json` | 필수 입력 검증 |
| `email.json` | 이메일 형식 검증 |
| `minlength.json` | 최소 길이 검증 |
| `maxlength.json` | 최대 길이 검증 |
| `min-max.json` | 숫자 범위 검증 |
| `pattern.json` | 정규식 패턴 검증 |
| `unique.json` | 중복 검사 |
| `conditional.json` | 조건부 검증 |
| `display-switch.json` | 조건부 표시/숨김 |
| `nested-groups.json` | 중첩 그룹 |
| `multiple-fields.json` | 반복 필드 |
| `array-wildcard.json` | 와일드카드 경로 |

## 멱등성 원칙

Form-Spec의 핵심 가치는 **멱등성**입니다:

```
동일한 YAML 스펙 + 동일한 입력 데이터
            ↓
┌───────────┬───────────┬───────────┐
│    JS     │    PHP    │    Go     │
└───────────┴───────────┴───────────┘
            ↓
      동일한 검증 결과
```

모든 테스트는 이 원칙을 검증하기 위해 존재합니다.
