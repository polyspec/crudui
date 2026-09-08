# 폼 렌더링 고정 사례

[English](README.md).

React·Vue·Svelte 레이아웃 일치 검사는 `cases.json`을 공유합니다. 각 사례는
이름, 명세, 선택적 데이터와 옵션, `expected_html` 또는 `expectError`를
포함합니다. 생성기는 정규화한 출력을 비교하거나 기록된 합성 오류를 확인합니다.

이 사례는 내부 `renderFields`의 평가와 렌더링 경로를 검사합니다. 외형, 조건,
합성, 번역 콘텐츠, 언어 입력, 반복과 위젯 출력을 포함합니다. 배열 형태의
사례 데이터는 레이아웃 평가를 검사하며 공개 편집 폼 데이터 계약을 정의하지
않습니다. 편집 폼은 [폼 런타임](../../../docs/spec/form-runtime.ko.md)에 정의된
키 기반 컬렉션을 사용합니다.

## 정규화

`normalize.mjs`는 parse5로 HTML을, PostCSS로 인라인 스타일을 파싱합니다.
속성을 정렬하고 HTML 불리언 속성과 CSS 선언을 정규화하며 주석, 빈 class/style
속성, 서식 보존 요소 밖의 공백만 있는 텍스트 노드를 제거합니다.
`pre`, `textarea`, `script`, `style` 내부 텍스트는 보존합니다. 필드 이름,
행 키, ID, 값과 숨김 상태는 마스킹하지 않습니다.

정규화한 레이아웃의 일치는 HTML 원문의 일치를 증명하지 않습니다.
[폼 검사기](../../../tests/form-inspector/form-snapshot.mjs)는 초기 데이터와
나중 주입의 HTML 원문, DOM, CSS, 입력과 런타임 상태를 별도로 비교합니다.

## 생성과 검증

패키지를 빌드한 후 저장소 루트에서 실행합니다.

```sh
node_modules/.bin/tsx tests/fixtures/form-render/generate.ts > tests/fixtures/form-render/cases.json
node_modules/.bin/tsx tests/fixtures/form-render/gen-cases.mts
npm run test:forms
```

생성 스크립트는 React 내부 `renderFields` 함수를 레이아웃 기준으로 사용하고
출력을 정규화합니다. 두 번째 스크립트는 위젯 사례를 갱신하거나 추가합니다.
적용 전에 생성된 변경을 검토해야 하며 재생성만으로 정확성을 확인할 수는 없습니다.
세 프레임워크의 일치 검사가 모두 통과해야 합니다.
