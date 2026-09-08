# 폼 스펙 형식 명세서

crudui의 폼 정의(YAML/JSON) 형식 명세. 같은 스펙 하나로
React/Vue/Svelte 렌더링(generator-react/vue/svelte)과
4개 언어 서버 검증(validator-ts/php/go/rust)을 수행한다.

타입 정의 출처(아래 React 경로가 렌더러 확장의 기준 — Vue/Svelte 가 동일
필드 모델을 공유한다):

- 검증기 공통: `packages/validator-ts/src/types.ts` (`Spec`, `FieldSpec`,
  `RulesSpec`, `MessagesSpec`, `ActionSpec`, `ButtonSpec`, `ItemsSourceSpec`)
- 렌더러 확장: `packages/generator-react/src/legacy/types.ts` (`ReactFieldSpec`,
  `MultiLangText`, `Language`)
- 필드 타입 레지스트리: `packages/generator-react/src/legacy/components/fields/index.ts`

## 목차

1. [루트 구조](#루트-구조)
2. [필드 공통 속성](#필드-공통-속성)
3. [다국어 텍스트 (MultiLangText)](#다국어-텍스트-multilangtext)
4. [필드 타입](#필드-타입)
5. [group과 multiple](#group과-multiple)
6. [items (선택지)](#items-선택지)
7. [검증 규칙 (rules)](#검증-규칙-rules)
8. [메시지 (messages)](#메시지-messages)
9. [조건부 표시](#조건부-표시)
10. [action (제출 설정)](#action-제출-설정)
11. [Planned / 미구현](#planned--미구현)

---

## 루트 구조

루트는 반드시 `type: group` + `properties` 객체다.

```yaml
type: group              # 필수: 'group'
key: product             # 선택: 폼 고유 키 (필드 name prefix 용)
name: product_form       # 선택
label: 상품 등록          # 선택
title: 상품 등록 페이지    # 선택
description: 설명         # 선택

action:                  # 선택: 제출 설정
  method: POST
  url: /api/products

properties:              # 필수: 필드명 → FieldSpec
  name:
    type: text
    label: 상품명
    rules:
      required: true
```

출처: `packages/validator-ts/src/types.ts:12-22` (`Spec` 인터페이스).

| 속성 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `type` | `'group'` | 예 | 루트는 group 고정 |
| `properties` | object | 예 | 필드 정의 (키 = 필드명, **선언 순서가 검증 순서**) |
| `key` | string | 아니오 | 필드 name prefix (예: `product[name]`) |
| `name` / `label` / `title` / `description` | string | 아니오 | 메타 정보 |
| `action` | object | 아니오 | [action](#action-제출-설정) 참조 |

FormBuilder는 YAML 문자열 또는 파싱된 객체를 모두 받는다
(`packages/generator-react/src/legacy/types.ts:78` `spec: string | Spec`).

---

## 필드 공통 속성

검증기가 해석하는 속성 (`FieldSpec` — `types.ts:27-48`):

```yaml
field_name:
  type: text                  # 필수: 필드 타입
  label: 레이블                # 선택 (다국어 가능)
  description: 설명            # 선택
  placeholder: 안내 텍스트      # 선택
  default: ""                 # 선택: 기본값
  readonly: false             # 선택
  disabled: false             # 선택
  multiple: false             # 선택: true | 'only'
  rules: {}                   # 선택: 검증 규칙 객체
  messages: {}                # 선택: 규칙별 커스텀 메시지
  properties: {}              # type: group 일 때 하위 필드
  items: {}                   # select/choice 등의 선택지
  display_switch: "..."       # 선택: 조건식 또는 boolean
  display_target: "..."       # 선택: 타깃 필드 참조
```

React 렌더러 추가 속성 (`ReactFieldSpec` — generator-react `types.ts:107-175`,
검증에는 영향 없음): `input_class`, `wrapper_class`, `label_class`, `class`,
`prepend`, `append`, `autofocus`, `autocomplete`, `maxlength`,
`button_label`, `add_button_label`, `remove_button_label`, `checkbox_label`,
`variant`, `size`, `icon`, `icon_position`, `sortable`, `min`, `max`, `step`,
`geometry_type`, `helper`, `element` 등.

알 수 없는 속성은 무시된다 (両 타입 모두 index signature 허용).

---

## 다국어 텍스트 (MultiLangText)

라벨류 텍스트 속성은 단일 문자열 또는 **언어 코드 → 문자열 맵**을 받는다.

```typescript
// packages/generator-react/src/legacy/types.ts:29-34
type Language = 'ko' | 'en' | 'ja' | 'zh';
type MultiLangText = string | Record<Language, string>;
```

```yaml
name:
  type: text
  label:
    ko: 상품명
    en: Product Name
    ja: 商品名
    zh: 产品名
  placeholder:
    ko: 상품명을 입력하세요
    en: Enter product name
```

- MultiLangText를 받는 속성: `label`, `description`, `placeholder`, `helper`,
  `button_label`, `add_button_label`, `remove_button_label`, `checkbox_label`
  (`ReactFieldSpec` — generator-react `types.ts:110-167`).
- 현재 언어는 `FormBuilder`의 `language` prop으로 지정하며, 번역은
  i18n 컨텍스트의 `t(text, fallback?)`가 수행한다 (generator-react
  `types.ts:272-279` `I18nContextValue`).
- **검증기는 라벨을 해석하지 않는다** — 다국어 라벨은 렌더링 전용이다.
- `messages`(에러 메시지)의 다국어화는 미구현 — [Planned](#planned--미구현) 참조.

---

## 필드 타입

`packages/generator-react/src/legacy/components/fields/index.ts`의 레지스트리에
등록된 타입 키 목록이다. 타입 매칭은 **대소문자 무시**다
(`getFieldComponent` — `index.ts:127-129`).
마크업 구조는 이 문서의 범위가 아니다 (HTML parity는 `tests/parity` 기준이 단일진실).

| 기준 타입 | 별칭 | 용도 |
|-----------|------|------|
| `text` | `string` | 한 줄 텍스트 |
| `number` | `integer`, `float`, `decimal` | 숫자 |
| `email` | — | 이메일 |
| `password` | — | 비밀번호 |
| `textarea` | — | 여러 줄 텍스트 |
| `time` | — | 시간 |
| `select` | `dropdown` | 드롭다운 |
| `choice` | `radio` | 라디오 그룹 |
| `multichoice` | `checkboxes` | 체크박스 그룹 (다중 선택) |
| `checkbox` | `bool`, `boolean` | 단일 체크박스 |
| `date` | — | 날짜 |
| `datetime` | `datetime-local` | 날짜+시간 |
| `file` | — | 파일 업로드 |
| `image` | — | 이미지 업로드 |
| `browser_image` | `browserimage` | 브라우저 이미지 |
| `cover` | — | 커버 이미지 |
| `search` | `autocomplete` | 자동완성 검색 |
| `tagify` | `tags` | 태그 입력 |
| `tinymce` | `wysiwyg` | 리치 텍스트 에디터 |
| `summernote` | — | 리치 텍스트 에디터 |
| `editorjs` | `editor.js` | 블록 에디터 |
| `postcode` | `zipcode` | 우편번호 |
| `juso` | `address` | 주소 검색 |
| `kakaomap` | `map` | 지도 |
| `geometry` | `geo`, `geojson` | 지오메트리 |
| `switcher` | `switch`, `toggle` | 토글 스위치 |
| `button` | `action` | 버튼 |
| `hidden` | — | 숨김 필드 |
| `dummy` | `html`, `static` | 비입력 UI 요소 |

`group`은 레지스트리 외부에서 처리되는 특수 타입이다
([group과 multiple](#group과-multiple) 참조). 커스텀 타입은
`registerFieldComponent(type, component)`로 등록한다 (`index.ts:134-139`).

검증기는 필드 타입을 대부분 무시하고 `rules`만 평가한다.
예외: `type: number`는 암묵 `number` 규칙 검증
([VALIDATION-RULES.md](./VALIDATION-RULES.md#공통-평가-규칙) 참조),
`type: group`은 재귀 검증.

---

## group과 multiple

### 중첩 그룹

```yaml
address:
  type: group
  label: 주소
  properties:
    postal_code:
      type: text
      rules: { required: true, pattern: "^\\d{5}$" }
    address1:
      type: text
      rules: { required: true }
```

에러 경로는 dot notation: `address.postal_code`.

### 반복 그룹 (multiple: true)

```yaml
items:
  type: group
  multiple: true
  rules:
    mincount: 1        # 배열 레벨 규칙 (배열 전체에 적용)
  properties:
    code:
      type: text
      rules: { required: true, unique: true }
```

데이터가 배열이면 각 항목을 재귀 검증한다 (에러 경로: `items.0.code`).
데이터가 고유 키 객체(`{ "__abc123__": {...} }`)여도 동일하게 동작한다
(JS `Validator.ts:277-280` `isObjectMultiple`; 고유 키 형식은
generator-react `types.ts:507` `UniqueKey` = `` `__${string}__` ``).

### multiple: 'only'

단일 객체를 와일드카드 평가 목적상 배열처럼 다루는 모드
(JS `Validator.ts:271-275`, Go `Field.MultipleOnly`). 배열 인덱스 없이
중첩 properties를 직접 검증한다.

### 스칼라 multiple 필드

group이 아닌 필드의 `multiple: true` + 배열 값: 배열 레벨 규칙
(`required`/`unique`/`mincount`/`maxcount`)은 배열 전체에, 나머지 규칙은
각 원소에 적용된다
([VALIDATION-RULES.md](./VALIDATION-RULES.md#multiple-필드의-배열-레벨-규칙) 참조).

### `field[]` 표기

키 이름 끝의 `[]`는 validator-php가 정규화해 수용한다
(`Validator.php:203-205` — `items[]` → `items` + 배열 취급).
기준 표기는 `multiple: true`를 권장한다.

---

## items (선택지)

`select`/`choice`/`multichoice` 등의 선택지. 두 형식
(`types.ts:39` / `ItemsSourceSpec` `types.ts:74-80`):

```yaml
# 1. 정적 맵: 값 → 라벨
category:
  type: select
  items:
    "": 선택하세요
    electronics: 전자제품
    clothing: 의류

# 2. 동적 소스 선언
brand:
  type: select
  items:
    model: Brand
    method: getSelectOptions
    value_field: id
    label_field: name
    empty_option: "브랜드 선택"
```

---

## 검증 규칙 (rules)

`rules`는 **객체**다 — 규칙명을 키로, 파라미터를 값으로 갖는다.

```yaml
password:
  type: password
  rules:
    required: true
    minlength: 8
    pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$"
```

- 문자열 배열(`rules: ['required']`)이나 `'min:8'` 같은 콜론 문자열 형식은
  **존재하지 않는다**.
- 규칙 파라미터에 조건식 문자열을 쓰면 조건부 규칙이 된다:
  `required: ".payment_type == 'card'"`.
- 등록 규칙 전체 목록·동작·기본 메시지는
  [VALIDATION-RULES.md](./VALIDATION-RULES.md) 참조.
- 조건식 문법은 [CONDITION-PARSER.md](./CONDITION-PARSER.md) 참조.

---

## 메시지 (messages)

규칙명 → 메시지 문자열 맵 (`MessagesSpec` — `types.ts:119-148`).

```yaml
email:
  type: email
  rules:
    required: true
    email: true
  messages:
    required: 이메일을 입력해주세요.
    email: 올바른 이메일 형식이 아닙니다.
```

- 메시지가 없으면 규칙별 기본 메시지 사용
  ([VALIDATION-RULES.md — 기본 에러 메시지](./VALIDATION-RULES.md#기본-에러-메시지)).
- `{0}`, `{1}` 플레이스홀더가 규칙 파라미터로 치환된다.
- 값은 **문자열**이다 — 메시지의 언어 코드 중첩(`messages.ko.required`)은
  미구현 ([Planned](#planned--미구현)).

---

## 조건부 표시

`display_switch`(조건식 문자열 또는 boolean)와 `display_target`(타깃 필드
참조)은 **숨김 대상 필드 자신에** 선언한다. 숨겨진 필드는 검증이 스킵된다.

```yaml
card_number:
  type: text
  display_switch: ".payment_type == 'card'"
  rules: { required: true }

options:
  type: group
  display_target: has_options    # has_options 가 빈 값이면 숨김+검증 스킵
  properties: { ... }
```

상세 의미론(빈 값 판정, `0`/`'0'` 취급, 그룹 스코프)은
[DISPLAY-CONDITIONS.md](./DISPLAY-CONDITIONS.md) 참조.

`element.all_of`는 렌더러 전용 스타일 조건이다 (React/Vue/Svelte 공통, 검증과 무관 —
[DISPLAY-CONDITIONS.md](./DISPLAY-CONDITIONS.md#렌더러의-elementall_of)).

---

## action (제출 설정)

출처: `types.ts:53-69` (`ActionSpec`, `ButtonSpec`).

```yaml
action:
  method: POST
  url: /api/submit
  enctype: multipart/form-data
  buttons:
    submit:
      label: 저장
      class: btn btn-primary
      type: submit
    cancel:
      label: 취소
      class: btn btn-secondary
      href: /list
    draft:
      label: 임시저장
      onclick: saveDraft()
```

---

## Planned / 미구현

다음 항목은 **이 저장소의 어떤 검증기/렌더러에도 구현되어 있지 않다**.
스펙에 선언해도 효과가 없다 (미등록 규칙·미지원 속성은 조용히 무시됨).
legacy Legacy 시스템의 기능이며, 필요 시 향후 도입 후보다.

| 항목 | 비고 |
|------|------|
| `datetime` 검증 규칙 | `datetime` **필드 타입**은 구현됨. 검증은 `date`/`dateISO` 규칙 사용 |
| `minformcount` / `maxformcount` 규칙 | `mincount`/`maxcount`로 대체 ([VALIDATION-RULES.md](./VALIDATION-RULES.md#not-implemented-미구현)) |
| `computed` (계산 필드) | 미구현 |
| `depends_on` (필드 의존 선택지) | 미구현 |
| `remote` (원격 검증 규칙) | 미구현 |
| 다국어 messages (`messages.ko.required` 중첩) | 미구현 — messages 값은 단일 문자열 |
| `$ref` (외부 YAML 참조) | 미구현 |
| 동적 기본값 템플릿 (`default: "{{first_name}}"`) | 미구현 |
| 이벤트 스크립트 (`onchange`/`onclick`/`init_script`/`event`) — 필드 레벨 | 미구현 (action.buttons 의 `onclick` 문자열 전달과는 별개) |

---

## 관련 문서

- [데이터 검증](./operations/validation.ko.md) — 언어별 Validator API
- [VALIDATION-RULES.md](./VALIDATION-RULES.md) — 검증 규칙
- [CONDITION-PARSER.md](./CONDITION-PARSER.md) — 조건식 파서
- [DISPLAY-CONDITIONS.md](./DISPLAY-CONDITIONS.md) — 조건부 표시
