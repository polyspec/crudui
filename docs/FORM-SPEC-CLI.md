# form-spec CLI 명세

`form-spec` CLI 는 자연어 → v2 폼 스펙 작성 루프의 도구층이다. 자체 엔진을 갖지 않는다 — 코드/스키마 단일진실을 import/parse 하거나, 콘솔의 4언어 게이트웨이를 호출하는 얇은 래퍼다. 검증·렌더 로직을 CLI 에 재구현하지 마라.

- 패키지: `packages/form-spec-cli` (bin: `form-spec`)
- 실행: `tsx` 로더로 TS 소스 직접 실행 (`validate-v2.mjs` 와 동일 방식, 별도 빌드 없음).
- 신규 코드는 `describe` 뿐이다. 코드/스키마 통합 추출이 콘솔에 없는 유일한 빈자리이기 때문.

## 0. 아키텍처 — 3층, describe 가 1·2층의 다리

```
지식층  .claude/skills/nl-to-v2-form/SKILL.md
          안정 절차 + 자연어→슬롯 매핑 + 금지원칙 + 예제만 보유.
          휘발성 카탈로그(위젯/규칙/금지키/문법)는 수기 복사 금지 — describe 위임.
            │ (카탈로그 위임)
            ▼
도구층  packages/form-spec-cli  (bin: form-spec)
          describe / check / validate / render / explain / scaffold / list-widgets
          코드 단일진실 import·parse 의 얇은 래퍼. validate/render 는 자체 엔진 0.
            │ (validate/render 백엔드 호출)
            ▼
콘솔    examples/cross-check-console/server
          validate-runner.mjs (4언어 spawn) · render-runner.mjs renderAll (3프레임워크)
```

`describe` 만 1층(코드)에서 산출돼 0층(SKILL.md/MCP)이 카탈로그를 위임받고, `validate`/`render` 는 2층(콘솔)을 위임 호출한다. drift 0: describe 가 읽는 모든 값은 빌드/런타임 객체(import) 또는 파싱된 스키마 — 복사본 0.

## 1. 명령 요약

| 명령 | 한 줄 | 출처 | 구현 상태 |
|---|---|---|---|
| `describe` | 코드/스키마 통합 카탈로그 산출 | generator-core·validator-js·schema JSON in-process | 이번 (신규 코드) |
| `check` | 메타스키마 + forbidden-scan 정적 검증 | ajv(schema JSON) + `scanForbiddenKeys` | 이번 (import 래퍼) |
| `validate` | 값 검증 (규칙·표현식, 4언어) | 콘솔 `validate-runner.mjs` | 후속 (콘솔 백엔드 의존) |
| `render` | SSR 미리보기 (3프레임워크) | 콘솔 `render-runner.mjs renderAll` | 후속 (콘솔 백엔드 의존) |
| `explain` | 스펙 → 자연어 역검증 | describe 분류·규칙 메타 | 이번 (describe 파생) |
| `scaffold` | describe 카탈로그 기반 최소 유효 골격 | describe 출력 | 이번 (describe 파생) |
| `list-widgets` | describe 위젯 섹션의 단축 뷰 | describe 위젯 섹션 | 이번 (describe 파생) |

## 2. 명령 상세

### 2.1 `describe [--json | --md]`

코드/스키마 단일진실을 in-process import/parse 해 통합 capabilities 를 산출한다. 수기 카탈로그 0. 동일 자료를 두 형식으로 렌더한다.

**입력**: 없음 (소스 자동).
**출력**: `--json` 기계가독 객체 / `--md` 사람가독 표·섹션.

수집 출처 (전부 코드, 산문 인용은 문법·분류 2건뿐):

| 항목 | 출처 |
|---|---|
| 위젯 카탈로그 (kind·alias·layout) | `packages/generator-core/src/widget.ts` REGISTRY 키 + 각 evaluator 의 `layout`. 카운트=`WIDGET_COUNT`, 존재판정=`hasWidget` (둘 다 `@form-spec/generator-core` export) |
| layout 패밀리 enum | `widget.ts` `WidgetModel.layout` union: `input-group` `bare` `host-script` `btn-group` `file` `display` `search` `button` |
| 검증 규칙 목록 | `packages/validator-js/src/rules/index.ts` `builtInRules` Map. 런타임 열거=`getRuleNames()` |
| 규칙 분류 (파라미터 의미) | `packages/validator-js/src/v2/validate/validator.ts` `ARRAY_LEVEL_RULES` `PATH_REFERENCE_RULES` `LITERAL_PARAM_RULES` `REGEX_PARAM_RULES` `MEMBERSHIP_PARAM_RULES` + `type:number` 암묵 number 규칙 |
| 슬롯/구조/버킷 | `schema/form-spec-v2.schema.json` definitions(`Field`·`Validate`·`Design`·`Behavior`·`Options`·`Items`·`ItemsSource`·`ItemsModel`·`Multiple`·`Lang`·`Properties`)를 JSON.parse |
| design 노드 이름 | `packages/validator-js/src/v2/types.ts` `DesignNodeName` union(`show`/`class`/`style`/`label`/`wrapper`/`group`/`prepend`) + schema `Design` |
| 금지 메타키 (열거+패턴) | `types.ts` `FORBIDDEN_META_KEYS` + `FORBIDDEN_META_KEY_PATTERN`(`/^x[\s\S]/`). 런타임 동기화=`v2/forbidden-scan.ts`. 메타스키마 거울=schema `ForbiddenKeyNames` |
| 표현식 문법 | `docs/EXPRESSION-GRAMMAR.md` (§1 토큰표/§2 EBNF/§3 우선순위/§6 truthy/§10 비지원) — 산문 단일진실 인용 |
| 분류 규칙 | `docs/SPEC-V2.md` §3 (A x주석 / B 1급만 1급 / C 종속격리 + 공통역할분배) 인용 |

**`--json` 형상** (SKILL/MCP 가 파싱):

```json
{
  "widgetCount": 0,
  "widgets": [{ "kind": "email", "aliases": ["..."], "layout": "input-group" }],
  "layouts": ["input-group", "bare", "host-script", "btn-group", "file", "display", "search", "button"],
  "rules": [{ "name": "required", "alias": null, "paramClass": "array-level" }],
  "slots": {
    "validate": { "subKeys": ["required", "email", "match"] },
    "design": { "nodes": ["show", "class", "style", "label", "wrapper", "group", "prepend"] },
    "behavior": {},
    "options": {}
  },
  "buckets": {
    "items": { "static": "array | value→label map", "source": ["model", "method", "table", "relations", "api_server", "items"] },
    "multiple": ["max", "copy", "sortable", "onclick"],
    "lang": ["mode", "only", "name", "key", "frame", "title", "group_class"]
  },
  "firstClass": ["type", "name", "default", "properties", "items", "multiple", "lang", "label", "description", "placeholder", "prepend", "append", "help", "validate", "design", "behavior", "options", "$ref", "$patch"],
  "forbiddenKeys": { "enum": ["display_switch", "..."], "pattern": "^x[\\s\\S]" },
  "grammar": { "tokens": ["DOT", "..."], "precedence": ["?:", "||", "&&", "==/!=", ">/>=/</<= · in · not in", "!", "primary"], "unsupported": ["산술", "함수 호출", "정규식", "할당", "비트", "루트 경로"] },
  "classification": { "firstClass": "B", "dependencyIsolation": "C", "roleDistribution": "C" }
}
```

`--md` 는 같은 객체를 위젯표·규칙표·슬롯트리·금지키·문법요약·분류규칙 섹션으로 렌더한다.

**drift 탐지기 역할**: 금지키는 두 출처(`types.ts FORBIDDEN_META_KEYS` vs schema `ForbiddenKeyNames` enum)에 거울로 존재한다. describe 는 매 실행 두 출처를 cross-check 하고, 어긋나면 경고를 emit 하고 실패한다 — 표준을 낮추지 않는다. 위젯 추가(REGISTRY 키)·규칙 추가(builtInRules)·슬롯 변경(schema)·금지키 추가(FORBIDDEN_META_KEYS)는 다음 describe 호출이 자동 반영한다.

```bash
form-spec describe --json | jq '.widgetCount'
form-spec describe --md
```

### 2.2 `check <spec.{yml,json}>`

메타스키마 검증(`schema/form-spec-v2.schema.json`, `additionalProperties:false`, `required:[type]`) + forbidden-scan(`scanForbiddenKeys`, 임의 깊이). 1급외 키 / 금지키 / 미등록 슬롯키를 정적으로 적발한다. 값 검증은 하지 않는다 — 그건 `validate` 다.

**입력**: spec 파일(yml 또는 json).
**출력**:

```json
{ "ok": false, "errors": [{ "path": "properties.email.validate.if", "key": "if", "reason": "forbidden meta key" }] }
```

구현: ajv 로 schema JSON 컴파일 + `@form-spec/validator` 의 `scanForbiddenKeys` import. 자체 검증 규칙 0.

```bash
form-spec check ./contact.yml
```

### 2.3 `validate <spec> <data> [--lang js|php|go|rust|all]`

값 검증 (규칙 의미 + 표현식 평가). 자체 엔진 0 — 콘솔 `validate-runner.mjs validateAll` 을 재사용한다. 그 러너는 4언어를 모두 spawnSync CLI 로 돌린다(어느 언어도 in-process 특권 없음):

- JS: `node --import tsx packages/validator-js/bin/validate-v2.mjs` (stdin JSON)
- PHP: `php packages/validator-php/bin/validate-v2.php`
- Go: `packages/validator-go/validate-v2` (컴파일)
- Rust: `packages/validator-rust/target/release/validate-v2` (컴파일)

각 CLI 는 동일 v2 스택을 돈다: compose(G5) → forbidden-scan(§6) → validate(§3 + §2 G1).

**입력**: spec + data (+ 선택 files/basepath for `$ref`).
**출력** (러너 envelope 정규화):

```json
{
  "valid": true,
  "results": [{ "lang": "js", "valid": true, "errors": [], "ms": 0, "loadError": null }],
  "idempotent": true,
  "mismatch": null
}
```

`--lang all`(기본)이면 4언어 합의를 검사한다 — `idempotent:false` + `mismatch.groups` 는 어느 언어가 갈렸는지 보여준다. 합성 LOAD 실패(미해결 `$ref` / 금지키)는 `valid:false` 가 아니라 `loadError:{code,message}` 로 구분된다.

**의존**: 콘솔 백엔드. PHP/Go/Rust 바이너리가 빌드돼 있어야 한다. 콘솔 미빌드 시 후속.

```bash
form-spec validate ./contact.yml ./data.json --lang all
```

### 2.4 `render <spec> [--fw react|svelte|vue|all] [--data <file>] [--lang <code>]`

SSR 미리보기. 자체 렌더 0 — 콘솔 `render-runner.mjs renderAll` 을 재사용한다. 세 프레임워크가 동일 공유 코어(`buildForm`: compose → design/expr eval → i18n → FieldViewModel 트리)를 통과하고 어댑터는 직렬화만 한다(`engine.mjs` `renderReact`/`renderSvelte`/`renderVue`).

**입력**: spec (+ data, language, unsupported).
**출력**:

```json
{
  "results": [{ "fw": "react", "ok": true, "html": "...", "normalized": "...", "ms": 0, "error": null }],
  "parity": true,
  "mismatch": null
}
```

`parity` 는 세 프레임워크의 normalized HTML 이 한 문자열일 때만 참. 렌더 실패는 안정 code 로 표면화: `REF_FILE_NOT_FOUND`(미해결 `$ref`) / `UNSUPPORTED_FIELD_TYPE`(`unsupported:'throw'`).

**의존**: 콘솔 백엔드. 후속.

```bash
form-spec render ./contact.yml --fw all --lang ko
```

### 2.5 `explain <spec> [--lang ko|en]`

스펙 → 자연어 역검증. 필드·필수·조건·선택지·반복·다국어를 산문화한다. 기획서와 대조하는 역검증용. describe 분류·규칙 메타로 산문을 생성한다 — 자체 해석 규칙을 발명하지 않는다.

**입력**: spec.
**출력**: 사람가독 산문 (기획서 대조용).

```bash
form-spec explain ./contact.yml --lang ko
```

### 2.6 `scaffold [--type <widget>] [--from describe]`

describe 카탈로그 기반 최소 유효 스펙 골격 생성 (발명 0). 위젯/슬롯을 describe 출력에서만 고른다.

**입력**: 위젯/슬롯 선택.
**출력**: `check` 통과하는 초안.

```bash
form-spec scaffold --type email
```

### 2.7 `list-widgets [--json]`

describe 위젯 섹션의 단축 뷰 (REGISTRY 키 + alias + layout). 별도 출처 0 — describe 의 얇은 뷰.

**입력**: 없음.
**출력**: 위젯표.

```bash
form-spec list-widgets --json
```

## 3. describe 구현 노트 (`packages/form-spec-cli/src/describe.ts`)

수집 단계 (전부 코드, 산문 인용은 문법·분류 2건뿐):

1. **위젯** — `import { WIDGET_COUNT, hasWidget } from '@form-spec/generator-core'`. REGISTRY 키 열거는 작은 re-export 1줄(`export const WIDGET_KINDS = Object.keys(REGISTRY)`) 추가 또는 `widget.ts` 리터럴 파싱. 각 키→layout 은 evaluator 반환 layout(또는 리터럴 매칭).
2. **규칙** — `getRuleNames()`. 분류 상수(`ARRAY_LEVEL_RULES` 등)는 `validator.ts` 에서 re-export 또는 파싱.
3. **슬롯/구조/버킷** — `JSON.parse(schema/form-spec-v2.schema.json)` → `Field.properties`(1급), `Validate`/`Design`/`Behavior`/`Options`/`Items`/`Multiple`/`Lang` definitions, `DesignNode`, `ForbiddenKeyNames` enum.
4. **금지키** — `import { FORBIDDEN_META_KEYS, FORBIDDEN_META_KEY_PATTERN } from '@form-spec/validator'`. schema enum 과 cross-check — 불일치 시 describe 가 경고 emit 하고 실패.
5. **문법** — `EXPRESSION-GRAMMAR.md` 를 § 번호로 정식 인용.
6. **분류** — `SPEC-V2.md` §3 A/B/C 규칙 인용.

## 4. 콘솔 재사용 경계

form-spec-cli 는 오케스트레이터다. 어떤 검증/렌더 로직도 CLI 에 재구현하지 않는다.

- `validate` = `examples/cross-check-console/server/validate-runner.mjs validateAll` (4언어 spawn).
- `render` = `examples/cross-check-console/server/render-runner.mjs renderAll` (3프레임워크, `engine.mjs`).
- `describe` 만 신규 — 코드/스키마 통합 추출이 콘솔에 없는 유일한 빈자리.

콘솔 게이트웨이의 4언어 stdin-JSON CLI 가 곧 `validate` 의 백엔드다. 게이트웨이는 순수 오케스트레이터(어느 언어도 in-process 특권 없음)이므로 4언어 합의가 엔진 동치의 증거가 된다.
