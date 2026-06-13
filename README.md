# Form-Spec

YAML 기반 폼 생성 및 검증 시스템 — **다중 언어(4) · 다중 프레임워크(3)**.

하나의 폼 스펙(`type: group` + `properties`)을 단일 진실로 삼아, 같은 정의로
**React/Vue/Svelte** 폼 UI를 렌더링하고 **JavaScript/PHP/Go/Rust** 서버 검증을
수행한다. 핵심 보장은 두 가지다.

- **검증 멱등성** — 같은 스펙·같은 데이터는 4개 언어 어디서나 동일한 결과를
  낸다. 공유 픽스처 **1013 케이스**를 4개 언어에 동시 실행해 결과 일치를
  교차 검증한다(`tests/runner/compare-all.js`).
- **렌더 parity** — 3개 프레임워크의 출력 HTML이 legacy Legacy PHP 생성기의
  골든 HTML과 바이트 단위로 일치한다(골든 7종, 각 프레임워크 **7/7**).

## 왜 필요한가

폼 검증은 보통 클라이언트와 서버에 따로 구현되어 규칙이 어긋난다. Form-Spec은
규칙을 YAML 스펙 한 곳에 선언하고, 그 스펙을 모든 런타임이 동일하게 해석하게
만들어 "클라이언트는 통과했는데 서버는 거부"하는 불일치를 구조적으로 없앤다.
legacy Legacy PHP 폼 시스템과의 출력 호환을 유지하므로 기존 자산을 깨지 않고
현대적 스택(React/Vue/Svelte, Go/Rust 백엔드)으로 옮길 수 있다.

## 아키텍처

```
                         ┌──────────────────────────┐
   YAML 폼 스펙  ───────▶│  type: group / properties │  (단일 진실)
   (한 파일)             └────────────┬─────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼ 검증 (멱등)                        ▼ 렌더 (parity)
   ┌──────────────────────────┐         ┌──────────────────────────┐
   │ validator-js  (TS)        │         │ generator-react           │
   │ validator-php (PHP ^8.2)  │         │ generator-vue             │
   │ validator-go  (Go)        │         │ generator-svelte          │
   │ validator-rust (Rust)     │         └────────────┬─────────────┘
   └────────────┬─────────────┘                       │ SSR
                │ 공유 픽스처 1013                       │ 정규화 비교
                ▼                                       ▼
   tests/runner/compare-all.js            tests/fixtures/golden-html/*
   (4언어 결과 일치)                        (Legacy 골든, 7/7 parity)
```

검증기는 규칙 레지스트리·조건식 파서(lexer+AST, ternary, 상대 경로)·경로
해석기를 각 언어로 포팅한 것이고, 생성기는 프레임워크 무관 PHP-cast 헬퍼
(`legacyParity`)를 공유해 동일 마크업을 낸다. 골든 HTML은
`tools/legacy-baseline`이 핀 커밋(`a47ccba`)의 Legacy 원본으로 재생성한다.

## Packages

npm workspaces 모노레포 (`package.json` `workspaces: ["packages/*"]`).
패키지는 npm/Packagist/crates.io에 **미배포** 상태다 — 저장소 내 워크스페이스·경로
참조로 사용한다.

| 경로 | 패키지명 | 설명 |
|------|----------|------|
| [`packages/validator-js`](./packages/validator-js) | `@form-spec/validator` | TypeScript 검증 라이브러리 |
| [`packages/validator-php`](./packages/validator-php) | `form-spec/validator` | PHP 검증 라이브러리 (PHP ^8.2, PHPUnit) |
| [`packages/validator-go`](./packages/validator-go) | `github.com/polyspec/crudui/packages/validator-go` | Go 검증 라이브러리 |
| [`packages/validator-rust`](./packages/validator-rust) | `formspec-validator` (crate) | Rust 검증 라이브러리 + `validate` CLI |
| [`packages/generator-react`](./packages/generator-react) | `@form-spec/generator-react` | React 폼 빌더 — 골든 7/7 parity |
| [`packages/generator-vue`](./packages/generator-vue) | `@form-spec/generator-vue` | Vue 3 폼 빌더 — 골든 7/7 parity |
| [`packages/generator-svelte`](./packages/generator-svelte) | `@form-spec/generator-svelte` | Svelte 폼 빌더 — 골든 7/7 parity |
| [`packages/generator-legacy`](./packages/generator-legacy) | — | legacy Legacy PHP 사본 (골든 baseline용) |

## Quick Start

### 설치 / 빌드

```bash
npm install        # 루트에서: 워크스페이스 일괄 설치
npm run build      # validator-js + generator-react/vue/svelte 빌드
```

검증기 PHP/Go/Rust는 각 언어 툴체인으로 빌드한다(아래 각 절 참조).

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

### 검증기

같은 스펙·같은 데이터에 대해 네 언어가 동일한 `{valid, errors}`를 낸다.

**JavaScript / TypeScript**

```typescript
import { Validator } from '@form-spec/validator';

const validator = new Validator(spec);            // spec: 파싱된 객체
const result = validator.validate(formData);
// result: { valid: boolean, errors: [{ path, field, rule, message, value? }] }
```

**PHP** (^8.2)

```php
use FormSpec\Validator\Validator;

$validator = new Validator($spec);                // $spec: type/properties 배열
$result = $validator->validate($data);            // ValidationResult
$result->valid;                                   // bool
$result->getErrors();                             // 경로 키 에러 배열
```

**Go**

```go
import "github.com/polyspec/crudui/packages/validator-go/validator"

parsed, _ := validator.ParseSpec(specJSON)        // 기준 type/properties JSON
v := validator.NewValidator(parsed.Spec)
result := v.Validate(data)                        // result.IsValid, result.Errors
```

**Rust** (`formspec-validator` 크레이트)

```rust
use formspec_validator::{parse_spec, Validator};

let parsed = parse_spec(&spec_json)?;             // serde_json::Value
let mut v = Validator::new(parsed.spec);
let result = v.validate(&data);                   // result.is_valid, result.errors
```

Rust는 크로스언어 러너용 `validate` CLI도 제공한다(stdin `{spec, input}` →
stdout `{valid, error, field}`):

```bash
cd packages/validator-rust && cargo build --release
echo '{"spec":{...},"input":{...}}' | ./target/release/validate
```

### 폼 빌더 (렌더러)

세 프레임워크가 같은 스펙에서 동일한 Legacy 호환 HTML을 생성한다.

**React**

```tsx
import { FormBuilder } from '@form-spec/generator-react';

function App() {
  return (
    <FormBuilder
      spec={spec}                                  // YAML 문자열 또는 파싱된 객체
      language="ko"
      onSubmit={(data, errors) => console.log(data, errors)}
    />
  );
}
```

**Vue 3** (SSR 예시)

```ts
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { FormBuilder } from '@form-spec/generator-vue';

const app = createSSRApp({
  render: () => h(FormBuilder, { spec, data: {}, language: 'ko' }),
});
const html = await renderToString(app);
```

**Svelte**

```svelte
<script>
  import { FormBuilder } from '@form-spec/generator-svelte';
  export let spec;
</script>

<FormBuilder {spec} language="ko" />
```

API 상세는 [docs/API.md](./docs/API.md) 참조.

## 백엔드 API (기준 계약)

`examples/`의 node/php/go/rust API 서버는 동일한 계약을 따른다.

| 메서드 | 경로 | 응답 |
|--------|------|------|
| `GET` | `/api/specs` | `{ "specs": ["contact", ...] }` |
| `GET` | `/api/specs/{name}` | `200 { name, spec }` / `404 { error }` |
| `POST` | `/api/validate` | **항상 200** `{ valid, errors: [{ field, rule, message }] }` |

검증 실패는 HTTP 에러가 아니다(422 사용 안 함). 잘못된 스펙 형태만 `400 { error }`.
CORS·OPTIONS 프리플라이트 지원. 자세한 포트·기동법은
[examples/README.md](./examples/README.md) 참조.

## Tests (게이트)

```bash
# 크로스언어 멱등성: 1013케이스를 JS/PHP/Go/Rust 에 동일 입력으로 실행해 비교
npm test                                   # = node tests/runner/compare-all.js

# 언어별 단일 게이트
cd packages/validator-js   && npm test      # vitest    — 동일 1013 conformance
cd packages/validator-php  && composer test # PHPUnit   — 동일 1013 conformance
cd packages/validator-go   && go test ./...
cd packages/validator-rust && cargo test    # cargo     — 동일 1013 conformance

# HTML parity: React/Vue/Svelte SSR ↔ Legacy 골든 HTML 7종 (각 7/7)
cd tests/parity              && npm test    # React
cd packages/generator-vue    && npm test    # Vue   (@vue/server-renderer)
cd packages/generator-svelte && npm test    # Svelte (Svelte SSR)
```

테스트 케이스는 `tests/cases/*.json`(19파일, 1013케이스)이 단일 진실이다.
골든 HTML 재생성은 `tools/legacy-baseline/` 파이프라인으로만 한다(핀 커밋 가드).

## Documentation

문서 사이트와 멀티언어 API 레퍼런스는 Makefile로 **멱등하게** 생성한다(언제
돌려도 같은 산출물; `make docs`는 clean 후 재생성).

```bash
make help          # 사용 가능한 타겟
make docs          # API doc(4언어) + 스펙 JSON Schema + 문서 사이트 생성
make docs-dev      # 문서 사이트 로컬 미리보기
make docs-clean    # 생성물 제거
```

수기 문서(스펙·규칙·조건식 명세)는 `docs/`에 있다.

- [API Reference](./docs/API.md) — 4개 언어 Validator API + HTTP API 계약
- [Spec Format](./docs/spec/legacy-schema.md) — 폼 스펙 형식 명세
- [Validation Rules](./docs/VALIDATION-RULES.md) — 등록 규칙·기본 메시지·미구현 목록
- [Condition Parser](./docs/CONDITION-PARSER.md) — 조건식 문법·경로 해석
- [Display Conditions](./docs/DISPLAY-CONDITIONS.md) — 조건부 표시·검증 스킵
- [Testing](./docs/TESTING.md) — 게이트 체계·골든 재생성

## Examples

`examples/` — docker-compose로 전체 실행 (`cd examples && docker-compose up --build`):

- [demo-app](./examples/demo-app/) — React 데모 (8010)
- [node-api](./examples/node-api/) / [php-api](./examples/php-api/) / [go-api](./examples/go-api/) / [rust-api](./examples/rust-api/) — 동일 계약의 검증 API 서버 (8011-8013, 8017)
- [playground](./examples/playground/) — 실시간 스펙 편집기 (8014)
- [legacy-original](./examples/legacy-original/) — legacy Legacy 원본 폼 시스템 (8015)

## Development

```bash
npm run build      # validator-js + generator-react/vue/svelte 빌드
npm run lint       # eslint (validator-js, generator-react)
npm test           # 크로스언어 게이트
make docs          # 문서 생성 (멱등)
```

## License

MIT
