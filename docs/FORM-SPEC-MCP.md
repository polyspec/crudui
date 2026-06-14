# form-spec MCP 명세

form-spec MCP 서버는 LLM 이 자연어 → CRUDUI 폼 스펙을 작성할 때 카탈로그 로드·정적 검증·값 검증·렌더·역검증을 즉시 호출하는 도구 묶음이다. 모든 tool 은 `form-spec` CLI 명령에 위임한다 — MCP 는 별도 엔진을 갖지 않는다. CLI 가 코드/스키마 단일진실(`describe`/`check`)과 콘솔 4언어 게이트웨이(`validate`/`render`)를 재사용하므로, MCP 도 그 단일진실/게이트웨이를 그대로 위임받는다.

상세 IO·재사용 경계·구현 노트는 `docs/FORM-SPEC-CLI.md` 참조. 이 문서는 tool 표면과 입력/출력 schema 만 정의한다.

## 0. 위치

```
LLM  ──(자연어→스펙 루프)──▶  MCP tools  ──(위임)──▶  form-spec CLI
                                                          │ describe/check  → 코드·스키마 단일진실 import/parse
                                                          │ validate/render → 콘솔 4언어 게이트웨이 spawn
                                                          ▼
                                          examples/cross-check-console/server
```

LLM 은 초안 전 `formspec.describe` 로 현재 카탈로그를 로드하고, 초안 후 `formspec.check`(정적) → `formspec.validate`(4언어) → `formspec.render`(3프레임워크) → `formspec.explain`(역검증) 으로 루프를 닫는다.

## 1. tool 요약

| tool | 위임 CLI | 한 줄 |
|---|---|---|
| `formspec.describe` | `describe` | 통합 카탈로그 (위젯·규칙·슬롯·금지키·문법·분류) |
| `formspec.check` | `check` | 메타스키마 + forbidden-scan 정적 검증 |
| `formspec.validate` | `validate` | 값 검증 (규칙·표현식, 4언어) |
| `formspec.render` | `render` | SSR 미리보기 (3프레임워크) |
| `formspec.explain` | `explain` | 스펙 → 자연어 역검증 |
| `formspec.schema` | (없음) | `schema/form-spec.schema.json` 원본 메타스키마 |

`describe` 가 메타스키마에서 파생된 통합 카탈로그라면, `schema` 는 원본 메타스키마 그 자체다 — AI 가 ajv 로 직접 검증할 때 원본을 쓴다.

## 2. tool 상세

### 2.1 `formspec.describe`

CLI `describe` 위임. 통합 capabilities 산출. AI 가 초안 전 카탈로그를 로드한다 — 위젯·규칙·슬롯·금지키·문법을 prompt 에 수기 복사하지 말고 매번 이 tool 로 읽는다.

**입력**:
```json
{ "format": { "type": "string", "enum": ["json", "md"], "default": "json" } }
```

**출력** (`format:json`): `describe --json` 객체 (`widgetCount`/`widgets`/`layouts`/`rules`/`slots`/`buckets`/`firstClass`/`forbiddenKeys`/`grammar`/`classification`). 상세 형상은 `FORM-SPEC-CLI.md` §2.1.

### 2.2 `formspec.check`

CLI `check` 위임. 메타스키마(`additionalProperties:false`, `required:[type]`) + forbidden-scan(임의 깊이). 1급외 키 / 금지키 / 미등록 슬롯키 적발. 값 검증은 하지 않는다.

**입력**:
```json
{ "spec": { "type": "object" } }
```

**출력**:
```json
{ "ok": false, "errors": [{ "path": "string", "key": "string", "reason": "string" }] }
```

### 2.3 `formspec.validate`

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

### 2.4 `formspec.render`

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

### 2.5 `formspec.explain`

CLI `explain` 위임. 스펙 → 자연어 역검증 산문. describe 분류·규칙 메타로 생성 — 자체 해석 규칙 발명 0.

**입력**:
```json
{ "spec": { "type": "object" }, "lang": { "type": "string", "enum": ["ko", "en"], "default": "ko" } }
```

**출력**: 사람가독 산문 (기획서 대조용).

### 2.6 `formspec.schema`

CLI 위임 아님 — `schema/form-spec.schema.json` 원본을 그대로 반환한다. describe 는 이 메타스키마에서 파생, schema 는 원본이다. AI 가 ajv 로 직접 검증할 때 사용.

**입력**: 없음.
**출력**: 메타스키마 JSON 원본.

## 3. LLM 사용 흐름 (SKILL.md 루프와 동기)

1. `formspec.describe` — 현재 카탈로그 로드 (초안 전 강제).
2. 기획서/구술 → 필드추출 → 분류(describe `classification`, schema §3) → CRUDUI 초안 (type 은 describe `widgets` 에서만, 슬롯키는 describe `slots`/`buckets` 에서만).
3. `formspec.check` — 메타스키마 + forbidden-scan. RED 면 2 로.
4. `formspec.validate` — 4언어 값 검증. RED 면 수정.
5. `formspec.render` — 3프레임워크 미리보기. 시각 확인.
6. `formspec.explain` — 역검증. 기획서 대조 → 누락/오해 발견 시 2 로.
7. 종료: check·validate GREEN + explain 이 기획서와 일치.

매핑 추측을 스펙으로 승격하지 마라 — 모든 자리는 `check`(메타스키마+forbidden) 와 `validate`(4언어) 로 닫는다.

## 4. 재사용 관계 (단일진실 위임)

- `formspec.describe`/`check` → CLI → 코드/스키마 단일진실 in-process import/parse (`generator-core` WIDGET_*·`validator-js` getRuleNames·`scanForbiddenKeys`·`FORBIDDEN_META_KEYS`·schema JSON). 수기 카탈로그 0.
- `formspec.validate`/`render` → CLI → 콘솔 `validate-runner.mjs`/`render-runner.mjs`. 검증·렌더 로직 재구현 0.
- `formspec.schema` → schema JSON 원본 (describe 의 파생 출처).
- SKILL.md 는 휘발성 카탈로그를 보유하지 않고 `formspec.describe`(또는 `form-spec describe`)에 위임한다 — 코드보다 권위 있는 목록은 없다.
