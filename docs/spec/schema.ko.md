# 명세 구조

[English](schema.md). 이 문서는 필드와 목록 선언을 정의합니다.
폼 인스턴스, 반복 행 키, 캐싱은 [폼 런타임](form-runtime.ko.md)에 정의합니다.
구현과 배포 상태는 [기능 상태](../features.ko.md)에 기록합니다.

## 패키지 API

CRUDUI의 초기 패키지 버전은 `0.0.1`입니다. 파일명·공개 API·내부 식별자는
구현 세대 표기 없이 역할을 설명합니다. 패키지 루트는 현재 검증기와 폼 렌더러를
제공하며 프레임워크에 독립적인 `@crudui/generator-html` renderer도 포함합니다.
제거한 버전 경로에는 호환 별칭을 제공하지 않습니다.

기계가 읽는 계약은
[`schema/crudui.schema.json`](../../schema/crudui.schema.json)에 관리합니다.
폼, 목록, 상세 선언 형태를 검증합니다. `make docs-schema`는 규칙을 생성하거나
교체하지 않고 이 문서와 공유 고정 데이터를 검사합니다.

## 멤버 순서

명세는 JSON 데이터입니다. JavaScript는 명세를 일반 객체로 받으며, 일반 객체는 배열 인덱스인 멤버 이름(앞자리 0 없이
쓴 0부터 4294967294까지의 십진 정수)을 먼저 숫자 오름차순으로 나열하고 나머지 이름은 작성한 순서로 나열합니다. 모든
런타임은 명세 안의 모든 객체에 이 순서를 사용합니다. `properties`의 필드, 목록 열, 상세 필드, `items` 값과 라벨의 맵, 모든
버킷의 키, 조건 맵, 조합 파일과 조합이 만드는 객체, 컴파일된 템플릿이 해당합니다. 이 문서들의 "선언 순서"는 이
순서를 뜻합니다. 예를 들어 `b`, `10`, `a` 순서로 작성한 `properties`는 모든 런타임에서 `10`, `b`, `a` 순서로
컴파일, 렌더링, 검증됩니다.

배열은 작성한 순서를 유지합니다. [선택 목록](#선택-목록)은 정수 형태의 값을 가진 선택지를 작성한 순서로
선언합니다.

레코드 데이터는 들어온 순서를 유지합니다. 폼 데이터, 목록 행, 상세 레코드, `options.data`는 재정렬하지 않으며,
[순서 있는 JSON](../operations/ordered-json.ko.md)이 그 안의 숫자 멤버 이름을 보존합니다.

## 필드

폼 루트는 `properties` 필드 맵이 있는 `group`입니다. 속성명이 데이터 경로를
정의합니다. 필드는 구조, 콘텐츠, 동작을 다음과 같이 분리합니다.

| 분류 | 키 | 계약 |
| --- | --- | --- |
| 구조 | `type`, `name`, `default`, `properties`, `items`, `multiple`, `lang` | 값, 중첩 그룹, 선택지, 반복을 정의합니다. |
| 콘텐츠 | `label`, `description`, `placeholder`, `prepend`, `append`, `help`, `content` | 문자열 또는 언어 맵을 사용합니다. `content`는 버튼·액션 필드의 컨트롤 텍스트입니다. |
| 검증 | `validate`, `messages` | `validate`는 규칙을 정의하고 `messages`는 규칙 이름별로 오류 메시지를 재정의합니다. |
| 외형 | `design` | 특정 DOM 노드의 표시와 스타일을 정의합니다. |
| 동작 | `behavior` | 이벤트 스크립트를 표현식 평가 없이 보존합니다. |
| 타입 옵션 | `options` | 특정 위젯 타입의 설정을 저장합니다. |
| 합성 | `$ref`, `$patch` | 데이터를 바인딩하기 전에 필드 정의를 로드, 병합, 수정합니다. |

콘텐츠는 폼 필드와 목록·상세 표시 설정 모두 모든 런타임에서 같은 방식으로 표시 언어의 텍스트가 됩니다.
문자열은 그대로입니다. 언어 맵은 표시 언어 항목, `en`, `ko`, 첫 키 순서에서 처음으로 비어 있지 않은 문자열
항목이 되며, 문자열이 아닌 항목은 건너뜁니다. 그 밖의 값(숫자, 불리언, 배열, 그런 항목이 없는 맵)은 빈
텍스트입니다.

종속 설정은 해당 대상 아래에 작성합니다. 반복 행 설정은 `multiple`, 언어 입력
설정은 `lang`, 위젯 설정은 `options`, 동적 선택지 설정은 `items`에 작성합니다.
역할과 구조 설정은 타입 정의가 허용하는 경우 `false`, `true`, 객체를 사용합니다.
`false`는 설정을 끄고 `true`는 기본 설정을 선택합니다.
[TypeScript 타입](../../packages/validator-ts/src/schema.ts)이 허용하는 선언 형태를
정의합니다. 파서는 선언된 키를 보존하며 검증기는 금지된 스키마 키를 제거하지 않고
오류로 처리합니다.

```yaml
type: group
properties:
  email:
    type: email
    label: { en: Email, ko: 이메일 }
    validate: { required: true, email: true }
    design:
      show: ".enabled"
      class: { ".priority == 'high'": text-danger, true: "" }
```

### 범위 필드

`range` 필드는 슬라이더로 고르는 숫자 하나를 가집니다. 범위와 증가 단위는 검증 규칙입니다.
`validate.range`는 `[minimum, maximum]`이고 `validate.step`은 증가 단위입니다. 둘 다 필수이며 표현식이나
조건 맵이 아닌 리터럴 값입니다. 슬라이더는 최솟값에서 단계만큼 움직이므로 최솟값은 단계의 배수이고,
슬라이더의 모든 위치가 두 규칙을 통과합니다. 모든 검증기는 제출된 값을 이 규칙으로 검사합니다
([숫자](validation-rules.ko.md#값)). 숫자이고 범위 안에 있으며 단계의 배수인 값이 통과하고, 빈 값은
`required`를 선언하지 않으면 통과합니다. `append`는 현재 값 뒤에 쓰는 단위입니다. 컨트롤은
[폼 마크업](form-markup.ko.md#범위-필드)이 정의합니다.

```yaml
volume:
  type: range
  label: Volume
  default: 50
  append: "%"
  validate: { range: [0, 100], step: 5 }
```

컴파일은 범위 필드를 `behavior` 다음에 검사하며 `INVALID_FORM_INPUT`와 빈 위치로 실패합니다. 배수 여부는
`step` 규칙과 같이 정확하게 판정합니다.

| 선언 | 메시지 |
| --- | --- |
| `validate.range`가 없거나, 최솟값이 최댓값보다 크지 않은 유한한 숫자 두 개가 아님 | `Invalid validate.range at {path}: expected [minimum, maximum] finite numbers with minimum not above maximum` |
| `validate.step`이 없거나 0보다 큰 유한한 숫자가 아님 | `Invalid validate.step at {path}: expected a finite number above 0` |
| 최솟값이 단계의 배수가 아님 | `Invalid validate.range at {path}: expected a minimum that is a multiple of validate.step` |

## 조건과 외형

조건은 해당 설정의 값으로 작성합니다. `design.show`는 표시 여부를 결정합니다.
`design.class`와 `design.style`은 주 노드에 적용합니다. `design.label`,
`design.wrapper`, `design.group`, `design.prepend`는 해당 노드에 적용합니다.
조건 맵은 처음 일치한 표현식의 값을 선택합니다. 리터럴 키 `true`는 선택적 기본값이며 위치와 무관하게
다른 조건이 모두 실패한 뒤에만 적용됩니다. 일치하는 조건도 기본값도 없으면 결과는 null입니다
([조건맵](expressions.ko.md#8-조건맵)).
`design.show`, `design.class`, `design.style`을 포함한 모든 조건 설정에서 문자열은
[표현식 문법](expressions.ko.md)으로 끝까지 파싱될 때만 표현식이고 그 밖의 문자열은
리터럴이므로 `class: "modal fade in show"`는 클래스 텍스트입니다.
CRUDUI 스키마는 `show_if`, `display_switch`, `display_target` 같은 별도 조건 메타키를
거부합니다.

### 선언한 속성

폼 필드는 CRUDUI가 렌더링하는 요소의 속성을 선언합니다. `design.attributes`는 컨트롤의 속성이고
`design.wrapper.attributes`는 노드 루트의 속성입니다. 대상 요소와 렌더러가 쓰는 방식은
[폼 마크업](form-markup.ko.md#선언한-속성)이 정의합니다. 각각은 속성 이름에서 문자열 값으로의
객체이며, 값은 표현식이나 조건 맵이 아닌 리터럴 텍스트입니다. 이름은 `data-` 또는 `aria-` 뒤에 소문자나
숫자 하나, 그 뒤에 소문자, 숫자, `-`, `_`, `.`가 오는 형태입니다. CRUDUI가 컨트롤이나 노드 루트에 쓰는
이름은 거부합니다: `data-field-path`, `data-lang`, `data-crudui-` 또는 `data-source-`로 시작하는 모든 이름,
`data-name`, `data-rule-name`, `data-default`, `data-is-default`, `data-type`, `data-height`,
`data-upload-server`, `data-fileserver`, `data-server`, `data-max-tags`, `data-keyword-min-length`,
`data-delay`, `data-api-server`, `data-max-width`, `data-min-width`, `data-max-height`,
`data-min-height`, `data-preview-max-width`, `data-preview-max-height`, `data-unsupported-type`.

속성은 폼 필드만 받습니다. 폼 버튼, 목록, 상세의 design과 `label`, `group`, `prepend` 노드는
`attributes`를 알 수 없는 키로 거부합니다. 컴파일은 `design.attributes`를 `design.class`와
`design.style` 다음, 디자인 노드 전에 검사하고, `design.wrapper.attributes`를 wrapper의 `class`와
`style` 다음에 검사합니다. 선언 순서로 모든 이름을 검사한 뒤 모든 값을 검사하며,
`INVALID_FORM_INPUT`와 빈 위치로 실패합니다.

| 선언 | 메시지 |
| --- | --- |
| 객체가 아님 | `Invalid design.attributes at {path}: expected an object` |
| 규칙 밖의 이름 또는 거부된 이름 | `Invalid design.attributes.{name} at {path}: expected a data-* or aria-* name that crudui does not write` |
| 문자열이 아닌 값 | `Invalid design.attributes.{name} at {path}: expected a string` |

wrapper 아래에서 키는 `design.wrapper.attributes`입니다.

### 배치

`group` 필드는 `design.layout`으로 안에 있는 필드의 배치를 선언합니다. 값은 표현식이나 조건 맵이 아닌
리터럴 문자열입니다.

- `inline`: group 안의 모든 field 노드는 깊이에 관계없이 한 행입니다. 너비가 `--crudui-label-width`인
  레이블 열은 레이블을 담고, 컨트롤 열은 컨트롤, 그 아래의 설명, 오류를 담습니다. 레이블이 없는 필드는
  레이블 열을 비워 두므로 모든 행의 컨트롤이 정렬됩니다. group, collection, lang 노드는 쌓인 배치를
  유지하며 안에 있는 field 노드에 inline 배치를 전달합니다. 반복 스칼라 필드의 행과 언어 필드의 항목은
  field 노드가 아니므로 쌓인 배치를 유지합니다.
- `line`: group의 자식 노드를 한 줄에 나란히 둡니다. 예를 들어 select 뒤에 작은 버튼을 둡니다. inline
  배치 안에서 group은 한 행이며, 레이블은 레이블 열에, 줄은 컨트롤 열에 둡니다. line의 자식 노드는 inline
  배치를 받지 않습니다.
- `stacked`: 레이블을 컨트롤 위에 두며, 선언이 없는 폼의 배치입니다. group은 상속받을 inline 배치를
  끝내기 위해 이 값을 선언합니다.

`design.layout`이 없는 group은 둘러싼 group의 배치를 상속합니다. 반복 group은 `stacked`와 `inline`을
받으며, 이 값은 행의 필드에 적용됩니다. 출력은 [폼 마크업](form-markup.ko.md#배치)이 정의합니다.

```yaml
appearance:
  type: group
  label: Appearance
  design: { layout: inline }
  properties:
    theme: { type: select, label: Theme, items: { light: Light, dark: Dark }, description: Applies to every window. }
    font:
      type: group
      label: Font
      design: { layout: line }
      properties:
        family: { type: select, items: { mono: Mono, sans: Sans } }
        size: { type: text }
```

컴파일은 `design.layout`을 `design.attributes` 다음, 디자인 노드 전에 검사하며 `INVALID_FORM_INPUT`와
빈 위치로 실패합니다. 폼 루트는 배치를 받지 않으며, 컴파일은 루트의 `design.layout`을 `buttons` 다음에
검사합니다. JSON Schema는 필드 선언을 기술하므로 루트를 group으로 검사하고, 루트의 배치는 컴파일이
검사합니다.

| 선언 | 메시지 |
| --- | --- |
| group이 아닌 필드, 폼 버튼, 폼 루트의 `design.layout` | `Invalid design.layout at {path}: unknown key`, 루트의 `{path}`는 `form` |
| `stacked`, `inline`, `line`이 아닌 값 | `Invalid design.layout at {path}: expected stacked, inline or line` |
| 반복 group의 `line` | `Invalid design.layout at {path}: expected stacked or inline` |

[표현식 문법](expressions.ko.md)은 토크나이저, 파서, 평가기를 정의합니다.
상대 경로, 와일드카드, 목록, 비교, 논리, 포함 여부, 조건부 값을 지원합니다.
산술, 함수 호출, JavaScript 평가는 지원하지 않습니다. `behavior`의 이벤트 스크립트는
문자열로 보존하며 실행은 표현식 엔진의 범위 밖입니다.

## 언어와 선택지

콘텐츠 번역과 언어별 입력값은 별개입니다. 콘텐츠는 `{ en: Name, ko: 이름 }` 같은
맵을 사용합니다. `lang`은 설정한 언어별 입력을 생성하며 `only`, `frame`, `title`,
`group_class`를 설정합니다. 기본 언어는 `ko`, `en`, `ja`, `zh`입니다.

`items`는 인덱스가 값인 정적 배열, 값과 라벨의 맵, [선택 목록](#선택-목록), `model`이 있는 동적
소스 설정을 사용합니다. 정적 라벨에는 언어 맵을 사용할 수 있습니다. 생성기는 동적 소스 설정을
보존합니다. 레코드 조회와 외부 위젯 실행은 생성기 밖에서 처리합니다.

### 선택 목록

선택 목록은 `{ "value": …, "label": … }` 객체의 배열입니다. 각 `value`는 문자열이나 유한한 숫자이며,
option 값은 그 [정규 텍스트](validation-rules.ko.md#값)입니다. 문자열은 그대로, 숫자는
`Number.prototype.toString`이 쓰는 텍스트입니다. 각 `label`은 값과 라벨의 맵의 라벨과 같습니다. 선택지는
값에 관계없이 목록 순서를 유지합니다.

`items` 배열의 원소 중 하나가 `value` 멤버가 있는 객체이면 그 배열은 선택 목록입니다. 이때 모든 원소는
멤버가 `value`와 `label`(choice·multichoice 필드에서는 [외형](#선택지-외형) 멤버도)뿐인 객체여야 하고, 모든 `value`는 문자열이나 유한한 숫자여야 하며, 정규 텍스트가
같은 값이 둘 있으면 안 됩니다. `items`가 이 규칙 중 하나를 어긴 선택 목록인 필드를 바인딩하면
`INVALID_FORM_INPUT`, 메시지
`Invalid items at {path}: expected value and label pairs with distinct string or number values`, 빈 위치로
실패하며, `{path}`는 필드의 데이터 경로입니다. 이 검사는 필드 타입을 평가하기 전에 실행됩니다. select,
choice, multichoice, search 필드는 값과 라벨의 맵처럼 쌍을 목록 순서대로 option으로 나열하고, dummy
필드는 값의 라벨을 표시합니다. [`in`](validation-rules.ko.md#값)과
[`choice-label` 형식](display-formats.ko.md#choice-label)도 같은 선택 목록을 받습니다.

필요한 순서로 형식을 고릅니다.

- 값과 라벨의 맵은 값을 [멤버 순서](#멤버-순서)로 나열하므로 정수 형태의 값이 숫자 오름차순으로 먼저
  옵니다. `{ "1": "Yes", "0": "No" }`는 No를 Yes보다 먼저 표시합니다. 정수 형태가 아닌 값처럼 그 순서가
  필요한 순서일 때 맵을 사용합니다.
- 선택 목록은 값에 관계없이 작성한 순서를 유지합니다. `[{ "value": 1, "label": "Yes" },
  { "value": 0, "label": "No" }]`는 Yes를 No보다 먼저 표시합니다. 값이 정수 형태이거나 섞여 있고 작성한
  순서가 필요할 때 사용합니다.
- 라벨의 배열은 인덱스 `0`, `1`, …을 값으로 하여 작성한 순서를 유지합니다.

### 선택지 외형

choice·multichoice 필드(`choice`, `radio`, `multichoice`, `checkboxes`, `checkcontainer` 타입)의 선택
목록에서 각 선택지는 외형을 선언할 수 있습니다. `class`와 `style`은 선택지의 레이블에 적용하는 리터럴
문자열이고, `attributes`는 선택지의 input에 쓰는 [선언한 속성](#선언한-속성)입니다. 필드의
`design.group`(`class`와 `style`)은 선택지를 담는 요소에 적용합니다. 이를 사용해 선택지를
배치할 수 있습니다. 예를 들어 각 선택지가 `style`에서 설정한 사용자 정의 속성을 레이블이 읽는 색 견본
격자로 배치합니다. 출력은 [폼 마크업](form-markup.ko.md#선택지-외형)이 정의합니다. 다른 필드, `in`,
`choice-label` 형식의 선택 목록은 `value`와 `label`만 가지며, 다른 멤버는 위와 같이 실패합니다.

```yaml
accent:
  type: choice
  label: Accent
  items:
    - { value: blue, label: Blue, class: swatch, style: "--swatch-bg: #1d4ed8", attributes: { aria-label: Blue accent } }
    - { value: green, label: Green, class: swatch, style: "--swatch-bg: #15803d" }
  design:
    group: { class: swatches }
```

바인딩은 선택 목록 규칙 다음에 외형을 검사합니다. 선택지를 목록 순서로, 각 선택지에서는 `class`, `style`,
`attributes` 순서로 검사하며 모든 이름을 모든 값보다 먼저 검사합니다. `INVALID_FORM_INPUT`와 빈 위치로
실패하며, `{index}`는 선택지의 0부터 시작하는 위치입니다.

| 선언 | 메시지 |
| --- | --- |
| 문자열이 아닌 `class` 또는 `style` | `Invalid items.{index}.{member} at {path}: expected a string` |
| 객체가 아닌 `attributes` | `Invalid items.{index}.attributes at {path}: expected an object` |
| 규칙 밖의 이름 또는 거부된 이름 | `Invalid items.{index}.attributes.{name} at {path}: expected a data-* or aria-* name that crudui does not write` |
| 문자열이 아닌 값 | `Invalid items.{index}.attributes.{name} at {path}: expected a string` |

## 합성과 검증

합성은 `$ref`를 해석하고 `$patch`를 적용한 후 결과 필드 정의를 처리합니다.
참조가 없으면 로드 오류입니다. 합성은 레코드 값에 의존하지 않습니다.
폼 컴파일은 템플릿마다 합성을 한 번 처리합니다.

`$ref` 값은 파일 경로 하나 또는 파일 경로 목록입니다. 목록은 선언 순서대로 해석해 병합하므로
같은 키에서는 뒤의 경로가 앞의 경로를 덮어씁니다. 문자열이 아닌 항목은 로드 오류입니다. 경로는
`(file.yml).key` 형태로 파일의 일부를 선택할 수 있습니다. 참조는 선택한 계층의 필드 맵으로
해석되며, 그래서 루트가 `$ref`뿐인 선언은 아직 명세가 아니라 그 필드 맵입니다.

CLI 정적 검사도 해결되지 않은 조합을 거부합니다. 조합 전 필드 검사를
참조 해석 성공으로 처리하지 않습니다.

검증기는 `validate` 규칙과 현재 데이터를 검사합니다.
[검증 규칙](validation-rules.ko.md)은 규칙의 의미를 설명합니다.
`tests/fixtures/expr`, `tests/fixtures/compose`, `tests/fixtures/validate`의 공유 사례로
TypeScript, PHP, Go, Rust 구현을 비교합니다. SSR 비교와 마운트한 DOM 테스트는
서로 다른 동작을 검사하므로 별도로 기록합니다.

## 목록

목록은 `columns`를 선언합니다. 행 레코드는 `buildList(spec, rows, options)`의
별도 인자입니다. 각 열은 `field` 경로, `label`, `format`, `design`, 선택적
`sortable`을 정의합니다. 목록과 폼은 합성, 조건, 외형, 콘텐츠 번역을 공유합니다.
목록은 입력 대신 표시 셀을 사용합니다.
`columns`가 없는 목록은 `List specification must declare columns`로 실패하며,
[표시 형식 선언](display-formats.ko.md#선언)이 모든 목록과 상세 선언의 검사를 정의합니다.

| 형식 | 설정 |
| --- | --- |
| `text` | `truncate` |
| `date` | `pattern` |
| `number` | `decimals`, `thousands`, `prefix`, `suffix` |
| `badge` | 값과 스타일의 `map`, 번역된 라벨 |
| `link` | `href`, `target`, `text` |
| `choice-label` | `items` |
| `bool` | `true`, `false` 라벨과 `as` |
| `image` | `width`, `height`, `alt` |
| `html` | 이스케이프하지 않은 표시 HTML |

`format`은 타입 문자열 또는 객체를 사용합니다. 생략, `false`, `true`는 텍스트를
선택합니다. 형식별 설정은 해당 객체에 작성합니다. [표시 형식](display-formats.ko.md)은 각 형식,
목록과 상세가 받는 입력, 마크업을 정의합니다. `sort`, `pagination`, `search`,
`actions`는 페이지 동작을 선언합니다. `empty`는 번역된 빈 목록 메시지를,
`description`은 목록 앞에 표시하는 번역된 텍스트를 정의합니다. 목록 모델은
`{ columns, rows, pagination, sort, actions, empty, description, design }`입니다. 정렬 필드를
선언하지 않으면 `sort`가 없고, `description`은 번역한 `description`이며 선언하지 않으면 빈
텍스트입니다. 코어는 데이터베이스 조회, 레코드 필터링, 서버 페이지 처리를 수행하지
않습니다. 현재 페이지와 전체 레코드 수는 호출자가 제공합니다. `pagination`이
활성화되면 생략된 `perPage`는 20, `mode`는 `pages`, `page`는 1로 해석합니다.
해석된 모델에는 `pageCount`가 포함됩니다. 전체 수가 없으면 0이고, 있으면 `total`이 0이어도 최소
1입니다. `per_page`는 1 이상의 정수이며, 선언 검사와 페이지 번호 범위는
[표시 규칙](display-formats.ko.md)이 정합니다. 모든 렌더러는
이전·페이지 번호·다음 버튼을 출력합니다. 현재 페이지에는 `aria-current="page"`를
지정하고 비활성화하며, 경계의 이전·다음 버튼도 비활성화합니다. 버튼은 `data-page`를
가지며 실제 이동과 데이터 조회는 호출자가 담당합니다.

## 상세

상세는 `fields`를 선언하며, 하나의 레코드는
`buildDetail(spec, record, options)`에 별도로 전달합니다. 각 필드는 목록 셀과 같은
읽기 전용 표시 계약인 `field`, `label`, `format`, `design`을 사용합니다. 상세 필드는
목록과 합성, 조건, 외형, 콘텐츠 번역, 셀 형식을 공유하지만 정렬과 페이지 처리를
선언하지 않습니다. 상세는 목록과 같은 방식으로 `actions`를 선언합니다. `buildDetail`은 순서가
있는 표시 필드, 해석한 동작과 평가된 상세 외형을 반환하고, 렌더러는 다른 데이터를
조회하지 않고 그 모델을 소비합니다.

모델은 `{ fields, actions, design }`입니다. `actions`는 목록 동작 모델을 멤버 순서로 가지며,
상세가 동작을 선언하지 않으면 비어 있습니다. 각 필드는 `key`, `label`, `format`, `value`, `display`,
`design` 멤버를 이 순서로 가집니다. 하나의 레코드에 대한 목록 셀 앞에 키와 번역한 라벨을 둔
것입니다. 레코드의 필드 경로에 값이 없으면 목록 셀과 마찬가지로 `value`는 `null`입니다. 객체가
아닌 선언은 `Detail specification must be an object`, `fields`가 없는 선언은 `Detail specification
must declare fields`, 객체가 아닌 레코드는 `Detail record must be an object`로 실패합니다. 모든
런타임은 같은 모델과 같은 오류를 반환하고, 모든 문자열 렌더러는 정의 목록 앞의 이미지 preload
링크를 포함해 React 서버 렌더링과 같은 상세 HTML을 씁니다.

## 인수 기준

1. 필드 평가 전에 합성을 처리하고 누락된 참조를 오류로 반환합니다.
2. 구조, 콘텐츠, 검증, 외형, 위젯 옵션을 분리합니다.
3. JavaScript 평가 없이 표현식 파서로 조건을 평가합니다.
4. 표시 언어와 별도로 언어별 입력값을 보존합니다.
5. 4개 언어의 공유 검증 사례와 3개 프레임워크의 SSR 출력을 비교하고 마운트한
   뷰에서 폼 편집 동작을 검증합니다.

반복 필드는 행 개수 제한으로 숫자형 `multiple.min`과 `multiple.max`를,
행 컨트롤로 `multiple.copy`와 `multiple.sortable`을, 각 행의 제목이 되는 자식 필드로
`multiple.title`을, 컨트롤 위치로 `multiple.controls`(기본 `header`)를, 행 헤더
고정 여부로 `multiple.header`(기본 `static`, 또는 `sticky`)를 받습니다. 렌더링은
[폼 마크업](form-markup.ko.md)에서 정의합니다. 인스턴스의 컬렉션 키가 행을 식별하며
스키마는 숨김 식별자 필드를 정의하지 않습니다. 행 연산은 [폼 런타임](form-runtime.ko.md)에 정의합니다.
`multiple.only: true`와 같은 `multiple: only`는 데이터에만 존재하는 행을 선언합니다. 데이터의 키가 곧
행이고, 데이터가 없으면 행이 없으며, 폼은 행 컨트롤과 행 연산을 제공하지 않습니다. `multiple.only`는
`title`, `header`와 함께 쓰며 `min`, `max`, `copy`, `sortable`, `controls`, `onclick`과 함께 쓸 수
없습니다. 컴파일은 그 밖의 문자열을 `Invalid multiple at {path}: expected a boolean, only or an object`로,
불리언이 아닌 `only`를 `Invalid multiple.only at {path}: expected a boolean`으로, `only: true` 옆의 제외된
키를 `Invalid multiple.{key} at {path}: unknown key`로 보고합니다.

button·action 필드의 컨트롤 텍스트는 `content`에서만 가져오며 필드 호환 키 `text`는
사용하지 않습니다. 폼 컴파일은 `multiple`, `lang`, `design`의 값 형식이 잘못되면 `INVALID_FORM_INPUT`와
`Invalid {key} at {path}: expected {expected}` 메시지로 거부합니다. `{path}`는
`companies.name`처럼 필드의 구조 경로입니다. 조건 맵은 비어 있지 않은 객체입니다. `buttons`가 없는 폼은 제출 버튼 하나를 가지며, `button`과 `link`는 `text`가,
`link`는 `href`가 필요합니다([폼 마크업](form-markup.ko.md) 참고).

| 키 | 허용 값 |
| --- | --- |
| `multiple` | 불리언, `only` 또는 객체 |
| `multiple.only` | 불리언 |
| `multiple.min`, `multiple.max` | 숫자 |
| `multiple.copy`, `multiple.sortable` | 불리언 |
| `multiple.title` | 반복 그룹의 직속 자식 중 반복·그룹·`lang`이 아닌 필드 이름 |
| `multiple.controls` | `header`, `footer` 또는 `outline` |
| `multiple.header` | `static` 또는 `sticky` |
| `lang` | 불리언 또는 객체 |
| `lang.only` | 언어 코드 문자열 목록 또는 객체 |
| `design` | 불리언 또는 객체 |
| `content` | 문자열 또는 언어 맵; 버튼·액션 필드의 컨트롤 텍스트 |
| `messages` | 등록된 규칙 이름과 메시지 문자열의 객체 |
| `buttons` | 버튼 목록(`type`: `submit`, `reset`, `button`, `link`); 폼 루트에서만 |
| `action` | 문자열 `method`, `url`, `enctype`을 가진 객체; 폼 루트에서만 |
| `design.show` | 표현식, 불리언 또는 조건 맵 |
| `design.class`, `design.style` | 문자열 또는 조건 맵 |
| `design.label`, `design.wrapper`, `design.group`, `design.prepend` | 객체 |
| 해당 노드의 `class`와 `style` | 문자열 또는 조건 맵 |
| `design.attributes`, `design.wrapper.attributes` | `data-*` 또는 `aria-*` 이름에서 문자열로의 객체; 폼 필드에서만([선언한 속성](#선언한-속성)) |
| `design.layout` | `stacked`, `inline`, `line`; group 필드에서만([배치](#배치)) |

컴파일은 선언 순서로 필드를 검사하며 자식보다 필드를 먼저 검사합니다. 스키마는
`multiple`, `lang`, `design`, 디자인 노드, `behavior`를 닫습니다. 이들이 나열하지 않은 키는
`Invalid {bucket}.{key} at {path}: unknown key`로 실패합니다(예: `Invalid design.label.text at name: unknown key`).
버킷 안에서는 값보다 먼저 선언 순서로 알 수 없는 키를 검사합니다. 순서는 `buttons`와 `action`, `multiple`,
`lang`, `design`(이어서 노드 `label`, `wrapper`, `group`, `prepend`), `behavior`입니다. `options`와
동적 `items` 원천은 타입별 설정을 위해 열려 있으며, 금지 메타 키는 어디서나 거부합니다. `validate`와
`messages`의 키는 등록된 규칙 이름입니다. 메타 스키마는 다른 이름을 거부하고, 검증은 `UNKNOWN_RULE`로
로드에 실패합니다([매개변수 오류](validation-rules.ko.md#매개변수-오류)). 메타 스키마는
등록된 모든 검증 규칙의 매개변수 형태를 선언하고, 열어 둔 모든 값의 모든 깊이에서 금지 키를 거부합니다.

## 위젯과 소스 설정

`options`는 해당 위젯의 설정을 보존합니다. 선언을 허용하는 것이 코어가 외부
위젯을 실행한다는 뜻은 아닙니다. 검색은 `keyword_min_length`, 지도 기술자는
`marker_draggable`, `zoom`, `geometry_type`, 태그는 `max_tags`를 사용합니다.
라벨 설정은 `checkbox_label`과 `on_label`을 포함합니다. 컨테이너 설정은
`collapse`, `expend`, `view_total`, `stepper`, `blank_message`를 포함합니다.
`callback`과 `event`는 위젯 스크립트를 보존합니다.

동적 선택지 기술자는 `model`, `method`, `table`, `relations`, `keys`,
`api_server`를 지정할 수 있습니다. 내부 `items` 컬렉션은 초기 정적 선택지를
제공합니다. 질의와 엔드포인트 호출은 생성기 밖에서 수행합니다.

언어 설정은 `mode`, 언어 목록 또는 재정의 맵인 `only`, 그룹의 `name`,
`key`, `frame`, `title`, `group_class` 설정을 받습니다. 언어별 재정의는
`validate`, `design`, `behavior`, `options`를 변경할 수 있습니다.
