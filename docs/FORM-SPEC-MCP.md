# form-spec MCP 명세

form-spec MCP 서버는 LLM 이 자연어 → CRUDUI 폼 스펙을 작성할 때 카탈로그 로드·정적 검증·값 검증·렌더·역검증을 즉시 호출하는 도구 묶음이다. 모든 tool 은 `form-spec` CLI 명령에 위임한다 — MCP 는 별도 엔진을 갖지 않는다. CLI 가 코드/스키마 단일진실(`describe`/`check`)과 콘솔 4언어 게이트웨이(`validate`/`render`)를 재사용하므로, MCP 도 그 단일진실/게이트웨이를 그대로 위임받는다.

**구현 상태 (정직 분리)**. **MCP 서버 자체는 아직 미구현이다 — 이 문서는 tool 표면 설계(스펙)다.** 저장소에 MCP 서버 코드는 없다(`docs/FORM-SPEC-MCP.md` 가 유일한 산출물). tool 별 위임 대상의 실현 가능성은 위임하는 CLI 명령 상태를 따른다:

- **위임 CLI 가 구현됨**: `formspec.describe`(→ CLI `describe`) · `formspec.check`(→ `check`) · `formspec.explain`(→ `explain`) · `formspec.schema`(스키마 원본 반환). MCP 서버만 붙이면 즉시 동작 가능.
- **위임 CLI 가 로드맵**: `formspec.validate`(→ CLI `validate`, 미구현) · `formspec.render`(→ CLI `render`, 미구현). CLI 래퍼가 먼저 구현돼야 한다.

상세 IO·재사용 경계·구현 노트는 `docs/FORM-SPEC-CLI.md` 참조. 이 문서는 tool 표면과 입력/출력 schema 만 정의한다.

## 0. 위치

```
LLM  ──(자연어→스펙 루프)──▶  MCP tools  ──(위임)──▶  form-spec CLI
                              (서버 미구현)              │ describe/check/explain → 코드·스키마 단일진실 import/parse  [구현]
                                                          │ validate/render        → 콘솔 4언어 게이트웨이 spawn       [로드맵]
                                                          ▼
                                          examples/cross-check-console/server
```

LLM 은 초안 전 `formspec.describe` 로 현재 카탈로그를 로드하고, 초안 후 `formspec.check`(정적) → `formspec.explain`(역검증) 으로 루프를 닫는다. `formspec.validate`(4언어) → `formspec.render`(3프레임워크) 단계는 위임 CLI(`validate`/`render`)가 구현되면 합류한다(로드맵).

## 1. tool 요약

| tool | 위임 CLI | 한 줄 | 위임 CLI 상태 |
|---|---|---|---|
| `formspec.describe` | `describe` | 통합 카탈로그 (위젯·규칙·슬롯·금지키·문법·분류 + **list capability**) | **구현됨** |
| `formspec.check` | `check` | 메타스키마 + forbidden-scan + leaf-type 정적 검증 | **구현됨** |
| `formspec.explain` | `explain` | 스펙 → 자연어 역검증 | **구현됨** |
| `formspec.schema` | (없음) | `schema/form-spec.schema.json` 원본 메타스키마 | **구현됨** (파일 반환) |
| `formspec.validate` | `validate` | 값 검증 (규칙·표현식, 4언어) | **로드맵** (CLI 미구현) |
| `formspec.render` | `render` | SSR 미리보기 (3프레임워크) | **로드맵** (CLI 미구현) |

위 "상태" 는 위임 대상 CLI 명령의 구현 여부다. MCP 서버 자체는 아직 미구현이므로 어떤 tool 도 현재 라이브로 호출되지 않는다 — 서버를 붙이면 구현됨 tool 4개가 먼저 동작한다.

`describe` 가 메타스키마에서 파생된 통합 카탈로그라면, `schema` 는 원본 메타스키마 그 자체다 — AI 가 ajv 로 직접 검증할 때 원본을 쓴다. `describe` 출력은 form(위젯/규칙/슬롯)과 list(read-cell 포맷·List 구조)를 한 객체에 담는다 — list-spec 작성도 같은 tool 로 카탈로그를 받는다.

## 2. tool 상세

### 2.1 `formspec.describe` (위임 CLI 구현됨)

CLI `describe` 위임. 통합 capabilities 산출. AI 가 초안 전 카탈로그를 로드한다 — 위젯·규칙·슬롯·금지키·문법을 prompt 에 수기 복사하지 말고 매번 이 tool 로 읽는다.

**입력**:
```json
{ "format": { "type": "string", "enum": ["json", "md"], "default": "json" } }
```

**출력** (`format:json`): `describe --json` 객체. 최상위 키 11개: `meta`(schema/widgetCount/ruleCount/sources) · `widgets` · `layouts` · `rules` · `slots`(firstClass/validate/design/behavior/options) · `buckets`(items/multiple/lang) · `forbiddenKeys`(enum/pattern/schemaEnum/crossCheckOk) · `grammar` · `classification` · `matrix` · **`list`**. 상세 형상은 `FORM-SPEC-CLI.md` §2.1.

`list` 키 (list-spec capability, schema §9 — 수집 출처 `cell.ts CELL_FORMATS` + schema `List` definitions):
```json
{
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

### 2.2 `formspec.check` (위임 CLI 구현됨)

CLI `check` 위임. 세 게이트: (1) 메타스키마(`additionalProperties:false`, `required:[type]`) + (2) forbidden-scan(임의 깊이) + (3) leaf-type 카탈로그(compose 후 LEAF 필드 `type` 이 `WIDGET_KINDS` 인지). 1급외 키 / 금지키 / 미등록 슬롯키 / 미등록 leaf 타입 적발. 값 검증은 하지 않는다.

**입력**:
```json
{ "spec": { "type": "object" } }
```

**출력** (`key` 는 선택):
```json
{ "ok": false, "errors": [{ "path": "string", "key": "string", "reason": "string" }] }
```

### 2.3 `formspec.validate` (로드맵 — 위임 CLI 미구현)

> 위임 대상 CLI `validate` 가 미구현(`src/validate.ts` 없음, bin 미등록)이므로 이 tool 도 로드맵이다. 아래는 확정 설계 — 콘솔 백엔드(4언어 게이트웨이)는 이미 동작한다.

CLI `validate` 위임 → 콘솔 `validate-runner.mjs validateAll`. 4언어(JS/PHP/Go/Rust) spawn, 동일 CRUDUI 스택(compose → forbidden-scan → validate). 어느 언어도 in-process 특권 없음 — 4언어 합의가 엔진 동치의 증거.

**입력**:
```json
{
  "spec": { "type": "object" },
  "data": { "type": "object" },
  "lang": { "type": "string", "enum": ["js", "php", "go", "rust", "all"], "default": "all" },
  "files": { "type": "object" },
  "basepath": { "type": "string" }
}
```

**출력**:
```json
{
  "valid": true,
  "results": [{ "lang": "string", "valid": true, "errors": [{ "path": "", "field": "", "rule": "", "message": "", "value": null }], "ms": 0, "loadError": null }],
  "idempotent": true,
  "mismatch": null
}
```

합성 LOAD 실패(미해결 `$ref` / 금지키)는 `valid:false` 가 아니라 `loadError:{code,message}` 로 구분된다. `idempotent:false` + `mismatch.groups` 는 어느 언어가 갈렸는지 보여준다.

**의존**: 콘솔 백엔드 + PHP/Go/Rust 바이너리 빌드. CLI `validate` 후속과 동일.

### 2.4 `formspec.render` (로드맵 — 위임 CLI 미구현)

> 위임 대상 CLI `render` 가 미구현(`src/render.ts` 없음, bin 미등록)이므로 이 tool 도 로드맵이다. 아래는 확정 설계 — 콘솔 백엔드(3프레임워크 render-runner)는 이미 동작한다.

CLI `render` 위임 → 콘솔 `render-runner.mjs renderAll`. 세 프레임워크(React/Svelte/Vue)가 동일 공유 코어(`buildForm`)를 통과하고 어댑터는 직렬화만 한다.

**입력**:
```json
{
  "spec": { "type": "object" },
  "data": { "type": "object" },
  "fw": { "type": "string", "enum": ["react", "svelte", "vue", "all"], "default": "all" },
  "language": { "type": "string" }
}
```

**출력**:
```json
{
  "results": [{ "fw": "string", "ok": true, "html": "string", "normalized": "string", "ms": 0, "error": null }],
  "parity": true,
  "mismatch": null
}
```

`parity` 는 세 프레임워크의 normalized HTML 이 한 문자열일 때만 참. 렌더 실패 code: `REF_FILE_NOT_FOUND` / `UNSUPPORTED_FIELD_TYPE`.

**의존**: 콘솔 백엔드. CLI `render` 후속과 동일.

### 2.5 `formspec.explain` (위임 CLI 구현됨)

CLI `explain` 위임. 스펙 → 자연어 역검증 산문. describe 분류·규칙 메타로 생성 — 자체 해석 규칙 발명 0.

**입력**:
```json
{ "spec": { "type": "object" }, "lang": { "type": "string", "enum": ["ko", "en"], "default": "ko" } }
```

**출력**: 사람가독 산문 (기획서 대조용).

### 2.6 `formspec.schema` (구현됨 — 파일 반환)

CLI 위임 아님 — `schema/form-spec.schema.json` 원본을 그대로 반환한다. describe 는 이 메타스키마에서 파생, schema 는 원본이다. AI 가 ajv 로 직접 검증할 때 사용. 메타스키마는 form(`Field`)과 list(`List`/`Column`/`CellFormat`/…) definitions 를 모두 포함한다.

**입력**: 없음.
**출력**: 메타스키마 JSON 원본.

## 3. LLM 사용 흐름 (SKILL.md 루프와 동기)

구현된 tool 만으로 닫는 현재 루프:

1. `formspec.describe` — 현재 카탈로그 로드 (초안 전 강제, form + list).
2. 기획서/구술 → 필드추출 → 분류(describe `classification`, schema §3) → CRUDUI 초안 (type 은 describe `widgets` 에서만, 슬롯키는 describe `slots`/`buckets` 에서만, list 면 `list` 카탈로그에서만).
3. `formspec.check` — 메타스키마 + forbidden-scan + leaf-type. RED 면 2 로.
4. `formspec.explain` — 역검증. 기획서 대조 → 누락/오해 발견 시 2 로.
5. 종료: check GREEN + explain 이 기획서와 일치.

로드맵 합류 (위임 CLI 구현 후): 3 과 4 사이에 `formspec.validate`(4언어 값 검증) → `formspec.render`(3프레임워크 미리보기)가 들어간다. 그때까지 값 검증·렌더는 콘솔(`examples/cross-check-console`)·CLI(`validate`)로 직접 돌린다.

매핑 추측을 스펙으로 승격하지 마라 — 현재 자리는 `check`(메타스키마+forbidden+leaf-type) 로, 로드맵 합류 후엔 `validate`(4언어)로도 닫는다.

## 4. 재사용 관계 (단일진실 위임)

- `formspec.describe`/`check`/`explain` (구현됨) → CLI → 코드/스키마 단일진실 in-process import/parse (`generator-core` WIDGET_*·`cell.ts CELL_FORMATS`·`validator-js` getRuleNames·`scanForbiddenKeys`·`FORBIDDEN_META_KEYS`·schema JSON). 수기 카탈로그 0.
- `formspec.validate`/`render` (로드맵) → CLI(미구현) → 콘솔 `validate-runner.mjs`/`render-runner.mjs`. 검증·렌더 로직 재구현 0. 콘솔 백엔드는 구현·동작, CLI 래퍼만 미구현.
- `formspec.schema` → schema JSON 원본 (describe 의 파생 출처).
- SKILL.md(`nl-to-form`)는 휘발성 카탈로그를 보유하지 않고 `formspec.describe`(또는 `form-spec describe`)에 위임한다 — 코드보다 권위 있는 목록은 없다.
