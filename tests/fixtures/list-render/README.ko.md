# 목록 렌더링 고정 데이터

[English](README.md).

`cases.json`은 React, Vue, Svelte의 공용 목록 레이아웃 사례입니다. 각 사례는
`name`, `spec`, `rows`, 선택적인 `options`, 그리고 `expected_html` 또는
`expectError`를 제공합니다.

테이블과 카드 레이아웃, 열 형식, 동작, 표시 여부, 빈 행, 페이지 이동 마크업을
검사합니다. 애플리케이션이 표시할 행을 제공하고 조회를 수행합니다. 렌더러는
데이터베이스를 조회하지 않습니다.

## 비교

프레임워크 레이아웃 검사는 정규화한 목록 본문을 `expected_html`과 비교합니다.
[폼 HTML 정규화기](../form-render/README.ko.md#정규화)를 사용하며 본문 기대값에서
React의 이미지 preload 링크를 제외합니다. 이 비교로 전체 원본 HTML의 동일성을
확인할 수는 없습니다.

[네이티브 생성기 검사](../../native-generators/README.ko.md)는 같은 입력으로 이미지
preload 링크를 포함한 전체 원본 HTML을 React와 비교합니다. 리소스 힌트를
제거하거나 속성과 CSS를 정규화하지 않습니다.

[React](../../../packages/generator-react/src/__tests__/list-render.conformance.test.ts),
[Vue](../../../packages/generator-vue/test/list-render.conformance.test.mjs),
[Svelte](../../../packages/generator-svelte/test/list-render.conformance.test.mjs)의
목록 적합성 검사가 사용합니다. 합성 오류 사례는 기록된 오류 코드를 확인합니다.

## 재생성

패키지를 빌드한 다음 저장소 루트에서 실행합니다.

```sh
node_modules/.bin/tsx tests/fixtures/list-render/generate.ts \
  > tests/fixtures/list-render/cases.json
npm run test:forms
```

생성기는 React에서 정규화한 목록 본문을 생성합니다. 변경을 반영하기 전에 명세와
비교하여 검토합니다. 재생성만으로 검증이 완료되지는 않습니다.
