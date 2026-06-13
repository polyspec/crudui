# Form-Spec CRUDUI 설계 명세

> legacy은 legacy Limepie를 포팅해 멱등성과 parity를 확보했다. CRUDUI는 그 위에서 문법
> 자체를 다시 세운다. 목적은 세 가지뿐이다: **복잡도 감소, 학습 곡선 감소,
> 일관된 규칙 수립.** legacy를 버리지 않고 보완하여 "진짜 1.0"을 만든다.

## 0. 이 문서의 지위

이 문서는 CRUDUI 문법의 **헌법**이다. 아래 설계 원칙(R1~R7)이 단일 진실이며, 모든
필드 키·네임스페이스·동작은 이 원칙에서 도출된다. 원칙과 충돌하는 문법은 CRUDUI에
존재할 수 없다. 원칙 자체가 틀렸다고 판단되면 문법을 고치지 말고 원칙을 먼저
정정한다.

legacy 명세는 [SPEC.md](./SPEC.md), 검증 의미론은
[VALIDATION-RULES.md](./VALIDATION-RULES.md)의 "검증 의미론 원칙"이다. CRUDUI는 이
의미론을 그대로 계승한다(무엇을 검증하는가는 불변, 어떻게 선언하는가만 바뀐다).

**이 문서의 범위**: CRUDUI의 핵심 골격(역할 분리, `display` 통합, 행 정체성 모델)과
설계 원칙을 확정한다. 데이터 바인딩(`model`/`store_object` 등)과 다국어(i18n)
상세 문법은 이 골격 위에서 별도 후속 명세로 다룬다. 후속 명세도 R1~R7을 따른다.

## 1. 설계 원칙 (규칙)

**R1 — 역할 분리 (한 키는 한 역할).**
한 속성은 구조·검증·표현·동작·조건 중 정확히 하나의 역할만 가진다. 한 필드
객체에 이들을 평면으로 섞지 않는다. 역할은 네임스페이스로 가른다. legacy의 평면
구조(`type`+`class`+`rules`+`onchange`+`display_target`이 동급으로 나열)는
역할 경계가 없어 폐기한다.

**R2 — 단일 진실 (한 개념은 한 곳).**
같은 개념을 표현하는 키가 둘 이상이면 하나로 합친다. legacy의 조건부 표시는
`display_switch`/`display_target`/`display_target_condition_class`/
`display_target_condition_style`/`all_of`/`any_of`로 6갈래 흩어져 있다. CRUDUI는
이를 단일 `display`로 통합한다.

**R3 — 정체성·직렬화·UI추적의 분리.**
반복(multiple) 행의 세 가지 책임은 서로 다른 메커니즘이 담당한다.
어느 하나를 다른 것에 끼워넣는 편법을 금지한다.
- 직렬화는 배열 인덱스가 담당한다.
- 행 정체성(기존/신규 판별)은 데이터의 예약 필드가 담당한다.
- 클라이언트 UI 행 추적은 프레임워크의 리스트 키가 담당한다.
legacy은 이 셋을 폼 name의 `__13hex__` 한 자리에 모두 욱여넣었다. 이는 jQuery 시대의
편법이며 R1·R4를 동시에 위반한다. CRUDUI에서 폐지한다.

**R4 — 매직 토큰 금지.**
학습 없이 읽을 수 없는 토큰을 스펙·데이터·name에 두지 않는다. 13자리 hex
uniqid, `Math.random` 생성 키, `{13}` 정규식, "키 보존 삭제" 같은 암묵 규칙을
전부 제거한다. 모든 식별자는 명시적이고 의미를 가진다.

**R5 — 표준 관행 우선.**
배열은 배열로 직렬화하고, 기존/신규 레코드는 id 유무로 구분한다(REST·DB의
보편 관행). 자체 발명은 표준 관행으로 풀리지 않을 때만 한다.

**R6 — 멱등·parity 불변 (기준 사수).**
CRUDUI도 4개 언어(JS/PHP/Go/Rust) 검증 멱등성과 3개 프레임워크(React/Vue/Svelte)
렌더 parity를 게이트로 강제한다. 기준을 달성하지 못한다고 기준을 낮추지 않는다.
기준 자체가 틀렸으면 정정한다.

**R7 — legacy 보완 (대체가 아닌 초월).**
legacy은 CRUDUI 어댑터로 무손실 변환한다. legacy 스펙·데이터·게이트는 그대로 유지된다.
CRUDUI는 legacy을 깨지 않고 그 위로 올라선다.

## 2. 스키마 구조

최상위에는 **콘텐츠와 구조**만 둔다. 나머지는 역할별 네임스페이스로 가른다.

```yaml
<field-key>:
  # ── 구조·콘텐츠 (최상위) ──
  type: email                 # 구조: 필드 타입
  label: Email                # 콘텐츠: 라벨 (다국어 가능)
  description: ...            # 콘텐츠: 설명
  default: ""                 # 데이터: 기본값
  properties: { ... }         # 구조: 자식 필드 (group)
  items: { ... }              # 구조: 선택지 (select/radio/checkbox)
  multiple: true              # 구조: 반복 그룹 (배열)

  # ── 검증 (validate 네임스페이스) ──
  validate:
    required: true
    email: true
    messages:
      required: 이메일을 입력하세요

  # ── 표현 (design 네임스페이스) ──
  design:
    class: form-control
    prepend: "@"
    size: lg

  # ── 동작 (behavior 네임스페이스) ──
  behavior:
    autocomplete: email
    onchange: "..."           # 스크립트는 behavior 안에서만

  # ── 조건부 표시 (display 네임스페이스, 통합) ──
  display:
    if: ".subscribe == true"  # 표시 여부 (안 맞으면 숨김 + 검증 스킵)
```

네임스페이스는 넷이다. 더 늘리지 않는다(R1을 지키되 R4의 복잡도 한도 안에서).

| 네임스페이스 | 역할 | 누가 읽나 |
|---|---|---|
| (최상위) | 구조·콘텐츠·데이터 | 검증기 + 생성기 공통 |
| `validate` | 검증 규칙 + 실패 메시지 | 검증기 |
| `design` | 표현·스타일 | 생성기 |
| `behavior` | 동작·스크립트·상태 | 생성기 |
| `display` | 조건부 표시 | 검증기(스킵) + 생성기(숨김) |

## 3. 네임스페이스 매핑 (legacy 전수조사 → CRUDUI 위치)

| legacy 속성 | CRUDUI 위치 |
|---|---|
| `type` `label` `description` `placeholder` `default` `properties` `items` `name` `key` | 최상위 (콘텐츠·구조) |
| `multiple`('only' 포함) | 최상위 `multiple: true` ('only'는 §5에서 폐지) |
| `rules` {27개} | `validate` |
| `messages` | `validate.messages` |
| `class` `style` `element_class` `element_style` `input_class` `wrapper_class` `label_class` `group_class` `group_style` `prepend` `append` `prepend_class` `append_class` `button_class` `variant` `size` `icon` `icon_position` `rows` `height` `zoom` `show_labels` `on_label` `sortable_button` | `design` |
| `onchange` `onclick` `onload` `event` `dynamic_onchange` `init_script` `autofocus` `autocomplete` `readonly` `disabled` `disableds` | `behavior` |
| `display_switch` `display_target` `display_target_condition_class` `display_target_condition_style` `all_of` `any_of` `lang` | `display` (§4) |
| `store_object` `value_field` `thumbnail_field` `target_fields` `api_server` `items.model` | 최상위(데이터 바인딩) — 세부는 후속 절 |

`design`의 다수 `*_class`(요소/래퍼/라벨/그룹)는 평면 나열 대신 대상별로 정돈한다:
`design.class`(요소), `design.wrapper.class`, `design.label.class`, `design.group.class`.
이는 R4(매직·암묵 금지)에 따라 "어디에 붙는 클래스인가"를 키 이름으로 드러낸다.

## 4. 조건부 표시 단일화 (`display`)

legacy의 6갈래를 하나로 통합한다.

```yaml
display:
  if: "<조건식>"            # 표시 여부. 거짓이면 숨김 + 검증 스킵.
  class: "<조건식 또는 값맵>" # 조건부 클래스
  style: "<조건식 또는 값맵>" # 조건부 스타일
```

- `if` ← `display_switch`(자기 조건) + `display_target`(타깃 값 기반)을 하나의
  조건식으로 통합. 조건식은 legacy의 lexer+AST 파서를 그대로 쓴다(상대 경로 `.x`/`..x`,
  와일드카드 `*`, ternary, `and`/`or`/`not`). legacy의 `all_of`/`any_of`는 `and`/`or`로,
  `oneof`가 필요하면 배타 조건을 `and`/`not` 조합으로 표현한다(별도 키 신설 금지).
- `class` ← `display_target_condition_class`. `style` ← `display_target_condition_style`.
- `lang`(다국어 필드 확장)은 표시 조건이 아니라 콘텐츠 확장이므로 `display`가
  아닌 별도 처리로 분리한다(후속 절).

숨김 시 검증 스킵은 legacy의 검증 의미론을 그대로 따른다(VALIDATION-RULES.md).

## 5. 반복(multiple)과 행 정체성 — `__13hex__` 폐지

### 5.1 legacy 메커니즘과 그 대가

legacy은 행의 정체성을 폼 name의 **키 형태**로 인코딩했다.
- 기존 행(DB에서 로드): 숫자 온리 키 — 그 숫자가 곧 레코드 PK. `items[42][name]`.
- 신규 행(+ 버튼): 문자열+숫자 uniqid 키. `items[__a1b2c3__][name]`.
- 서버: 숫자 키 → UPDATE(그 PK), uniqid 키 → INSERT.

키 하나로 "기존/신규 + 어느 PK"를 동시에 판별하는 영리한 설계다. 그러나 대가가
크다. **신규 행이 문자열 키라 데이터가 배열이 아니라 객체가 된다**
(`{ "42": {...}, "__hex__": {...} }`). 이 객체 키 구조가 4개 언어에서 다르게
처리되어 객체키 멱등 갭(에러 경로 PHP `rows.v` vs JS/Go/Rust `rows.__uid__.v`)을
낳았고, legacy에서는 이를 PHP 수정으로 메웠다. 즉 **legacy의 키-정체성 방식은 그 갭의
원인**이다. R1·R3(키 하나가 직렬화·정체성·UI추적 3역할)과 R4(uniqid 매직)를
동시에 위반한다.

### 5.2 CRUDUI — 세 책임의 분리

R3·R4·R5에 따라 정체성을 키에서 데이터로 빼낸다. 그 결과 데이터가 배열이 되고,
객체키 갭의 **원인 자체가 사라진다**(증상 패치가 아니라 원인 제거).

| 책임 | legacy (편법) | CRUDUI |
|---|---|---|
| 직렬화 | `items[42][name]` / `items[__hex__][name]` | `items[0][name]` — 배열 인덱스(순번) |
| 행 정체성 | 키 형태(숫자=기존, 문자열=신규) | 데이터 예약 필드 `id` — 기존 행은 PK 보유, 신규 행은 없음 |
| 클라 UI 추적 | name의 uniqid | 프레임워크 리스트 키 (generator 내부, 스펙·데이터에 노출 안 됨) |

**제출 데이터 형태:**
```jsonc
// legacy: 객체 + 키-인코딩 정체성
{ "items": { "42": { "name": "..." }, "__a1b2c3def45__": { "name": "..." } } }
// CRUDUI: 배열 + 데이터 id
{ "items": [ { "id": 42, "name": "..." },   // 기존 행: id 보유 → UPDATE
             { "name": "..." } ] }          // 신규 행: id 없음 → INSERT
```

### 5.3 +/−/수정/이동/삭제 동작

질문의 핵심: **시퀀스 인덱스를 쓰면 기존 행과 +/−로 바뀌는 행을 어떻게
구분하는가.** CRUDUI의 답은 "키(인덱스)는 정체성을 갖지 않는다"이다.

- **+추가**: 배열에 행을 푸시한다. `id` 없음 = 신규. 클라이언트는 로컬 리스트 키를
  부여한다(제출되지 않음).
- **수정**: 기존 행을 편집한다. `id`는 유지된다.
- **이동**: 인덱스 순서만 바뀐다. `id`와 리스트 키가 행을 따라간다.
- **−삭제**: 배열에서 제거한다. multiple 그룹은 **컬렉션 전체를 제출**하므로,
  서버는 `원본 id 집합 − 제출 id 집합 = 삭제 대상`으로 판별한다(Rails nested
  attributes · Prisma `set`의 표준 동기화 의미론). 키 보존 같은 편법이 필요 없다.

인덱스는 제출 시점에 순서대로 재계산되지만, 기존 행의 정체성은 `id`가, 클라
UI 추적은 리스트 키가 운반하므로 인덱스 변동이 무엇도 깨뜨리지 않는다. 신규 행은
모두 `id`가 없으므로 서로 구분할 필요가 없다(전부 INSERT).

### 5.4 제거되는 것

`__13hex__` name 키, `Math.random`/카운터 uniqid 생성, `{13}` 정규식, "키 보존
삭제" 의미론, 숫자/문자열 키 분기, `multiple: 'only'`(객체 키 모드)가 전부
사라진다. `multiple`은 `true`만 남으며 데이터는 **항상 배열**이다. 객체키 멱등
갭은 CRUDUI 데이터 모델에 존재할 수 없다.

## 6. 예시 (legacy → CRUDUI)

```yaml
# ── legacy ──
contacts[]:
  type: group
  multiple: true
  class: "border p-3"
  rules: { mincount: 1 }
  display_target: ".has_contact"
  display_target_condition_style: { "1": "display:block", "0": "display:none" }
  properties:
    email:
      type: email
      class: form-control
      prepend: "@"
      rules: { required: true, email: true }
      messages: { required: 이메일 필수 }
      onchange: "validate_email()"

# ── CRUDUI ──
contacts:
  type: group
  multiple: true
  validate: { mincount: 1 }
  design: { wrapper: { class: "border p-3" } }
  display: { if: ".has_contact" }
  properties:
    email:
      type: email
      validate:
        required: true
        email: true
        messages: { required: 이메일 필수 }
      design: { class: form-control, prepend: "@" }
      behavior: { onchange: "validate_email()" }
```

## 7. 마이그레이션 (legacy ↔ CRUDUI 어댑터)

R7에 따라 legacy을 깨지 않는다.
- **legacy → CRUDUI 스펙 어댑터**: legacy 평면 스펙을 §3 매핑대로 네임스페이스로 재배치하는
  무손실 변환기. legacy 스펙 자산을 자동 변환한다.
- **데이터 어댑터**: legacy 객체+uniqid 데이터 ↔ CRUDUI 배열+id 데이터 양방향 변환.
  기존 uniqid는 CRUDUI의 `id`로 승격(또는 신규 매핑 테이블).
- legacy 게이트(compare-all 1074, parity, legacy-client)는 그대로 유지된다. CRUDUI는
  별도 게이트를 추가하며 legacy을 대체하지 않는다.

## 8. CRUDUI 게이트 (R6)

CRUDUI도 동일한 기준으로 강제한다.
- 4언어 검증 멱등성: CRUDUI 스펙·데이터를 JS/PHP/Go/Rust가 동일 판정.
- 3프레임워크 렌더 parity: CRUDUI 스펙을 React/Vue/Svelte가 동일 HTML로.
- legacy↔CRUDUI 어댑터 왕복 무손실: legacy → CRUDUI → legacy 변환이 원본과 일치.
- 검증 의미론 원칙(VALIDATION-RULES.md) 계승: required trim, type:number 유한수,
  무효 파라미터 skip, 객체키 카운트 등은 CRUDUI에서도 불변.

## 9. 비목표 (YAGNI)

- JSON Schema 채택 안 함: verbose하고 학습 곡선이 높아 목적(복잡도·학습곡선
  감소)에 반한다. "표준"은 일관된 규칙으로 달성하지 표준 스키마 언어 도입으로
  달성하지 않는다.
- 네임스페이스 5개 이상으로 쪼개지 않는다(R1과 R4의 균형).
- `oneof` 등 신규 조건 키 추가 안 함: 조건식 `and`/`or`/`not`으로 충분하다(R2).
