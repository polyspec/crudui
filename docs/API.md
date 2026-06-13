# Validator API Reference

form-spec 검증기의 4개 언어 구현(JavaScript/TypeScript, PHP, Go, Rust) 공개 API 레퍼런스.
모든 시그니처는 실제 소스 코드에서 추출했다 — 각 절에 출처 파일을 명기한다.

4개 구현은 동일한 스펙·데이터에 대해 동일한 검증 결과를 내도록
크로스언어 테스트(1074케이스, `tests/runner/compare-all.js`)로 검증된다.

## 목차

- [공통 계약](#공통-계약)
- [JavaScript/TypeScript (`@form-spec/validator`)](#javascripttypescript-form-specvalidator)
- [PHP (`form-spec/validator`)](#php-form-specvalidator)
- [Go (`validator` 패키지)](#go-validator-패키지)
- [Rust (`formspec-validator` 크레이트)](#rust-formspec-validator-크레이트)
- [언어별 에러 형식 차이](#언어별-에러-형식-차이)
- [백엔드 HTTP API 계약](#백엔드-http-api-계약)

---

## 공통 계약

네 구현 모두 다음을 공유한다.

1. **스펙 형식**: 루트는 `{ type: 'group', properties: { 필드명: FieldSpec, ... } }`.
   `rules`는 **객체**다 (`rules: { required: true, minlength: 2 }`).
   문자열 배열(`rules: ['required', 'min:8']`) 형식은 존재하지 않는다.
2. **검증 결과**: `valid`(boolean) + `errors`(에러 목록). 표현은 언어별로 약간 다르다
   ([언어별 에러 형식 차이](#언어별-에러-형식-차이) 참조).
3. **검증 순서**: 스펙에 선언된 순서대로 필드·규칙을 평가하고,
   **필드당 첫 에러에서 중단**한다. Go는 JSON 키 순서를 보존하는
   ordered decode(`validator/ordered.go`)로 선언 순서를 보장한다.
4. **에러 field 경로**: dot notation (`items.0.code`).
5. **숨김 필드 스킵**: `display_switch`/`display_target`으로 숨겨진 필드는
   검증하지 않는다 ([DISPLAY-CONDITIONS.md](./DISPLAY-CONDITIONS.md) 참조).

---

## JavaScript/TypeScript (`@form-spec/validator`)

출처: `packages/validator-js/src/legacy/Validator.ts`, `packages/validator-js/src/types.ts`,
`packages/validator-js/src/legacy/index.ts`

### Validator 클래스

```typescript
import { Validator, createValidator } from '@form-spec/validator';

class Validator {
  constructor(spec: Spec, options?: ValidatorOptions);

  /** 전체 데이터 검증 */
  validate(data: Record<string, unknown>): ValidationResult;

  /** 단일 필드 검증 — 첫 에러 메시지 또는 null */
  validateField(path: string, value: unknown, allData: Record<string, unknown>): string | null;

  /** 인스턴스 한정 커스텀 규칙 추가 (전역 레지스트리를 오염시키지 않음) */
  addRule(name: string, fn: RuleFn): void;

  /** 생성 시 전달한 스펙 반환 */
  getSpec(): Spec;
}

/** new Validator(spec, options) 와 동일한 팩토리 함수 */
function createValidator(spec: Spec, options?: ValidatorOptions): Validator;
```

### 타입

```typescript
interface Spec {
  type: 'group';
  key?: string;          // 폼 고유 키 (필드 name prefix 용)
  name?: string;
  label?: string;
  title?: string;
  description?: string;
  properties: Record<string, FieldSpec>;
  action?: ActionSpec;
}

interface FieldSpec {
  type: string;
  label?: string;
  description?: string;
  placeholder?: string;
  default?: unknown;
  readonly?: boolean;
  disabled?: boolean;
  multiple?: boolean | 'only';
  rules?: RulesSpec;       // 객체: { required: true, minlength: 2, ... }
  messages?: MessagesSpec; // 객체: { required: '필수입니다', ... }
  properties?: Record<string, FieldSpec>;  // type: 'group' 일 때
  items?: Record<string, string> | ItemsSourceSpec;
  display_switch?: string | boolean;  // 조건식 문자열 또는 boolean
  display_target?: string;            // 대상 필드 참조
  [key: string]: unknown;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  path: string;     // 전체 경로 (dot notation, 예: "items.0.code")
  field: string;    // 마지막 세그먼트 (예: "code")
  rule: string;     // 실패한 규칙명 (예: "required")
  message: string;
  value?: unknown;
}

interface ValidatorOptions {
  /** true 시 조건식 파싱/평가 실패를 console.warn 으로 출력 */
  debug?: boolean;
}

/** 커스텀 규칙 함수: 에러 메시지 또는 null 반환 */
type RuleFn = (context: ValidationContext) => string | null;

interface ValidationContext {
  path: string;                       // 현재 필드 전체 경로
  field: string;                      // 필드명 (마지막 세그먼트)
  value: unknown;                     // 현재 값
  allData: Record<string, unknown>;   // 전체 폼 데이터
  spec: FieldSpec;                    // 필드 스펙
  pathSegments: string[];             // 경로 세그먼트 배열
  ruleParam: unknown;                 // 규칙 파라미터 (조건식은 평가된 값)
  messages?: MessagesSpec;
  ruleName?: string;                  // 호출된 규칙명 ('pattern' vs 'match' 구분)
}

interface RuleDefinition {
  validate: RuleFn;
  defaultMessage: string;
}
```

### 전역 규칙 레지스트리

출처: `packages/validator-js/src/rules/index.ts`

```typescript
import { registerRule, unregisterRule, hasRule, getRule, getRuleNames, clearCustomRules }
  from '@form-spec/validator';

registerRule(name: string, rule: RuleDefinition | RuleFn): void;  // 전역 등록 (내장 규칙 오버라이드 가능)
unregisterRule(name: string): boolean;
hasRule(name: string): boolean;
getRule(name: string): RuleDefinition | undefined;  // 커스텀 우선, 그다음 내장
getRuleNames(): string[];
clearCustomRules(): void;
```

`Validator.addRule()`은 인스턴스 한정이고, `registerRule()`은 전역이다.

### 조건식 파서 / 경로 해석기 export

출처: `packages/validator-js/src/legacy/index.ts`

```typescript
// 파서
import { Lexer, Parser, ParseError, parseCondition, isConditionExpression,
         clearConditionCache, getConditionCacheStats,
         setConditionCache, getConditionCache } from '@form-spec/validator';

// 캐시
import { ConditionCache, getDefaultCache, resetDefaultCache } from '@form-spec/validator';

// 경로 해석
import { resolvePathSegments, getValueByPath, setValueByPath,
         resolveWildcardPath, hasWildcard, replaceWildcardWithIndex,
         evaluateCondition, parsePathString, pathToString,
         getParentPath, getFieldName, isChildPath, getRelativePath } from '@form-spec/validator';
```

상세는 [CONDITION-PARSER.md](./CONDITION-PARSER.md) 참조.

### 사용 예

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
} as const;

const validator = new Validator(spec);
const result = validator.validate({ email: '', password: '123' });

result.valid;   // false
result.errors;  // [{ path: 'email', field: 'email', rule: 'required', message: 'Email is required', ... }, ...]
```

---

## PHP (`form-spec/validator`)

출처: `packages/validator-php/src/Legacy/Validator.php`, `packages/validator-php/src/Legacy/ValidationResult.php`
요구사항: PHP `^8.2` (`packages/validator-php/composer.json`)

### Validator 클래스

```php
<?php

namespace FormSpec\Validator;

class Validator
{
    /** @param array $spec 폼 스펙 (type/properties 형식의 배열) */
    public function __construct(array $spec);

    /** 전체 데이터 검증 */
    public function validate(array $data): ValidationResult;

    /** 단일 필드 검증 — 첫 에러 메시지 또는 null */
    public function validateField(string $path, mixed $value, array $allData): ?string;

    /**
     * 커스텀 규칙 추가.
     * callable 시그니처: fn(mixed $value, mixed $param, array $allData, string $path): bool
     * (true = 통과, false = 실패)
     */
    public function addRule(string $name, callable $fn): void;
}
```

### ValidationResult 클래스

```php
class ValidationResult
{
    public readonly bool $valid;
    /** @var array<string, array{field: string, rule: string, message: string, value: mixed}>
     *  필드 경로(dot notation)를 키로 하는 에러 배열 */
    public readonly array $errors;

    public function isValid(): bool;             // $valid 와 동일
    public function getErrors(): array;
    public function getError(string $path): ?array;
    public function hasError(string $path): bool;
    public function getFirstError(): ?string;     // 첫 에러의 message
    public function toArray(): array;             // ['valid' => ..., 'errors' => ...]
}
```

### 사용 예

```php
use FormSpec\Validator\Validator;

$spec = [
    'type' => 'group',
    'properties' => [
        'email' => [
            'type' => 'email',
            'rules' => ['required' => true, 'email' => true],
        ],
    ],
];

$validator = new Validator($spec);
$result = $validator->validate(['email' => 'bad']);

$result->valid;                  // false
$result->getError('email');      // ['field' => 'email', 'rule' => 'email', 'message' => ..., 'value' => 'bad']
```

### 보조 클래스

- `FormSpec\Validator\ConditionParser` — 조건식 평가
  (`evaluate(string $expression, string $currentPath, array $allData, bool $fromGroup = false): bool`,
  `evaluateTernary(string $expression, string $currentPath, array $allData): mixed`).
  출처: `packages/validator-php/src/Legacy/ConditionParser.php`
- `FormSpec\Validator\PathResolver` — 경로 해석
  (`resolve()`, `resolveExpression()`, `getValueByPath()`, `bracketToDot()`, `dotToBracket()` 등).
  출처: `packages/validator-php/src/PathResolver.php`

> PHP 전용 호환: 규칙 파라미터로 `['when' => '조건식']` 객체 형식도 허용한다
> (`Validator.php` `applyRule()` — 조건 미충족 시 규칙 스킵).
> JS/Go 검증기는 이 형식을 지원하지 않으므로 **크로스언어 스펙에서는
> 조건식 문자열 파라미터를 사용하라** (`required: ".is_display == 2"`).

---

## Go (`validator` 패키지)

출처: `packages/validator-go/validator/legacy/validator.go`, `types.go`, `spec.go`
모듈 경로: `github.com/yejune/form-spec/packages/validator-go`
(`packages/validator-go/go.mod`, go 1.21).
import 경로: `github.com/yejune/form-spec/packages/validator-go/validator`.

### 스펙 파싱

Go 검증기의 내부 `Spec`은 필드 슬라이스 구조다. 기준(canonical) JSON 스펙
(`type`/`properties` 형식)은 `ParseSpec`으로 변환한다. 이때 property·rule
선언 순서가 보존된다.

```go
// ParseSpec parses a canonical form-spec JSON document
// (type/properties/rules format) into a validator Spec.
func ParseSpec(data []byte) (ParsedSpec, error)

type ParsedSpec struct {
    Spec    Spec
    IsGroup bool // 루트가 group 스펙이었는지. 아니면 "value" 단일 필드로 래핑됨
}
```

### Validator

```go
func NewValidator(spec Spec) *Validator

// 전체 데이터 검증
func (v *Validator) Validate(data map[string]interface{}) *ValidationResult

// 단일 필드 검증 — 첫 에러 메시지 포인터 또는 nil
func (v *Validator) ValidateField(path string, value interface{}, allData map[string]interface{}) *string

// 커스텀 규칙 추가 (내장 규칙 오버라이드 가능)
func (v *Validator) AddRule(name string, fn RuleFunc)
```

### 타입

```go
type Spec struct {
    Fields []Field         `json:"fields"`
    Rules  map[string]Rule `json:"rules,omitempty"`
}

type Field struct {
    Name          string                 `json:"name"`
    Type          string                 `json:"type"`
    Label         string                 `json:"label,omitempty"`
    Rules         map[string]interface{} `json:"rules,omitempty"`
    RuleOrder     []string               // rules 키 선언 순서 (ParseSpec 이 채움)
    Messages      map[string]string      `json:"messages,omitempty"`
    Fields        []Field                `json:"fields,omitempty"` // 중첩 group
    Multiple      bool                   `json:"multiple,omitempty"`
    MultipleOnly  bool                   // multiple: "only"
    DisplaySwitch interface{}            `json:"display_switch,omitempty"` // bool 또는 조건식 문자열
    DisplayTarget string                 `json:"display_target,omitempty"`
}

type ValidationResult struct {
    IsValid bool              `json:"isValid"`
    Errors  []ValidationError `json:"errors"`
}

type ValidationError struct {
    Field   string      `json:"field"` // 전체 경로 (dot notation)
    Rule    string      `json:"rule"`
    Message string      `json:"message"`
    Value   interface{} `json:"value,omitempty"`
}

// 커스텀 규칙: nil = 통과, 에러 메시지 포인터 = 실패
type RuleFunc func(value interface{}, params []string, allData map[string]interface{},
                   context *ValidationContext) *string

type ValidationContext struct {
    CurrentPath []string
    FormData    map[string]interface{}
    FieldDef    *Field
}
```

### 사용 예

```go
import "github.com/yejune/form-spec/packages/validator-go/validator"

parsed, err := validator.ParseSpec(specJSON) // 기준 type/properties JSON
if err != nil { ... }

v := validator.NewValidator(parsed.Spec)
result := v.Validate(data)

result.IsValid          // bool
result.Errors[0].Field  // "items.0.code"
```

규칙 레지스트리는 `DefaultRules()`(`validator/rules.go`)로 초기화된다 —
규칙 목록은 [VALIDATION-RULES.md](./VALIDATION-RULES.md) 참조.

---

## Rust (`formspec-validator` 크레이트)

출처: `packages/validator-rust/src/legacy/mod.rs`, `validator.rs`, `spec.rs`, `types.rs`
크레이트: `formspec-validator` (`packages/validator-rust/Cargo.toml`).
deps: `serde`, `serde_json`(`preserve_order`), `regex`. lib + `validate` 바이너리.

Go 검증기를 1:1 포팅한 독립 크레이트다. 동일 기준 JSON 스펙
(`type`/`properties` 형식)을 `parse_spec`으로 파싱하고, 선언 순서를
`serde_json` `preserve_order`로 보존한다.

### 스펙 파싱 / 검증

```rust
use formspec_validator::{parse_spec, ParsedSpec, Validator};
use serde_json::Value;

// 기준 type/properties JSON Value 를 파싱
pub fn parse_spec(root: &Value) -> ParsedSpec;

pub struct ParsedSpec {
    pub spec: Spec,
    pub is_group: bool, // 루트가 group 스펙이었는지. 아니면 "value" 단일 필드로 래핑됨
}

impl Validator {
    pub fn new(spec: Spec) -> Self;

    // 전체 데이터 검증
    pub fn validate(&mut self, data: &Value) -> ValidationResult;
}
```

### CLI 엔트리 (`run_validation`)

검증기 바이너리와 conformance 테스트가 공유하는 단일 진입점
(`lib.rs:52`). 첫 에러를 CLI 응답으로 반환한다.

```rust
pub fn run_validation(spec_value: &Value, input: &Value) -> CliResponse;

pub struct CliResponse {
    pub valid: bool,
    pub error: Option<String>, // 첫 에러의 rule 명
    pub field: Option<String>, // 첫 에러의 dot notation 경로
}
```

### CLI 프로토콜

`validate` 바이너리(`packages/validator-rust/src/bin/validate-legacy.rs`)는
Go CLI(`validate-case.php`/`cmd/validate`)와 동일한 stdin/stdout 프로토콜을 쓴다.

```
stdin:  {"spec": <spec>, "input": <input>}
stdout: {"valid": bool, "error": <rule|null>, "field": <path|null>}
```

비-group 스펙은 `{value: <input>}`으로 래핑되고, 입력 마커
`"__undefined__"`는 `value=null`로 매핑된다 (`convert_input` — `lib.rs:30`).

### 빌드

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd packages/validator-rust && cargo build --release   # → target/release/validate
```

규칙 레지스트리는 `default_rules()`(`packages/validator-rust/src/legacy/rules.rs`)로
초기화되며 다른 세 언어와 동일한 24개 등록명을 갖는다 —
규칙 목록은 [VALIDATION-RULES.md](./VALIDATION-RULES.md) 참조.

---

## 언어별 에러 형식 차이

네 구현 모두 동일한 검증 판정을 내리지만, 에러 컨테이너 표현이 다르다.

| 항목 | JS | PHP | Go | Rust |
|------|----|----|----|------|
| 결과 valid | `result.valid` | `$result->valid` / `isValid()` | `result.IsValid` | `result.is_valid` |
| errors 컨테이너 | `ValidationError[]` 배열 | 경로 키 연관 배열 | `[]ValidationError` 슬라이스 | `Vec<ValidationError>` |
| 전체 경로 | `error.path` | 배열 키 = `field` 값 = 전체 경로 | `error.Field` | `error.field` |
| 필드명만 | `error.field` (마지막 세그먼트) | 없음 | 없음 | 없음 |
| 규칙명 | `error.rule` | `'rule'` | `error.Rule` | `error.rule` |

경로 표기는 전부 dot notation (`items.0.code`)이다. 크로스언어 비교 러너는
이 차이를 정규화해 `{field, rule}` 기준으로 일치 여부를 판정한다.

---

## 백엔드 HTTP API 계약

출처: `examples/README.md` — `node-api`/`php-api`/`go-api`/`rust-api` 4개 예제 서버가 동일하게 구현.

### `POST /api/validate`

요청:

```json
{
  "spec": { "type": "group", "properties": { } },
  "data": { "email": "user@example.com" }
}
```

응답 — **항상 `200`**. 검증 실패는 HTTP 에러가 아니다 (422 없음):

```json
{
  "valid": false,
  "errors": [
    { "field": "email", "rule": "email", "message": "Please enter a valid email address." }
  ]
}
```

`errors`는 항상 존재한다 (`valid: true`면 빈 배열).
4xx/5xx는 서버/요청 오류에만 사용하며 형태는 `{ "error": "..." }`.

### 기타 엔드포인트

- `GET /api/specs` → `{ "specs": ["contact", ...] }`
- `GET /api/specs/{name}` → `{ "name": ..., "spec": {...} }` (없으면 404 `{ "error": ... }`)

---

## 관련 문서

- [SPEC.md](./SPEC.md) — 스펙 형식 명세
- [VALIDATION-RULES.md](./VALIDATION-RULES.md) — 검증 규칙 목록·기본 메시지
- [CONDITION-PARSER.md](./CONDITION-PARSER.md) — 조건식 파서
- [DISPLAY-CONDITIONS.md](./DISPLAY-CONDITIONS.md) — 조건부 표시·검증 스킵
