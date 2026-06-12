# Form-Spec

YAML 기반 폼 생성 및 검증 시스템 (Multi-language, Multi-framework)

하나의 폼 스펙(`type: group` + `properties`)으로 React 렌더링과
JavaScript/PHP/Go/Rust 서버 검증을 수행한다. 4개 언어 검증기는 동일 스펙·동일
데이터에 대해 동일 결과를 내도록 1013케이스 크로스언어 테스트로 검증된다.

## Features

- **선언적 폼 정의** — YAML/JSON 스펙으로 폼 구조와 검증 규칙 정의
- **4개 언어 검증기** — JavaScript/TypeScript, PHP(^8.2), Go, Rust — 크로스언어 결과 일치 보장
- **React/Vue/Svelte 폼 빌더** — 스펙에서 폼 UI 생성 (legacy Limepie 골든 HTML 7종에 각 7/7 parity)
- **23개 검증 규칙** (+`pattern`/`match` 별칭) — required, email, min/max, in, unique 등
- **조건식 엔진** — lexer+AST 파서, ternary(`?:`), 상대 경로(`.x`/`..x`), 와일드카드(`*`)
- **조건부 표시** — `display_switch`/`display_target` (숨김 필드는 검증 스킵)
- **다국어 라벨** — `ko`/`en`/`ja`/`zh` MultiLangText

## Packages

npm workspaces 모노레포 (`package.json` `workspaces: ["packages/*"]`).
패키지는 npm/Packagist에 **미배포** 상태다 — 저장소 내 워크스페이스/경로 참조로 사용한다.

| 경로 | 패키지명 | 설명 |
|------|----------|------|
| [`packages/validator-js`](./packages/validator-js) | `@form-spec/validator` | TypeScript 검증 라이브러리 |
| [`packages/validator-php`](./packages/validator-php) | `form-spec/validator` | PHP 검증 라이브러리 (PHP ^8.2) |
| [`packages/validator-go`](./packages/validator-go) | `github.com/yejune/form-spec/packages/validator-go` | Go 검증 라이브러리 |
| [`packages/validator-rust`](./packages/validator-rust) | `formspec-validator` (crate) | Rust 검증 라이브러리 + `validate` CLI (deps: serde/serde_json/regex) |
| [`packages/generator-react`](./packages/generator-react) | `@form-spec/generator-react` | React 폼 빌더 — Limepie 골든 7/7 parity |
| [`packages/generator-vue`](./packages/generator-vue) | `@form-spec/generator-vue` | Vue 폼 빌더 — Limepie 골든 7/7 parity |
| [`packages/generator-svelte`](./packages/generator-svelte) | `@form-spec/generator-svelte` | Svelte 폼 빌더 — Limepie 골든 7/7 parity |
| [`packages/generator-legacy`](./packages/generator-legacy) | — | legacy Limepie PHP 사본 (골든 HTML 베이스라인용, `tools/limepie-baseline` 참조) |

## Quick Start

### 설치 / 빌드

```bash
npm install        # 루트에서: 워크스페이스 일괄 설치
npm run build      # @form-spec/validator + @form-spec/generator-react 빌드
```

### 스펙 정의

```yaml
type: group
properties:
  email:
    type: email
    label: Email
    rules:
      required: true
      email: true
    messages:
      required: 이메일을 입력하세요
  name:
    type: text
    label: Name
    rules:
      required: true
      minlength: 2
```

### JavaScript/TypeScript

```typescript
import { Validator } from '@form-spec/validator';

const validator = new Validator(spec);
const result = validator.validate(formData);
// result: { valid: boolean, errors: [{ path, field, rule, message, value? }] }
```

### React

```tsx
import { FormBuilder } from '@form-spec/generator-react';

function App() {
  return (
    <FormBuilder
      spec={spec}            // YAML 문자열 또는 파싱된 객체
      language="ko"
      onSubmit={(data, errors) => console.log(data, errors)}
    />
  );
}
```

### PHP

```php
use FormSpec\Validator\Validator;

$validator = new Validator($spec);          // $spec: type/properties 배열
$result = $validator->validate($data);      // ValidationResult
$result->valid;                             // bool
$result->getErrors();                       // 경로 키 에러 배열
```

### Go

```go
import "github.com/yejune/form-spec/packages/validator-go/validator"

parsed, err := validator.ParseSpec(specJSON) // 정본 type/properties JSON
v := validator.NewValidator(parsed.Spec)
result := v.Validate(data)                   // result.IsValid, result.Errors
```

API 상세는 [docs/API.md](./docs/API.md) 참조.

## Tests (게이트)

```bash
# 크로스언어 멱등성: 1013케이스를 JS/PHP/Go/Rust 에 동일 입력으로 실행해 결과 비교
npm test                                   # = node tests/runner/compare-all.js

# 언어별 옵션 (tests/ 디렉토리에서)
cd tests
npm run test:js                            # JS만
npm run test:php                           # PHP만
npm run test:go                            # Go만
npm run test:rust                          # Rust만

# 단일 언어 단위 게이트
cd packages/validator-js   && npm test      # vitest — 동일 1013 픽스처 conformance
cd packages/validator-php  && composer test # PHPUnit — 동일 1013 픽스처 conformance
cd packages/validator-go   && go test ./...
cd packages/validator-rust && cargo test    # cargo — 동일 1013 픽스처 conformance

# HTML parity: React/Vue/Svelte SSR ↔ Limepie 골든 HTML 7종 비교 (각 7/7)
cd tests/parity              && npm test   # React
cd packages/generator-vue    && npm test   # Vue (@vue/server-renderer SSR)
cd packages/generator-svelte && npm test   # Svelte (Svelte 5 SSR)
# 골든 재생성은 tools/limepie-baseline/ 파이프라인으로만 (README 참조)
```

테스트 케이스는 `tests/cases/*.json`(19파일, 1013케이스)이 단일진실이다.

## Documentation

- [API Reference](./docs/API.md) — 4개 언어 Validator API + HTTP API 계약
- [Spec Format](./docs/SPEC.md) — 폼 스펙 형식 명세
- [Validation Rules](./docs/VALIDATION-RULES.md) — 등록 규칙·기본 메시지·미구현 목록
- [Condition Parser](./docs/CONDITION-PARSER.md) — 조건식 문법·경로 해석
- [Display Conditions](./docs/DISPLAY-CONDITIONS.md) — 조건부 표시·검증 스킵

## Examples

`examples/` — docker-compose로 전체 실행 (`cd examples && docker-compose up --build`):

- [demo-app](./examples/demo-app/) — React 데모 (8010)
- [node-api](./examples/node-api/) / [php-api](./examples/php-api/) / [go-api](./examples/go-api/) / [rust-api](./examples/rust-api/) — 동일 계약의 검증 API 서버 (8011-8013, 8017)
- [playground](./examples/playground/) — 실시간 스펙 편집기 (8014)
- [limepie-original](./examples/limepie-original/) — legacy Limepie 원본 폼 시스템 (8015)

API 계약·포트 상세는 [examples/README.md](./examples/README.md) 참조.

## Development

```bash
npm run build      # validator-js + generator-react 빌드
npm run lint       # eslint (validator-js, generator-react)
npm test           # 크로스언어 게이트
```

## License

MIT
