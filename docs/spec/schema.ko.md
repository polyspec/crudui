# 명세 구조

[English](schema.md). 이 문서는 필드와 목록 선언을 정의합니다.
폼 인스턴스, 반복 행 키, 캐싱은 [폼 런타임](form-runtime.ko.md)에 정의합니다.
구현과 배포 상태는 [기능 상태](../features.ko.md)에 기록합니다.

## 패키지 API

CRUDUI의 초기 패키지 버전은 `0.0.1`입니다. 파일명·공개 API·내부 식별자는
구현 세대 표기 없이 역할을 설명합니다. 패키지 루트는 현재 검증기와 폼 렌더러를
제공하며 프레임워크에 독립적인 `@crudui/generator-html` renderer도 포함합니다.
구형 구현은 명시적인 `legacy` 모듈을 사용합니다. 공유 규칙과
표현식 유틸리티는 레거시 모듈에 의존하지 않습니다. 제거한 버전 경로에는
호환 별칭을 제공하지 않습니다.

기계가 읽는 계약은
[`schema/crudui.schema.json`](../../schema/crudui.schema.json)에 관리합니다.
폼, 목록, 상세 선언 형태를 검증합니다. `make docs-schema`는 규칙을 생성하거나
교체하지 않고 이 문서와 공유 고정 데이터를 검사합니다.

## 필드

폼 루트는 `properties` 필드 맵이 있는 `group`입니다. 속성명이 데이터 경로를
정의합니다. 필드는 구조, 콘텐츠, 동작을 다음과 같이 분리합니다.

| 분류 | 키 | 계약 |
| --- | --- | --- |
| 구조 | `type`, `name`, `default`, `properties`, `items`, `multiple`, `lang` | 값, 중첩 그룹, 선택지, 반복을 정의합니다. |
| 콘텐츠 | `label`, `description`, `placeholder`, `prepend`, `append`, `help` | 문자열 또는 언어 맵을 사용합니다. |
| 검증 | `validate` | 규칙과 메시지를 정의합니다. |
| 외형 | `design` | 특정 DOM 노드의 표시와 스타일을 정의합니다. |
| 동작 | `behavior` | 이벤트 스크립트를 표현식 평가 없이 보존합니다. |
| 타입 옵션 | `options` | 특정 위젯 타입의 설정을 저장합니다. |
| 합성 | `$ref`, `$patch` | 데이터를 바인딩하기 전에 필드 정의를 로드, 병합, 수정합니다. |

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

## 조건과 외형

조건은 해당 설정의 값으로 작성합니다. `design.show`는 표시 여부를 결정합니다.
`design.class`와 `design.style`은 주 노드에 적용합니다. `design.label`,
`design.wrapper`, `design.group`, `design.prepend`는 해당 노드에 적용합니다.
조건 맵은 처음 일치한 표현식을 선택하며 기본 키 `true`가 필요합니다.
CRUDUI 스키마는 `show_if`, `display_switch`, `display_target` 같은 별도 조건 메타키를
거부합니다.

[표현식 문법](expressions.ko.md)은 토크나이저, 파서, 평가기를 정의합니다.
상대 경로, 와일드카드, 목록, 비교, 논리, 포함 여부, 조건부 값을 지원합니다.
산술, 함수 호출, JavaScript 평가는 지원하지 않습니다. `behavior`의 이벤트 스크립트는
문자열로 보존하며 실행은 표현식 엔진의 범위 밖입니다.

## 언어와 선택지

콘텐츠 번역과 언어별 입력값은 별개입니다. 콘텐츠는 `{ en: Name, ko: 이름 }` 같은
맵을 사용합니다. `lang`은 설정한 언어별 입력을 생성하며 `only`, `frame`, `title`,
`group_class`를 설정합니다. 기본 언어는 `ko`, `en`, `ja`, `zh`입니다.

`items`는 정적 배열, 값과 라벨의 맵, `model`이 있는 동적 소스 설정을 사용합니다.
정적 라벨에는 언어 맵을 사용할 수 있습니다. 생성기는 동적 소스 설정을 보존합니다.
레코드 조회와 외부 위젯 실행은 애플리케이션에서 처리합니다.

## 합성과 검증

합성은 `$ref`를 해석하고 `$patch`를 적용한 후 결과 필드 정의를 처리합니다.
참조가 없으면 로드 오류입니다. 합성은 레코드 값에 의존하지 않습니다.
폼 컴파일은 템플릿마다 합성을 한 번 처리합니다.

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
`actions`는 애플리케이션 동작을 선언합니다. `empty`는 번역된 빈 목록 메시지를
정의합니다. 코어는 데이터베이스 조회, 레코드 필터링, 서버 페이지 처리를 수행하지
않습니다. 호출자가 페이지 메타데이터를 제공합니다.

## 상세

상세는 `fields`를 선언하며, 하나의 레코드는
`buildDetail(spec, record, options)`에 별도로 전달합니다. 각 필드는 목록 셀과 같은
읽기 전용 표시 계약인 `field`, `label`, `format`, `design`을 사용합니다. 상세 필드는
목록과 합성, 조건, 외형, 콘텐츠 번역, 셀 형식을 공유하지만 정렬, 페이지 처리, 동작을
선언하지 않습니다. `buildDetail`은 순서가 있는 표시 필드와 평가된 상세 외형을
반환하고, 렌더러는 애플리케이션 데이터를 조회하지 않고 그 모델을 소비합니다.

모델은 `{ fields, design }`입니다. 각 필드는 `key`, `label`, `format`, `value`, `display`,
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

폼 컴파일은 `multiple`, `lang`, `design`의 값 형식이 잘못되면 `INVALID_FORM_INPUT`와
`Invalid {key} at {path}: expected {expected}` 메시지로 거부합니다. `{path}`는
`companies.name`처럼 필드의 구조 경로입니다. 조건 맵은 비어 있지 않은 객체입니다. `buttons`가 없는 폼은 제출 버튼 하나를 가지며, `button`과 `link`는 `text`가,
`link`는 `href`가 필요합니다([폼 마크업](form-markup.ko.md) 참고).

| 키 | 허용 값 |
| --- | --- |
| `multiple` | 불리언 또는 객체 |
| `multiple.min`, `multiple.max` | 숫자 |
| `multiple.copy`, `multiple.sortable` | 불리언 |
| `multiple.title` | 반복 그룹의 직속 자식 중 반복·그룹·`lang`이 아닌 필드 이름 |
| `multiple.controls` | `header`, `footer` 또는 `outline` |
| `multiple.header` | `static` 또는 `sticky` |
| `lang` | 불리언 또는 객체 |
| `lang.only` | 언어 코드 문자열 목록 또는 객체 |
| `design` | 불리언 또는 객체 |
| `buttons` | 버튼 목록(`type`: `submit`, `reset`, `button`, `link`); 폼 루트에서만 |
| `action` | 문자열 `method`, `url`, `enctype`을 가진 객체; 폼 루트에서만 |
| `design.show` | 표현식, 불리언 또는 조건 맵 |
| `design.class`, `design.style` | 문자열 또는 조건 맵 |
| `design.label`, `design.wrapper`, `design.group`, `design.prepend` | 객체 |
| 해당 노드의 `class`와 `style` | 문자열 또는 조건 맵 |

컴파일은 선언 순서로 필드를 검사하며 자식보다 필드를 먼저 검사합니다. 이 버킷의
알 수 없는 키는 검사하지 않습니다.

## 위젯과 소스 설정

`options`는 해당 위젯의 설정을 보존합니다. 선언을 허용하는 것이 코어가 외부
위젯을 실행한다는 뜻은 아닙니다. 검색은 `keyword_min_length`, 지도 기술자는
`marker_draggable`, `zoom`, `geometry_type`, 태그는 `max_tags`를 사용합니다.
라벨 설정은 `checkbox_label`과 `on_label`을 포함합니다. 컨테이너 설정은
`collapse`, `expend`, `view_total`, `stepper`, `blank_message`를 포함합니다.
`callback`과 `event`는 위젯 스크립트를 보존합니다.

동적 선택지 기술자는 `model`, `method`, `table`, `relations`, `keys`,
`api_server`를 지정할 수 있습니다. 내부 `items` 컬렉션은 초기 정적 선택지를
제공합니다. 애플리케이션이 질의와 엔드포인트 호출을 수행합니다.

언어 설정은 `mode`, 언어 목록 또는 재정의 맵인 `only`, 그룹의 `name`,
`key`, `frame`, `title`, `group_class` 설정을 받습니다. 언어별 재정의는
`validate`, `design`, `behavior`, `options`를 변경할 수 있습니다.
