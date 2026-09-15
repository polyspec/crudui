# 상세 렌더링 고정 데이터

[English](README.md).

`cases.json`은 모든 문자열 렌더러와 프레임워크 렌더러가 공유하는 읽기 전용 상세 사례입니다. 각 사례는
`name`, `note`, `spec`, `record`, 선택적인 `options`, 그리고 `expected_html` 또는 `code`와
`message`를 가진 `expectError`를 제공합니다.

번역한 라벨, 모든 셀 형식, 레코드에 없는 값, 상세와 필드 디자인, 숨긴 필드, 조합한 필드, 필드가 없는
선언, 세 가지 입력 오류를 검사합니다. 애플리케이션이 레코드를 제공하며 렌더러는 데이터를 조회하지
않습니다.

`content-values`는 명세가 의도적으로 [메타 스키마](../../../schema/crudui.schema.json) 밖에 있는
유일한 사례입니다. 콘텐츠는 문자열 또는 문자열 언어 맵으로 선언하지만, 이 사례는 숫자·객체·배열을
선언해 모든 런타임이 그런 값을 빈 텍스트로 해석하는 규칙을 고정합니다
([명세 구조](../../../docs/spec/schema.ko.md)). [`check-schema.mjs`](../../../scripts/check-schema.mjs)는
이 사례를 이유와 함께 기록하고 메타 스키마 실패를 요구하므로, 면제가 조용히 남을 수 없습니다.

## 비교

프레임워크 적합성 검사는 [폼 HTML 정규화기](../form-render/README.ko.md#정규화)로 정규화한 상세 본문을
`expected_html`과 비교합니다. 문자열 렌더러(React 서버 렌더링과 HTML 렌더러)는 상세 앞에 이미지
preload 링크를 쓰며, [`preload-links.mjs`](../preload-links.mjs)가 이를 제거하므로 본문 기대값은 상세
본문만 다룹니다. 오류 사례는 기록된 메시지를 확인합니다.

[네이티브 생성기 검사](../../native-generators/README.ko.md)는 모든 사례를 모든 런타임에 두 수준으로
보냅니다. `buildDetail`은 멤버 순서까지 같은 모델을, `renderDetail`은 이미지 preload 링크를 포함해
React와 같은 전체 원본 HTML을 반환해야 합니다. 필드의 `value`는 레코드의 해당 경로에 값이 없으면
`null`입니다.

[React](../../../packages/generator-react/src/__tests__/detail-render.conformance.test.ts),
[Vue](../../../packages/generator-vue/src/__tests__/detail-render.conformance.test.ts),
[Svelte](../../../packages/generator-svelte/test/detail-render.conformance.test.mjs),
[HTML 렌더러](../../../packages/generator-html/src/detail-conformance.test.ts)의 상세 적합성 검사가
사용합니다.

## 재생성

저장소 루트에서 실행합니다.

```sh
node_modules/.bin/tsx tests/fixtures/detail-render/generate.ts \
  > tests/fixtures/detail-render/cases.json
```

생성기는 React에서 정규화한 상세 본문을 생성합니다. 변경을 반영하기 전에 명세와 비교하여 검토합니다.
재생성만으로 검증이 완료되지는 않습니다.
