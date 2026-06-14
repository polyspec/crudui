# polyspec CLI 명세

`polyspec` CLI 는 자연어 → v2 폼 스펙 작성 루프의 도구층이다. 자체 엔진을 갖지 않는다 — 코드/스키마 단일진실을 import/parse 하거나, 콘솔의 4언어 게이트웨이를 호출하는 얇은 래퍼다. 검증·렌더 로직을 CLI 에 재구현하지 마라.

- 패키지: `packages/cli` (pkg 명 `@polyspec/cli`, bin: `polyspec`)
- 실행: `tsx` 로더로 TS 소스 직접 실행 (`validate-v2.mjs` 와 동일 방식, 별도 빌드 없음).

**구현 vs 로드맵 (정직 분리)**. 이 문서는 두 상태를 섞지 않는다.

- **구현됨**: `describe` · `check` · `explain` · `list-widgets`. `bin/polyspec.mjs` 에 등록돼 동작한다. 소스: `src/describe.ts` · `src/check.ts` · `src/explain.ts` (list-widgets 는 describe 의 얇은 뷰, 별도 src 없음).
- **로드맵 (미구현)**: `validate` · `render` · `scaffold`. `src/` 에 파일 없음, `bin/polyspec.mjs` 에 미등록 — 지금 호출하면 `unknown subcommand` 로 종료(exit 2)한다. 콘솔 백엔드 위임 설계만 확정, 코드는 아직 없다.

미구현 명령을 구현처럼 쓰지 마라. 아래 표·USAGE·예시는 두 상태를 라벨로 구분한다.

## 0. 아키텍처 — 3층, describe 가 1·2층의 다리

```
지식층  .claude/skills/nl-to-v2-form/SKILL.md
          안정 절차 + 자연어→슬롯 매핑 + 금지원칙 + 예제만 보유.
          휘발성 카탈로그(위젯/규칙/금지키/문법)는 수기 복사 금지 — describe 위임.
            │ (카탈로그 위임)
            ▼
도구층  packages/cli  (bin: polyspec)
          [구현] describe / check / explain / list-widgets
          [로드맵] validate / render / scaffold
          코드 단일진실 import·parse 의 얇은 래퍼. validate/render 는 자체 엔진 0.
            │ (validate/render 백엔드 호출 — 로드맵)
            ▼
콘솔    examples/cross-check-console/server
          validate-runner.mjs (4언어 spawn) · render-runner.mjs renderAll (3프레임워크)
```

`describe` 는 1층(코드)에서 산출돼 0층(SKILL.md/MCP)이 카탈로그를 위임받는다. `validate`/`render` 는 2층(콘솔)을 위임 호출하도록 설계됐으나 아직 미구현(로드맵)이다 — 현재 콘솔 백엔드(`validate-runner.mjs`/`render-runner.mjs`)는 콘솔 서버가 직접 쓰고, CLI 래퍼는 아직 없다. drift 0: describe 가 읽는 모든 값은 빌드/런타임 객체(import) 또는 파싱된 스키마 — 복사본 0.

## 1. 명령 요약

| 명령 | 한 줄 | 출처 | 구현 상태 |
|---|---|---|---|
| `describe` | 코드/스키마 통합 카탈로그 산출 (form + list capability 포함) | generator-core·validator-ts·schema JSON in-process | **구현됨** (`src/describe.ts`) |
| `check` | 메타스키마 + forbidden-scan + leaf-type 카탈로그 정적 검증 | ajv(schema JSON) + `scanForbiddenKeys` + `WIDGET_KINDS` | **구현됨** (`src/check.ts`) |
| `explain` | 스펙 → 자연어 역검증 | describe 분류·규칙 메타 | **구현됨** (`src/explain.ts`) |
| `list-widgets` | describe 위젯 섹션의 단축 뷰 | describe 위젯 섹션 | **구현됨** (describe 파생, bin 인라인) |
| `validate` | 값 검증 (규칙·표현식, 4언어) | 콘솔 `validate-runner.mjs` (설계) | **로드맵 (미구현)** — src 없음, bin 미등록 |
| `render` | SSR 미리보기 (3프레임워크) | 콘솔 `render-runner.mjs renderAll` (설계) | **로드맵 (미구현)** — src 없음, bin 미등록 |
| `scaffold` | describe 카탈로그 기반 최소 유효 골격 | describe 출력 (설계) | **로드맵 (미구현)** — src 없음, bin 미등록 |

`bin/polyspec.mjs` USAGE 가 실제 노출하는 명령은 구현된 4개(`describe`/`list-widgets`/`check`/`explain`)뿐이다. 로드맵 3개는 `default` 분기에서 `unknown subcommand`(exit 2)로 떨어진다.

## 2. 명령 상세

### 2.1 `describe [--json | --md]`

코드/스키마 단일진실을 in-process import/parse 해 통합 capabilities 를 산출한다. 수기 카탈로그 0. 동일 자료를 두 형식으로 렌더한다.

**입력**: 없음 (소스 자동).
**출력**: `--json` 기계가독 객체 / `--md` 사람가독 표·섹션.

수집 출처 (전부 코드, 산문 인용은 문법·분류 2건뿐):

| 항목 | 출처 |
|---|---|
| 위젯 카탈로그 (kind·alias·layout) | `packages/generator-core/src/widget.ts` REGISTRY 키 + 각 evaluator 의 `layout`. 카운트=`WIDGET_COUNT`, 존재판정=`hasWidget` (둘 다 `@polyspec/generator-core` export) |
| layout 패밀리 enum | `widget.ts` `WidgetModel.layout` union: `input-group` `bare` `host-script` `btn-group` `file` `display` `search` `button` |
| 검증 규칙 목록 | `packages/validator-ts/src/rules/index.ts` `builtInRules` Map. 런타임 열거=`getRuleNames()` |
| 규칙 분류 (파라미터 의미) | `packages/validator-ts/src/v2/validate/validator.ts` `ARRAY_LEVEL_RULES` `PATH_REFERENCE_RULES` `LITERAL_PARAM_RULES` `REGEX_PARAM_RULES` `MEMBERSHIP_PARAM_RULES` + `type:number` 암묵 number 규칙 |
| 슬롯/구조/버킷 | `schema/polyspec-v2.schema.json` definitions(`Field`·`Validate`·`Design`·`Behavior`·`Options`·`Items`·`ItemsSource`·`ItemsModel`·`Multiple`·`Lang`·`Properties`)를 JSON.parse |
| design 노드 이름 | `packages/validator-ts/src/v2/types.ts` `DesignNodeName` union(`show`/`class`/`style`/`label`/`wrapper`/`group`/`prepend`) + schema `Design` |
| 금지 메타키 (열거+패턴) | `types.ts` `FORBIDDEN_META_KEYS` + `FORBIDDEN_META_KEY_PATTERN`(`/^x[\s\S]/`). 런타임 동기화=`v2/forbidden-scan.ts`. 메타스키마 거울=schema `ForbiddenKeyNames` |
| 표현식 문법 | `docs/EXPRESSION-GRAMMAR.md` (§1 토큰표/§2 EBNF/§3 우선순위/§6 truthy/§10 비지원) — 산문 단일진실 인용 |
| 분류 규칙 | `docs/SPEC-V2.md` §3 (A x주석 / B 1급만 1급 / C 종속격리 + 공통역할분배) 인용 |
| list read-cell 포맷 카탈로그 | `packages/generator-core/src/cell.ts` `CELL_FORMATS`(렌더러 키) + `CELL_FORMAT_DEFAULT`(unknown fallback). schema `CellFormat` 의존키와 cross-check |
| list 구조 | `schema/polyspec-v2.schema.json` definitions(`List`·`Column`·`CellFormat`·`Pagination`·`Sort`·`ListAction`)를 JSON.parse — SPEC-V2 §9 |

**`--json` 형상** (SKILL/MCP 가 파싱 — `src/describe.ts` `DescribeResult` 가 단일진실). 최상위 키 11개: `meta` `widgets` `layouts` `rules` `slots` `buckets` `forbiddenKeys` `grammar` `classification` `matrix` `list`:

```json
{
  "meta": {
    "schema": "polyspec-v2",
    "widgetCount": 0,
    "ruleCount": 0,
    "sources": { "widgets": "...", "rules": "...", "listCellFormats": "...", "listStructure": "..." }
  },
  "widgets": [{ "kind": "email", "layout": "input-group", "aliases": ["..."] }],
  "layouts": ["bare", "btn-group", "button", "display", "file", "host-script", "input-group", "search"],
  "rules": [{ "name": "required", "paramClass": ["array-level"] }, { "name": "pattern", "aliasOf": "match", "paramClass": ["regex-param"] }],
  "slots": {
    "firstClass": ["type", "name", "default", "properties", "items", "multiple", "lang", "label", "..."],
    "validate": { "subKeys": ["..."], "allRules": ["required", "email", "..."] },
    "design": { "nodes": ["class", "style", "label", "wrapper", "group", "prepend"], "nodeAppearanceKeys": ["..."] },
    "behavior": { "subKeys": ["..."] },
    "options": { "knownKeys": ["..."], "open": true }
  },
  "buckets": {
    "items": { "kinds": ["static-array", "value-label-map", "dynamic-source"], "sourceKeys": ["model", "method", "table", "relations", "api_server", "items"], "modelKeys": ["..."] },
    "multiple": { "keys": ["max", "copy", "sortable", "onclick"] },
    "lang": { "keys": ["mode", "only", "name", "key", "frame", "title", "group_class"], "onlyShapes": ["allowlist string[]", "per-language override map"] }
  },
  "forbiddenKeys": { "enum": ["..."], "pattern": "^x[\\s\\S]", "schemaEnum": ["..."], "schemaPattern": "^x[\\s\\S]", "crossCheckOk": true },
  "grammar": { "source": "docs/EXPRESSION-GRAMMAR.md", "tokens": [{ "token": "DOT", "pattern": "..." }], "precedence": ["?:", "||", "&&", "..."], "truthyFalsy": ["..."], "unsupported": ["산술", "함수 호출", "..."] },
  "classification": { "source": "docs/SPEC-V2.md §3", "firstClass": { "structure": ["..."], "content": ["..."], "roleSlots": ["validate", "design", "behavior", "options"] }, "dependencyIsolation": [{ "trigger": "...", "target": "...", "note": "..." }], "roleDistribution": [{ "role": "...", "target": "..." }] },
  "matrix": { "columns": ["validate", "design", "behavior", "options", "items", "multiple", "lang"], "note": "..." },
  "list": {
    "entry": "#/definitions/List",
    "cellFormats": [{ "type": "badge", "isDefault": false }, { "type": "text", "isDefault": true }],
    "cellFormatSchemaKeys": ["type", "truncate", "pattern", "decimals", "map", "href", "..."],
    "cellCrossCheckOk": true,
    "structure": {
      "firstClass": ["..."],
      "column": { "firstClass": ["..."] },
      "pagination": { "keys": ["..."], "modes": ["..."] },
      "sort": { "keys": ["..."], "dirs": ["asc", "desc"] },
      "action": { "objectKeys": ["..."], "shapes": ["..."] },
      "search": { "shapes": ["..."] }
    }
  }
}
```

수집 출처 (전부 코드/스키마): `list.cellFormats` ← `generator-core/src/cell.ts` `CELL_FORMATS`/`CELL_FORMAT_DEFAULT`. `list.cellFormatSchemaKeys` ← schema `CellFormat` definition properties. `list.cellCrossCheckOk` ← 카탈로그 비어있지 않음 + default 포함 + schema `type` 디스패치 키가 open string 일 때 참. `list.structure.*` ← schema `List`/`Column`/`Pagination`/`Sort`/`ListAction` definitions.

`--md` 는 같은 객체를 위젯표·규칙표·슬롯트리·금지키·문법요약·분류규칙·matrix·**List capability** 섹션으로 렌더한다. List 섹션은 read-cell 포맷표(default 표시)·의존키·List 구조(column/pagination/sort/actions/search)를 출력하고, cell.ts ≡ schema CellFormat cross-check 결과를 OK/FAIL 로 표시한다.

**drift 탐지기 역할**: 금지키는 두 출처(`types.ts FORBIDDEN_META_KEYS` vs schema `ForbiddenKeyNames` enum)에 거울로 존재한다. describe 는 매 실행 두 출처를 cross-check 하고, 어긋나면 경고를 emit 하고 실패한다 — 표준을 낮추지 않는다. 위젯 추가(REGISTRY 키)·규칙 추가(builtInRules)·슬롯 변경(schema)·금지키 추가(FORBIDDEN_META_KEYS)는 다음 describe 호출이 자동 반영한다.

```bash
polyspec describe --json | jq '.widgetCount'
polyspec describe --md
```

### 2.2 `check <spec.{yml,json}>` (구현됨)

세 게이트, 전부 단일진실에서(재구현 규칙 0):

1. **메타스키마** — ajv vs `schema/polyspec-v2.schema.json` (`additionalProperties:false`, `required:[type]`). 1급외 키 / 미등록 슬롯키 / `ForbiddenKeyNames` 적발.
2. **forbidden-scan** — `scanForbiddenKeys` (validator-ts/v2/forbidden-scan.ts), 임의 깊이. 메타스키마가 거울로 가진 런타임 백스톱.
3. **leaf-type 카탈로그** — spec 을 compose 한 뒤 필드 트리를 걷고, `properties` 없는 LEAF 필드의 `type` 이 등록된 위젯 kind(`generator-core` `WIDGET_KINDS`)가 아니면 거부. 메타스키마는 `Field.type` 을 무제약 string 으로 모델링하므로 발명된 leaf 타입(`type: checkbox`)은 게이트 1·2 를 통과한다 — 이 게이트가 "describe 카탈로그에서 type 선택" 규칙을 강제하는 유일한 자리. `properties` 를 가진 컨테이너 필드는 면제(SPEC-V2 §3).

값 검증은 하지 않는다 — 그건 `validate`(로드맵)다.

**입력**: spec 파일(yml 또는 json).
**출력** (`CheckResult`):

```json
{ "ok": false, "errors": [{ "path": "/properties/email/validate/if", "key": "if", "reason": "forbidden meta key" }] }
```

`errors[].key` 는 선택(메타스키마 keyword 에러는 생략될 수 있음). exit code: ok 면 0, 아니면 1. 구현: ajv + ajv-formats + js-yaml + `scanForbiddenKeys` + `composeSpec`/`MemoryLoader` + `WIDGET_KINDS` import. 자체 검증 규칙 0.

```bash
polyspec check ./contact.yml
```

### 2.3 `validate <spec> <data> [--lang js|php|go|rust|all]` (로드맵 — 미구현)

> 상태: `src/validate.ts` 없음, `bin/polyspec.mjs` 미등록. 지금 `polyspec validate ...` 는 `unknown subcommand`(exit 2). 아래는 확정 설계다. 콘솔의 4언어 게이트웨이(`validate-runner.mjs`)와 4언어 v2 CLI(`validator-ts/bin`·`php/bin`·`go/cmd/validate-v2`·`rust/src/bin`)는 이미 구현·동작하지만, 그것을 호출하는 polyspec CLI 래퍼는 아직 없다.

값 검증 (규칙 의미 + 표현식 평가). 자체 엔진 0 — 콘솔 `validate-runner.mjs validateAll` 을 재사용한다. 그 러너는 4언어를 모두 spawnSync CLI 로 돌린다(어느 언어도 in-process 특권 없음):

- JS: `node --import tsx packages/validator-ts/bin/validate-v2.mjs` (stdin JSON)
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
polyspec validate ./contact.yml ./data.json --lang all
```

### 2.4 `render <spec> [--fw react|svelte|vue|all] [--data <file>] [--lang <code>]` (로드맵 — 미구현)

> 상태: `src/render.ts` 없음, bin 미등록 (`unknown subcommand`, exit 2). 아래는 확정 설계다. 콘솔 `render-runner.mjs renderAll` 과 3프레임워크 SSR(`engine.mjs`)은 이미 구현·동작하지만, 그것을 호출하는 polyspec CLI 래퍼는 아직 없다.

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
polyspec render ./contact.yml --fw all --lang ko
```

### 2.5 `explain <spec> [--lang ko|en]` (구현됨)

스펙 → 자연어 역검증. 필드·필수·조건·선택지·반복·다국어를 산문화한다. 기획서와 대조하는 역검증용. describe 분류·규칙 메타로 산문을 생성한다 — 자체 해석 규칙을 발명하지 않는다. `--lang` 기본 `ko`, `en` 지원(`src/explain.ts`).

**입력**: spec.
**출력**: 사람가독 산문 (기획서 대조용).

```bash
polyspec explain ./contact.yml --lang ko
```

### 2.6 `scaffold [--type <widget>] [--from describe]` (로드맵 — 미구현)

> 상태: `src/scaffold.ts` 없음, bin 미등록 (`unknown subcommand`, exit 2). 아래는 확정 설계다.

describe 카탈로그 기반 최소 유효 스펙 골격 생성 (발명 0). 위젯/슬롯을 describe 출력에서만 고른다.

**입력**: 위젯/슬롯 선택.
**출력**: `check` 통과하는 초안.

```bash
polyspec scaffold --type email   # 로드맵 — 현재 unknown subcommand
```

### 2.7 `list-widgets [--json]` (구현됨)

describe 위젯 섹션의 단축 뷰 (REGISTRY 키 + alias + layout). 별도 출처 0 — describe 의 얇은 뷰(bin 인라인, 별도 src 없음). 기본 출력은 `kind<TAB>layout (aliases)`, `--json` 은 `describe().widgets` 배열.

**입력**: 없음.
**출력**: 위젯표.

```bash
polyspec list-widgets --json
```

## 3. describe 구현 노트 (`packages/cli/src/describe.ts` — 구현됨)

실제 import/parse 단계 (전부 코드/스키마, 산문 인용은 문법·분류 2건뿐):

1. **위젯** — `import { WIDGET_COUNT, WIDGET_KINDS, WIDGET_LAYOUTS, WIDGET_CANONICAL } from '../../generator-core/src/widget.ts'`. `WIDGET_CANONICAL[key]` 로 alias 그룹핑(canonical-first), 각 키→layout 은 `WIDGET_LAYOUTS`.
2. **규칙** — `getRuleNames()` + 분류 상수(`ARRAY_LEVEL_RULES`/`PATH_REFERENCE_RULES`/`LITERAL_PARAM_RULES`/`REGEX_PARAM_RULES`/`MEMBERSHIP_PARAM_RULES`)를 `validator.ts` 에서 import. `pattern` 은 `match` 의 alias.
3. **슬롯/구조/버킷** — `JSON.parse(schema/polyspec-v2.schema.json)` → `Field.properties`(1급), `Validate`/`Design`/`Behavior`/`Options`/`Items`/`ItemsSource`/`ItemsModel`/`Multiple`/`Lang` definitions, `DesignNode`, `ForbiddenKeyNames` enum.
4. **금지키** — `import { FORBIDDEN_META_KEYS, FORBIDDEN_META_KEY_PATTERN } from '../../validator-ts/src/v2/types.ts'` + `scanForbiddenKeys`. types.ts enum ≡ schema enum ≡ 런타임 scan 3중 cross-check — 불일치 시 `crossCheckOk:false`.
5. **list** — `import { CELL_FORMATS, CELL_FORMAT_DEFAULT } from '../../generator-core/src/cell.ts'` + schema `List`/`Column`/`CellFormat`/`Pagination`/`Sort`/`ListAction` definitions parse. cell.ts 카탈로그 ≡ schema CellFormat cross-check → `cellCrossCheckOk`.
6. **문법** — `EXPRESSION-GRAMMAR.md` 를 § 번호로 정식 인용(파싱).
7. **분류** — `SPEC-V2.md` §3 A/B/C 규칙 인용.

## 4. 콘솔 재사용 경계 (validate/render 는 로드맵)

cli 는 오케스트레이터다. 어떤 검증/렌더 로직도 CLI 에 재구현하지 않는다 — 구현 시 콘솔 백엔드를 위임한다.

- `validate` (로드맵) → `examples/cross-check-console/server/validate-runner.mjs validateAll` (4언어 spawn). 백엔드(4언어 CLI·러너)는 구현·동작, CLI 래퍼만 미구현.
- `render` (로드맵) → `examples/cross-check-console/server/render-runner.mjs renderAll` (3프레임워크, `engine.mjs`). 백엔드는 구현·동작, CLI 래퍼만 미구현.
- `describe`/`check`/`explain`/`list-widgets` (구현됨) — 코드/스키마 단일진실을 in-process import/parse. 콘솔 의존 없음.

콘솔 게이트웨이의 4언어 stdin-JSON CLI 가 곧 미래 `validate` 의 백엔드다. 게이트웨이는 순수 오케스트레이터(어느 언어도 in-process 특권 없음)이므로 4언어 합의가 엔진 동치의 증거가 된다.
