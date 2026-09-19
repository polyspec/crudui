# 표시 형식

[English](display-formats.md).

목록과 상세는 레코드 값을 보여 줄 뿐 편집하지 않습니다. 목록 열과 상세 필드는 값을 어떻게 표시할지 `format`으로
선언합니다. 이 문서는 선언할 수 있는 모든 형식, 목록과 상세가 받는 입력, 출력하는 마크업을 정의합니다. 모든
런타임(JavaScript, HTML 렌더러, PHP, PHP 확장, Go, Rust)은 이 규칙을 그대로 따르며, 공용
[목록](../../tests/fixtures/list-render/README.ko.md)과 [상세](../../tests/fixtures/detail-render/README.ko.md)
고정 데이터가 모든 런타임에서 각 규칙을 검사합니다. 여기에 정의하지 않은 표시 형식은 계약에 포함되지 않습니다.

## 값을 표시하는 과정

1. 열이나 필드의 `field` 경로(예: `name`, `company.name`)로 행이나 레코드에서 값을 읽습니다. 모델은 이 값을
   `value`로 유지하며, 레코드에 없는 경로는 `null`입니다.
2. `format`이 값을 `display` 모델로 바꿉니다. 문자열이거나, `badge`, `link`, `bool`, `image`, `html`은 구조화된
   값입니다.
3. 렌더러는 `display`만으로 마크업을 씁니다. 레코드를 다시 읽지 않습니다.

형식은 선언형 데이터입니다. 한 언어로 작성한 함수는 다른 언어에서 똑같이 실행할 수 없으므로 가공 함수(콜백)는
없습니다. 애플리케이션 로직이 필요한 값은 애플리케이션이 계산해 레코드에 담아 전달하고, 애플리케이션이 이미
만든 마크업은 `html` 형식을 사용합니다.

```yaml
columns:
  name:   { field: name, label: { ko: 이름, en: Name }, format: { type: link, href: /users/{=id} } }
  score:  { field: score, format: { type: number, decimals: 2, thousands: true, prefix: { en: '$' } } }
  joined: { field: joined, format: { type: date, pattern: YYYY-MM-DD } }
  status: { field: status, format: { type: badge, map: { active: success, blocked: danger } } }
```

`field`와 `sort.field`는 앞에 점을 붙이지 않는 점 구분 데이터 경로입니다. 표시 토큰은
`{=path}` 형식을 사용합니다. 이 하나의 경로 모델은 객체 멤버와 연관 배열 키를 같은 방식으로
읽으며, `=`는 표시 치환임을 명확히 하여 URL과 파일 확장자의 점이 경로로 오인되지 않게 합니다.

## 형식 선언

| 선언 | 결과 |
| --- | --- |
| 생략, `null`, `true`, `false` | `text` |
| `date` 같은 문자열 | 설정 없는 해당 형식 |
| 객체 | 객체의 `type`(없거나 비어 있으면 `text`)과 객체의 설정 |

아래 표에 없는 형식은 값을 `text`로 표시하고, 선언한 형식 이름은 셀 클래스에 유지합니다.

값은 다음과 같이 텍스트로 읽습니다. `null`이나 없는 값은 빈 문자열, `true`는 `1`, `false`는 빈 문자열,
객체나 배열은 빈 문자열이며, 숫자는 가장 짧은 십진 표현을 사용합니다.

콘텐츠를 받는 설정(`prefix`, `suffix`, `text`, `true`, `false`, `alt`, 뱃지와 선택 라벨)은 문자열이나
`{ ko: 이름, en: Name }` 같은 언어 맵을 받으며, [콘텐츠 규칙](schema.ko.md)으로 표시 언어의 텍스트가 됩니다.
언어 맵은 표시 언어, `en`, `ko`, 첫 키 순서에서 처음으로 비어 있지 않은 문자열 항목을 쓰고, 숫자를 포함한 그 밖의
값은 빈 텍스트입니다.

## 형식

| 형식 | 설정 | 표시 |
| --- | --- | --- |
| `text` | `truncate` | 값을 텍스트로 표시합니다. |
| `date` | `pattern` | 값을 UTC 날짜로 표시합니다. |
| `number` | `decimals`, `thousands`, `prefix`, `suffix` | 값을 숫자로 표시합니다. |
| `badge` | `map` | 변형과 라벨을 가진 뱃지입니다. |
| `link` | `href`, `target`, `text` | 링크입니다. |
| `choice-label` | `items` | 값의 라벨입니다. |
| `bool` | `true`, `false`, `as` | 참이나 거짓 라벨입니다. |
| `image` | `width`, `height`, `alt` | 값을 원본으로 하는 이미지입니다. |
| `html` | 없음 | 이스케이프하지 않은 마크업입니다. |

### text

`truncate`는 표시 길이를 제한합니다. 숫자만 적용하며 그 정수 부분이 제한입니다. 제한이 1 이상이고 텍스트의
유니코드 코드 포인트 수가 제한보다 많으면 앞에서부터 제한까지의 코드 포인트를 남기고 `…`(U+2026)을 붙입니다.
문자를 쪼개지 않습니다. 제한이 없거나 숫자가 아니거나(숫자 문자열 포함) 1보다 작으면 전체 텍스트를 표시합니다.

### date

값은 [날짜 값 규칙](form-runtime.ko.md)으로 해석하고 UTC로 표시합니다. `pattern`의 `YYYY`(연), `MM`(월),
`DD`(일), `HH`(24시간제 시), `mm`(분), `ss`(초) 토큰을 바꾸고 나머지 문자는 유지합니다. 기본 패턴은
`YYYY-MM-DD`입니다. 지원하는 날짜가 아닌 값은 그대로 표시합니다.

### number

숫자 값은 그대로 사용하고, 문자열은 JavaScript `Number` 규칙으로 변환합니다. 앞뒤 공백은 무시하며 `0x`, `0b`,
`0o` 접두사를 읽습니다. 유한한 숫자로 변환되지 않는 값은 그대로 표시합니다.

- `decimals`는 소수 자릿수를 정합니다. 숫자여야 하며, 소수인 자릿수는 0 방향으로 버린 결과가 0 이상 100
  이하여야 하고, 그렇지 않으면 목록이나 상세가 `Number decimals must be between 0 and 100`로 실패합니다.
  정확한 이진 값을 가장 가까운 표현으로 반올림하며 중간값은 0에서 먼 쪽으로 올리므로, `2.5`는 `3`, `-2.5`는
  `-3`, 소수 둘째 자리의 `1.005`는 `1.00`입니다. 숫자가 아닌 `decimals`는 무시합니다.
- `decimals`가 없으면 가장 짧은 십진 표현을 사용하며, 아주 크거나 작은 값은 `1e+21`, `1e-7`처럼 지수 표기를
  사용합니다.
- `thousands: true`는 정수 부분을 `,`로 묶습니다.
- `prefix`와 `suffix`는 숫자 앞뒤에 씁니다.

### badge

`map`은 값을 변형에 대응시킵니다. 문자열 변형이면 뱃지는 그 변형을 갖고 값이 라벨입니다. 언어 맵이면 번역한
텍스트가 변형이자 라벨입니다. `map`에 없는 값은 변형 없는 뱃지로 표시하고 값을 라벨로 씁니다.

### link

- `href`는 문자열이거나 [표현식 규칙](expressions.ko.md)으로 결정하는 조건 맵입니다. `href`의 명시적
  `{=path}` 토큰만 레코드의 해당 경로 값으로 바꿉니다. `{=field}`는 셀 값이며, 레코드에 없는 경로는 셀 값으로 바꿉니다.
  중괄호 밖의 텍스트는 리터럴입니다.
- `text`는 링크 문구입니다. `text`가 없거나 `null`이거나 비어 있으면 셀 값이 문구입니다.
- `target`은 비어 있지 않은 문자열일 때 씁니다.
- `javascript:` 주소는 React 서버 렌더링과 같이 오류를 던지는 주소로 바꿉니다.

### choice-label

`items`는 값에서 라벨로의 맵이거나, 인덱스가 값인 배열입니다. 값의 라벨을 표시합니다. 동적 원천
(`{ model: … }`)은 렌더러가 읽지 않으며, 라벨이 없는 값은 그대로 표시합니다.

### bool

값이 `false`, `0`, `null`, 없음, 빈 문자열, `"0"`, `"false"`이면 거짓이고 그 밖에는 참입니다. `true`와
`false`는 각 상태의 라벨이며, 라벨이 없으면 `true`나 `false`를 표시합니다. `as`는 `text`(기본값), `icon`,
`check` 중 하나를 선택합니다.

### image

값이 이미지 원본입니다. `alt`는 번역하고 링크와 같이 명시적 `{=path}` 토큰을 바꾸며, `alt`가 없으면 대체 텍스트는
비어 있습니다. 선언한 `width`와 `height`는 텍스트로 쓰고, `null`로 선언하면 빈 속성을 씁니다. 원본이 비어 있지
않고 `data:`로 시작하지 않는 이미지는 preload 링크도 추가합니다. 아래 마크업 절을 참고하세요.

### html

값을 이스케이프하지 않고 마크업으로 씁니다. 그 마크업의 안전성은 애플리케이션이 책임집니다.

## 입력

목록은 명세, 행, 옵션을 받고, 상세는 명세, 레코드 하나, 옵션을 받습니다. 잘못된 입력은 코드
`INVALID_FORM_INPUT`, 아래 메시지, 빈 위치로 실패합니다.

| 입력 | 규칙 | 메시지 |
| --- | --- | --- |
| 목록 명세 | 객체 | `List specification must be an object` |
| 목록 행 | 배열 | `List rows must be an array` |
| 각 목록 행 | 객체 | `List rows must be objects` |
| 목록 `data` 옵션 | 객체 | `List context must be an object` |
| 목록 `page` 옵션 | 1부터 9007199254740991까지의 정수 | `List page must be a positive integer` |
| 목록 `total` 옵션 | 0부터 9007199254740991까지의 정수 | `List total must be a nonnegative integer` |
| 목록 `layout` 옵션 | `table` 또는 `card` | `List layout must be table or card` |
| 상세 명세 | 객체 | `Detail specification must be an object` |
| 상세 레코드 | 객체 | `Detail record must be an object` |
| 상세 명세 | `fields` 선언 | `Detail specification must declare fields` |
| 상세 `data` 옵션 | 객체 | `Detail context must be an object` |

상세는 `data`, `language`, `files`, `basepath` 옵션을 받습니다. 목록 전용 옵션 `page`, `total`, `layout`은
검사하지도 사용하지도 않습니다.

규칙은 인자 형태를 인자 순서대로 먼저 검사하고, 그다음 선언, 마지막으로 옵션을 검사합니다. 옵션이 없거나 `null`이면 기본값을 씁니다. 빈 컨텍스트, 현재 페이지 없음, 전체 수 없음, `table` 레이아웃입니다.
`page`는 현재 페이지, `total`은 전체 레코드 수입니다. 둘 다 호출자가 제공하고 생성기는 행에서 계산하지 않으며,
명세가 `pagination`을 켠 목록은 이를 `data-page`와 `data-total`로 출력합니다. 이전·페이지 번호·다음
버튼도 출력하며 해석된 페이지 기본값은 1이고 현재 버튼에는 `aria-current="page"`와 `disabled`를
지정합니다. 해석된 페이지 모델은 이 버튼들을 `buttons`에 담고, 각 버튼은 `role`(`previous`, `page`,
`next`), `page`, `label`, `current`, `disabled`를 가집니다. 렌더러는 버튼의 글자를 역할로 고르고
(`‹`, 페이지 번호, `›`) `label`을 `aria-label`로 씁니다. 레이블은
[화면 문구](form-markup.ko.md#화면-문구)의 `list` 표(`previousPage`, `nextPage`, `{page}`를 페이지
번호로 바꾼 `page`)에서 표시 언어의 항목을 쓰고, 표에 그 언어가 없으면 영어 항목을 씁니다. 행이 없는
목록은 선언한 `empty` 문구를 보여 주고, `empty`가 없거나 `null`이면 같은 방식으로 고른 표의
`emptyList`를 보여 줍니다. 상한은 모든 런타임이 정확히
표현하는 가장 큰 정수이며, `2.0`처럼 정수 값인 수는 정수 `2`입니다. 여러
입력이 잘못되었으면 표 순서에서 처음 실패한 규칙을 보고합니다. Go와 Rust 라이브러리 시그니처는 행을 시퀀스로
받으므로, 두 언어에서 행 규칙은 해석한 JSON을 그 시퀀스로 바꾸는 곳에서 적용되고 나머지 규칙은 라이브러리가
검사합니다.

입력 규칙과 조합이 끝나면 선언을 검사합니다. `design`은 [폼 선언 규칙](schema.ko.md)을 그대로 따릅니다. 알 수 없는
키는 `Invalid {key} at {path}: unknown key`로, 형식이 틀린 값은 `Invalid {key} at {path}: expected {expected}`로
실패합니다. 목록 자체 `design`의 경로는 `list`, 열 `design`은 `columns.{이름}`, 상세 자체 `design`은 `detail`,
필드 `design`은 `fields.{이름}`입니다. 자체 `design`을 먼저 검사하고, 그다음 각 열이나 필드를
[멤버 순서](schema.ko.md)대로 검사합니다.

목록의 `pagination`은 마지막에 경로 `list`로 검사합니다.

| 선언 | 허용 값 | 실패 메시지 |
| --- | --- | --- |
| `pagination` | 불리언 또는 객체 | `Invalid pagination at list: expected a boolean or an object` |
| 객체의 멤버 | `per_page` 또는 `mode` | `Invalid pagination.{key} at list: unknown key` |
| `per_page` | 1부터 9007199254740991까지의 정수 | `Invalid pagination.per_page at list: expected a positive integer` |
| `mode` | `pages`, `offset`, `cursor`, `none` | `Invalid pagination.mode at list: expected pages, offset, cursor or none` |

해석된 페이지네이션 모델의 멤버 순서는 `enabled`, 페이지네이션이 켜진 경우의 `perPage`(기본 20)·
`mode`(기본 `pages`)·`page`(기본 1), 제공된 `total`, 켜진 경우의 `pageCount`입니다. 꺼진 경우에는
제공된 `page`와 `total`만 남습니다. 페이지 번호는 7페이지까지 모두 표시하고, 그보다 많으면 첫·이전·현재·다음·
마지막 페이지를 표시합니다. 전체 수가 없으면 현재 페이지는 1이고, 마지막 페이지보다 큰 페이지는 마지막 페이지를
선택합니다.

PHP에서는 [PHP API 계약](php-extension.ko.md)이 어떤 PHP 값이 객체인지 정합니다. 루트 객체 인수와 고정 객체
옵션 `data`, `files`에는 빈 PHP 배열을 받고, 중첩 값은 타입을 유지합니다.

## 마크업

| 표시 | 목록 표 셀 | 상세 값 |
| --- | --- | --- |
| text, date, number, choice-label | `crudui-list__cell crudui-value crudui-value--TYPE` 안의 이스케이프한 텍스트 | `crudui-detail__value crudui-value crudui-value--TYPE` 안의 이스케이프한 텍스트 |
| badge | 선택적인 `data-crudui-variant`를 가진 `span.crudui-badge` | `dd` 안에 같은 마크업 |
| link | `href`와 선택적인 `target`을 가진 `a` | `dd` 안에 같은 마크업 |
| bool | `data-crudui-state`와 필요한 `aria-label`을 가진 `span.crudui-bool crudui-bool--text`, `--icon` 또는 `--check` | `dd` 안에 같은 마크업 |
| image | `src`, `alt`, 선언한 `width`와 `height`를 가진 `img` | `dd` 안에 같은 마크업 |
| html | 이스케이프하지 않은 마크업 | `dd` 안에 같은 마크업 |

상세는 `dl.crudui-detail`이며 필드마다 `dt.crudui-detail__label`과 값을 담은
`div.crudui-detail__field`를 둡니다. 목록 루트는 `crudui-list`이며 표, 제목, 셀, 카드,
빈 상태, 동작과 페이지 이동은 해당 `crudui-list__*` 요소를 사용합니다. 문자열 렌더러는
목록이나 상세 앞에 이미지 preload 링크 `<link rel="preload" as="image" href="…"/>`를 처음 사용한 순서로 중복 없이
씁니다.
