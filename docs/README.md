# Form-Spec 문서

YAML 기반 폼 정의 시스템. 하나의 스펙으로 JavaScript/TypeScript, PHP, Go 에서
동일한 검증 결과(멱등성)를 보장하고, React 로 폼을 렌더링한다.

- 스펙 형식: `{type: 'group', properties: {...}}`, 필드별 `rules` 는 객체
- 검증 결과: `{valid: boolean, errors: ValidationError[]}`
- 크로스 언어 게이트: 951 케이스, 2026-06 기준 3개 언어 전부 GREEN

## 문서 색인

### 스펙 · 검증

| 문서 | 내용 |
|------|------|
| [SPEC.md](./SPEC.md) | YAML 스펙 형식 명세 |
| [VALIDATION-RULES.md](./VALIDATION-RULES.md) | 검증 규칙 상세 (현 구현 기준 규칙 레퍼런스) |
| [CONDITION-PARSER.md](./CONDITION-PARSER.md) | 조건식 파서 (lexer + AST) |
| [DISPLAY-CONDITIONS.md](./DISPLAY-CONDITIONS.md) | display_switch / display_target |
| [FIELD-KEYS.md](./FIELD-KEYS.md) | 필드 키 정의 |
| [API.md](./API.md) | 패키지 API 레퍼런스 |

### 테스트 · 평가

| 문서 | 내용 |
|------|------|
| [TESTING.md](./TESTING.md) | 테스트 게이트 체계와 실행 방법 (크로스 언어 비교, 브리지 3종, HTML parity, 골든 재생성) |
| [TEST-CASES.md](./TEST-CASES.md) | 크로스 언어 케이스 형식과 14개 파일 현황 (951 케이스) |
| [EVALUATION.md](./EVALUATION.md) | 프로젝트 평가 보고서 (현황 업데이트 포함) |

### 사료 (legacy 분석 — 현 구현 기준 아님)

| 문서 | 내용 |
|------|------|
| [LEGACY-VALIDATE-ANALYSIS.md](./LEGACY-VALIDATE-ANALYSIS.md) | legacy Legacy jQuery 검증 시스템 분석. 현 구현 상태는 VALIDATION-RULES.md 참조 |
| [FORM-OUTPUT-COMPARISON.md](./FORM-OUTPUT-COMPARISON.md) | Legacy PHP ↔ React HTML 출력 비교 (착수 시점 분석, 상태 표시 갱신됨). 현재 출력 일치는 `tests/parity` 가 기준 |

게이트 외부 문서: `tests/parity/README.md` (HTML parity 하네스 규칙),
`tools/legacy-baseline/README.md` (골든 픽스처 파이프라인·핀),
`examples/README.md` (예제 서비스와 백엔드 API 계약).

## 저장소 구성

```
form-spec/
├── packages/
│   ├── validator-js/        # TS 검증기 (@form-spec/validator)
│   ├── validator-php/       # PHP 검증기 (PHP ^8.2, FormSpec\Validator)
│   ├── validator-go/        # Go 검증기 (모듈명 github.com/example/form-generator/validator — placeholder)
│   ├── generator-react/     # React 폼 생성기 (@form-spec/generator-react)
│   ├── generator-vue/       # placeholder (v0.0.1, 미구현)
│   ├── generator-svelte/    # placeholder (v0.0.1, 미구현)
│   └── generator-legacy/    # legacy Legacy vendor 체크아웃 + web assets — 골든 HTML 파이프라인이 사용하는 기준 구현
├── tests/                   # 크로스 언어 픽스처(cases/), 골든 HTML(fixtures/), 러너(runner/), parity 하네스(parity/)
├── tools/
│   └── legacy-baseline/    # Legacy 골든 HTML 재생성 파이프라인 (핀 커밋 강제)
└── examples/                # demo-app, node/php/go API 서버, playground 등 (docker-compose)
```

## 빠른 시작 (검증기)

세 언어 모두 동일한 스펙 객체와 동일한 결과 형식을 쓴다.

### JavaScript/TypeScript

```typescript
import { Validator } from '@form-spec/validator';

const spec = {
  type: 'group',
  properties: {
    email: {
      type: 'email',
      rules: { required: true, email: true },
      messages: { required: 'Email is required' },
    },
    password: {
      type: 'password',
      rules: { required: true, minlength: 8 },
    },
  },
};

const validator = new Validator(spec);
const result = validator.validate({ email: '', password: '123' });
// result: { valid: boolean, errors: ValidationError[] }
```

### PHP

```php
use FormSpec\Validator\Validator;

$validator = new Validator($spec);           // array $spec
$result = $validator->validate($data);       // ValidationResult
```

### Go

```go
import validator "github.com/example/form-generator/validator/validator"

v := validator.NewValidator(spec)
result := v.Validate(data) // *ValidationResult
```

상세 API 는 [API.md](./API.md), 규칙 동작은
[VALIDATION-RULES.md](./VALIDATION-RULES.md) 참조.

## 백엔드 API 계약

예제 API 서버 3종(node/php/go)의 기준 계약 (`examples/README.md`):

```
POST /api/validate   body: {"spec": ..., "data": ...}
→ 항상 200, {"valid": bool, "errors": [{"field", "rule", "message"}]}
```

검증 실패는 HTTP 에러가 아니다 (422 없음). `errors` 는 항상 존재한다
(성공 시 빈 배열).

## 테스트

```bash
cd tests && npm test          # 크로스 언어 비교 (JS+PHP+Go, 951 케이스)
cd tests/parity && npm test   # React SSR ↔ Legacy 골든 HTML parity
```

전체 게이트 목록·언어별 브리지·골든 재생성 절차는 [TESTING.md](./TESTING.md).

## 라이선스

MIT License
