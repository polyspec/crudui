# CRUDUI 문서

YAML 기반 폼 정의 시스템. 하나의 스펙으로 JavaScript/TypeScript, PHP, Go, Rust 에서
동일한 검증 결과(멱등성)를 보장하고, React/Vue/Svelte 로 폼을 렌더링한다.

- 스펙 형식: `{type: 'group', properties: {...}}`, 필드별 `rules` 는 객체
- 검증 결과: `{valid: boolean, errors: ValidationError[]}`
- 크로스 언어 게이트: 1074 케이스, 2026-06 기준 4개 언어 전부 GREEN
- CRUDUI 는 조건을 값에 녹이고 역할로 가른 차세대 스펙이다 — 헌법은 [spec/schema.md](./spec/schema.md).

## 문서 색인

### CRUDUI 명세 (헌법 · 차세대)

| 문서 | 내용 |
|------|------|
| [spec/schema.md](./spec/schema.md) | CRUDUI 헌법 — 단일 진실, 역할 슬롯(validate/design/behavior/options), 조건맵, $ref/$patch 합성, 금지키 게이트(§6), list-spec(§9) |
| [EXPRESSION-GRAMMAR.md](./EXPRESSION-GRAMMAR.md) | 4언어 표현식 엔진 단일 진실 — 토크나이저·파서·평가기, 같은 토큰열·같은 AST·같은 값, eval 금지 |
| list-spec (schema §9) | form-spec(create)의 read 자매. columns + rows 주입(DB 무관), read 셀 format 카탈로그, form-spec 과 같은 금지키 스캔 재사용 |

### 도구체인 (CLI · MCP · 콘솔 · 스킬)

| 문서 | 내용 |
|------|------|
| [CRUDUI-CLI.md](./CRUDUI-CLI.md) | `@crudui/cli`(`crudui`) — 구현: describe(--json/--md, drift 0, list capability 포함)·check(메타스키마+forbidden+type catalog)·explain(역검증)·list-widgets. 로드맵: validate·render·scaffold |
| [CRUDUI-MCP.md](./CRUDUI-MCP.md) | LLM 도구 묶음 — 카탈로그 로드·정적 검증·값 검증·렌더·역검증. 모든 tool 은 CLI 에 위임(자체 엔진 0) |
| `examples/cross-check-console` | 4언어 validate CLI 검증 × 3프레임워크 SSR 렌더 크로스전송, 멱등/parity, raw, 픽스처 export, list 탭(`/api/render-list` 렌더 + `/api/validate-list` 4언어 검증) |
| `.claude/skills/nl-to-form` | 자연어 기획서/구술 → 검증 통과 CRUDUI 스펙 변환 스킬 |

### 스펙 · 검증 (legacy 호환)

| 문서 | 내용 |
|------|------|
| [SPEC.md](./SPEC.md) | YAML 스펙 형식 명세 (legacy 호환) |
| [VALIDATION-RULES.md](./VALIDATION-RULES.md) | 검증 규칙 상세 (현 구현 기준 규칙 레퍼런스) |
| [CONDITION-PARSER.md](./CONDITION-PARSER.md) | 조건식 파서 (lexer + AST) |
| [DISPLAY-CONDITIONS.md](./DISPLAY-CONDITIONS.md) | display_switch / display_target — legacy 호환 전용. CRUDUI 는 이 메타키를 금지한다(schema §6), 조건은 값의 표현식/조건맵으로 표현 |
| [FIELD-KEYS.md](./FIELD-KEYS.md) | 필드 키 정의 (legacy 호환) |
| [API.md](./API.md) | 패키지 API 레퍼런스 |

### 테스트 · 평가

| 문서 | 내용 |
|------|------|
| [TESTING.md](./TESTING.md) | 테스트 게이트 체계와 실행 방법 (크로스 언어 비교+Axis Diagnostics, 브리지 4종, HTML parity, 프레임워크끼리 비교, legacy 클라이언트 비교, 벤치마크, CI, 기준 재생성) |
| [TEST-CASES.md](./TEST-CASES.md) | 크로스 언어 케이스 형식과 23개 파일 현황 (1074 케이스) |
| [EVALUATION.md](./EVALUATION.md) | 프로젝트 평가 보고서 (현황 업데이트 포함) |

### 사료 (legacy 분석 — 현 구현 기준 아님)

| 문서 | 내용 |
|------|------|
| [LEGACY-VALIDATE-ANALYSIS.md](./LEGACY-VALIDATE-ANALYSIS.md) | legacy Legacy jQuery 검증 시스템 분석. 현 구현 상태는 VALIDATION-RULES.md 참조 |
| [FORM-OUTPUT-COMPARISON.md](./FORM-OUTPUT-COMPARISON.md) | Legacy PHP ↔ React HTML 출력 비교 (착수 시점 분석, 상태 표시 갱신됨). 현재 출력 일치는 `tests/parity` 가 기준 |

게이트 외부 문서: `tests/parity/README.md` (HTML parity 하네스 규칙),
`tools/legacy-baseline/README.md` (기준 픽스처 파이프라인·핀),
`examples/README.md` (예제 서비스와 백엔드 API 계약).

## 저장소 구성

```
crudui/
├── packages/
│   ├── validator-ts/        # TS 검증기 (@crudui/validator)
│   ├── validator-php/       # PHP 검증기 (PHP ^8.2, CRUDUI\Validator)
│   ├── validator-go/        # Go 검증기 (모듈명 github.com/crudui/crudui/packages/validator-go)
│   ├── validator-rust/      # Rust 검증기 (크레이트 crudui-validator)
│   ├── generator-core/      # 프레임워크 무관 코어 (@crudui/generator-core) — buildForm/buildList
│   ├── generator-react/     # React 폼 생성기 (@crudui/generator-react) — 기준 HTML 7/7 parity
│   ├── generator-vue/       # Vue 3 폼 생성기 (@crudui/generator-vue, @vue/server-renderer SSR) — 기준 HTML 7/7 parity
│   ├── generator-svelte/    # Svelte 5 폼 생성기 (@crudui/generator-svelte, SSR) — 기준 HTML 7/7 parity
│   ├── generator-legacy/    # legacy Legacy vendor 체크아웃 + web assets — 기준 HTML 파이프라인이 사용하는 기준 구현
│   └── cli/                 # @crudui/cli (bin: crudui) — describe/check/explain/list-widgets, CLI 도구층
├── tests/                   # 크로스 언어 픽스처(cases/), 기준 HTML(fixtures/), 러너(runner/), parity 하네스(parity/)
├── tools/
│   └── legacy-baseline/    # Legacy 기준 HTML 재생성 파이프라인 (핀 커밋 강제)
└── examples/                # demo-app, cross-check-console, node/php/go/rust API 서버, playground 등 (docker-compose)
```

## 빠른 시작 (검증기)

네 언어 모두 동일한 스펙 객체와 동일한 결과 형식을 쓴다.

### JavaScript/TypeScript

```typescript
import { Validator } from '@crudui/validator';

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
use CRUDUI\Validator\Validator;

$validator = new Validator($spec);           // array $spec
$result = $validator->validate($data);       // ValidationResult
```

### Go

```go
import "github.com/crudui/crudui/packages/validator-go/validator"

v := validator.NewValidator(spec)
result := v.Validate(data) // *ValidationResult
```

### Rust

```rust
use crudui_validator::{parse_spec, Validator};

let parsed = parse_spec(&spec_value);          // 기준 type/properties JSON Value
let mut v = Validator::new(parsed.spec);
let result = v.validate(&data);                // ValidationResult { is_valid, errors }
```

상세 API 는 [API.md](./API.md), 규칙 동작은
[VALIDATION-RULES.md](./VALIDATION-RULES.md) 참조.

## 백엔드 API 계약

예제 API 서버 4종(node/php/go/rust)의 기준 계약 (`examples/README.md`):

```
POST /api/validate   body: {"spec": ..., "data": ...}
→ 항상 200, {"valid": bool, "errors": [{"field", "rule", "message"}]}
```

검증 실패는 HTTP 에러가 아니다 (422 없음). `errors` 는 항상 존재한다
(성공 시 빈 배열).

## 테스트

```bash
cd tests && npm test                # 크로스 언어 비교 (JS+PHP+Go+Rust, 1074 케이스 + Axis Diagnostics)
cd tests/parity && npm test         # React SSR ↔ Legacy 기준 HTML parity (7/7)
cd packages/generator-vue    && npm test  # Vue SSR ↔ 기준 parity (7/7)
cd packages/generator-svelte && npm test  # Svelte SSR ↔ 기준 parity (7/7)
cd tests/cross-framework && npm test # React == Vue == Svelte SSR 직접 비교 (21쌍)
cd tests/legacy-client && npm run gate # legacy jQuery 검증기 ↔ 새 검증기 (jsdom)
make bench                          # 4언어 검증기 처리량 비교 (tools/bench)
```

전체 게이트 목록·언어별 브리지·기준 재생성 절차·CI 는 [TESTING.md](./TESTING.md).

## 라이선스

MIT License
