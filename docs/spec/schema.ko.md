# 명세 구조

[English](schema.md). 이 문서는 필드와 목록 선언을 정의합니다.
폼 인스턴스, 반복 행 키, 캐싱은 [폼 런타임](form-runtime.ko.md)에 정의합니다.
구현과 배포 상태는 [기능 상태](../features.ko.md)에 기록합니다.

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

[표현식 문법](../EXPRESSION-GRAMMAR.md)은 토크나이저, 파서, 평가기를 정의합니다.
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

검증기는 `validate` 규칙과 현재 데이터를 검사합니다.
[검증 규칙](../VALIDATION-RULES.md)은 규칙의 의미를 설명합니다.
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
선택합니다. 형식별 설정은 해당 객체에 작성합니다. `sort`, `pagination`, `search`,
`actions`는 애플리케이션 동작을 선언합니다. `empty`는 번역된 빈 목록 메시지를
정의합니다. 코어는 데이터베이스 조회, 레코드 필터링, 서버 페이지 처리를 수행하지
않습니다. 호출자가 페이지 메타데이터를 제공합니다.

## 인수 기준

1. 필드 평가 전에 합성을 처리하고 누락된 참조를 오류로 반환합니다.
2. 구조, 콘텐츠, 검증, 외형, 위젯 옵션을 분리합니다.
3. JavaScript 평가 없이 표현식 파서로 조건을 평가합니다.
4. 표시 언어와 별도로 언어별 입력값을 보존합니다.
5. 4개 언어의 공유 검증 사례와 3개 프레임워크의 SSR 출력을 비교하고 마운트한
   뷰에서 폼 편집 동작을 검증합니다.
