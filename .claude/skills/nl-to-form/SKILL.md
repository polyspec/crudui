---
name: nl-to-form
description: 자연어 기획서/구술을 검증 통과하는 form-spec CRUDUI 스펙으로 변환한다. 사용자가 폼 설계서·필드 목록·요구사항을 주고 CRUDUI 스펙(YAML/JSON)을 요청할 때, 또는 기존 CRUDUI 스펙을 자연어 의도와 대조·수정할 때 사용한다.
---

# 자연어 → CRUDUI form 생성

자연어 기획서/구술을 `form-spec check` + `validate`를 통과하는 form-spec CRUDUI 스펙으로 만든다.

## 0. 카탈로그는 코드가 가진다 — 여기 적지 마라 (강제)

위젯·layout·검증규칙·역할슬롯·구조버킷·금지키·표현식문법을 이 파일에 나열하지 마라. 항상
`form-spec describe`를 먼저 호출해 **현재** 카탈로그를 읽어라.

- 기계용: `form-spec describe --json` → `{ widgetCount, widgets[], layouts[], rules[], slots, buckets, forbiddenKeys, grammar, classification }`.
- 사람용: `form-spec describe --md`.

이 파일의 어떤 목록도 코드보다 권위 없다. describe가 비거나 실패하면 멈추고 보고하라 —
기억으로 위젯·규칙·슬롯을 지어내지 마라. 코드가 단일진실, describe가 그 다리다. 위젯·규칙·
슬롯·금지키는 코드에서 변한다 — 외워 쓰면 drift다.

## 1. 절차 (상태 기반 루프)

check·validate 둘 다 GREEN이고 explain이 기획서와 일치할 때까지 돈다. 단계를 건너뛰지 마라.

a. **추출** — 기획서/구술에서 필드 후보·라벨·필수여부·선택지·반복·조건·다국어·기본값·동작을 뽑는다.
   불명확하면 묻는다. 추측을 사실로 적지 마라.

b. **분류** — describe의 `classification`(출처: `docs/spec/schema.md §3`)으로 각 키의 자리를 정한다:
   1급 vs `options`/`multiple`/`lang`/`items` 하위 vs `validate`/`design`/`behavior`. 자리 규칙은
   describe만 따른다 — 임의로 1급을 늘리지 마라.

c. **초안** — `type`은 describe `widgets`에 있는 것만 쓴다(없는 type 발명 금지). 슬롯 키는
   describe `slots`/`buckets`에 있는 것만. 역할 슬롯은 다형이다: `false`(끔) | `{객체}` | `true`(`{}` 축약).

d. **check** — `form-spec check <spec>`. 메타스키마(`additionalProperties: false`) + forbidden-scan.
   1급 외 키·금지키·미등록 슬롯키를 잡는다. RED면 c로 돌아가 고친다 — 표준을 낮춰 우회하지 마라.

e. **validate** — `form-spec validate <spec> <data> --lang all`. 4언어로 규칙 의미·표현식 평가를
   검증한다. mismatch(언어 간 불일치)나 비멱등이면 스펙이 틀린 것이다 — 고친다.

f. **미리보기** — `form-spec render <spec> --fw all` 또는 cross-check 콘솔. 3프레임워크 parity 확인.

g. **explain 역검증** — `form-spec explain <spec>`로 스펙을 자연어로 되돌려 기획서와 대조한다.
   누락·오해를 발견하면 a로 돌아간다. 종료 판정은 explain ↔ 기획서 일치까지다.

## 2. 자연어 → CRUDUI 슬롯 매핑

신호는 안정적이라 여기 인라인한다. 단, type·규칙명·슬롯키의 **존재**는 매번 describe로 확인한다 —
아래 type/규칙 이름은 예시이지 카탈로그가 아니다.

- **필드 식별** "이름/이메일/전화…" → `properties.<name>`. type은 describe `widgets`에서 고른다
  (이메일→email, 긴글→textarea, 단일선택→select|choice, 다중선택→multichoice…). 맞는 type이
  없으면 발명 금지 — text로 폴백하고 사용자에게 확인받는다.
- **필수** "반드시/필수" → `validate.required: true`.
- **조건부 필수** "구독 시 필수 / A면 B 필수" → `validate.required: '<표현식>'`(예 `'.subscribe'`,
  `".type == 'company'"`). 별도 `if`/`when`/`show_if` 키 금지(G1) — 조건은 값의 표현식이다.
- **형식** "이메일/숫자/URL/패턴" → `validate.email|number|url|match`(정규식은 `match` 인자로만).
  **길이/범위** "n자 이상 / 최소·최대" → `validate.minlength|maxlength|min|max|range`. 규칙명은
  describe `rules`에 있는 것만.
- **선택지** "A/B/C 중" → 정적: `items` 배열 또는 value→label 맵(`{ "0": "미사용", "1": "사용" }`).
  동적 "DB/모델에서" → `items.{ model, method, table, relations }`. type은 select|choice|multichoice.
- **반복** "여러 개 / N개까지 / 추가·삭제 / 정렬" → `multiple: true` 또는 `multiple: { max, copy, sortable, onclick }`.
  레거시 `multiple_max`·`add_buttons` 금지 — `multiple` 하위로.
- **다국어 입력** "ko/en 입력란 분리" → `lang: true` 또는 `lang: { only: [ko, en] | { ja: { validate: … } }, frame, title, group_class }`.
- **콘텐츠 번역** "라벨 ko/en" → `label: { ko, en }`. 이건 콘텐츠(G3)이지 분류 대상이 아니다.
- **보임새/표시** "A면 보임 / 색상" → `design.show: '<표현식>'`, `design.class`/`style` 또는
  노드별 `design.{ label | wrapper | group | prepend }`. `xclass`/`element_class` 금지.
- **동작** "변경 시 스크립트 / 클릭 시" → `behavior.onchange|onclick|onload`(불투명 JS, 엔진 미경유).
- **그룹/컨테이너** "섹션/그룹" → `type: group` + `properties`. chrome(collapse/expend/stepper/view_total)는 `options` 하위.
- **기본값** "기본 X" → `default`.
- **합성** "다른 폼 상속 / 일부 수정" → `$ref`/`$patch`. `$merge`/`$after`/`$before` 금지.

매핑은 추측을 스펙으로 승격하지 않는다 — 매번 check(메타스키마+forbidden) + validate(4언어)로 닫는다.

## 3. 금지 원칙 (절대부정)

- describe에 없는 `type`을 쓰지 마라. 모르면 발명하지 말고 폴백 후 확인한다.
- 조건을 `if`/`when`/`show_if`로 표현하지 마라 — 조건은 값의 표현식이다(`required: '.x'`, `show: '.x'`). (G1)
- 매직 토큰 `_`를 쓰지 마라 — 기본 분기는 `true`다.
- 레거시 키를 쓰지 마라(`display_switch`·`element_class`·`multiple_max`·`langs`·`$merge`·`seqtokey`…).
  describe `forbiddenKeys`와 분류규칙이 흡수처를 준다.
- `x` 접두 키를 쓰지 마라 — `x{key}`는 주석이고 파서가 무시한다(forbidden 패턴 `^x[\s\S]`). (§3 A)
- 1급(최상위)을 함부로 늘리지 마라 — 1급 자격 없는 세부는 무조건 하위로. (§3 B)
- 표현식에 산술·함수·임의 정규식·`eval`을 넣지 마라. 제한 DSL만(경로·비교·논리·`in`·ternary).
  정규식은 `validate.match` 인자로만. 임의 JS는 `behavior`로 불투명 전달한다. (출처: `docs/EXPRESSION-GRAMMAR.md`)

## 4. 예제

예제도 describe로 검증된 키만 쓴다. 그대로 복사하지 말고 describe로 type·규칙·슬롯 존재를 재확인하라.

### 4.1 email 필수 + 조건부 required

```yaml
properties:
  subscribe:
    type: checkbox
    label: { ko: 뉴스레터 구독, en: Subscribe }
  email:
    type: email
    label: { ko: 이메일, en: Email }
    validate:
      required: ".subscribe"   # 구독 체크 시에만 필수 (G1: 조건은 값)
      email: true
```

### 4.2 multiple + items + lang

```yaml
properties:
  members:
    type: group
    label: { ko: 구성원, en: Members }
    multiple: { max: 5, sortable: true }   # 최대 5행, 정렬 가능
    properties:
      name:
        type: text
        label: { ko: 이름, en: Name }
        lang: { only: [ko, en] }           # 이름을 ko/en 입력란으로 분리 (G3 입력 다국어)
        validate: { required: true }
      role:
        type: select
        label: { ko: 역할, en: Role }
        items: { "0": { ko: 멤버, en: Member }, "1": { ko: 관리자, en: Admin } }
```

## 5. 도구

| 명령 | 용도 |
|---|---|
| `form-spec describe [--json\|--md]` | 코드/스키마 통합 카탈로그(위젯·layout·규칙·슬롯·노드·버킷·금지키·문법·분류). 초안 전 필수. |
| `form-spec check <spec>` | 메타스키마 + forbidden-scan. 1급 외 키·금지키·미등록 슬롯키 적발. |
| `form-spec validate <spec> <data> [--lang js\|php\|go\|rust\|all]` | 값 검증(규칙·표현식), 4언어 parity. |
| `form-spec render <spec> [--fw react\|svelte\|vue\|all]` | SSR 미리보기, 프레임워크 parity. |
| `form-spec explain <spec> [--lang ko\|en]` | 스펙 → 자연어 역검증. 기획서 대조용. |
| `form-spec scaffold [--type <widget>]` | describe 카탈로그 기반 최소 유효 골격(발명 0). |
| `form-spec list-widgets [--json]` | describe 위젯 섹션의 얇은 뷰. |

출처 단일진실: 카탈로그=코드(`packages/generator-core`·`packages/validator-js`·`schema/form-spec.schema.json`),
분류=`docs/spec/schema.md §3`, 문법=`docs/EXPRESSION-GRAMMAR.md`. 이 파일은 절차와 매핑만 — 카탈로그는 describe가 읽는다.
