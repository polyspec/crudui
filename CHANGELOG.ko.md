# 변경 기록

[English](CHANGELOG.md).

## 2026-09-15 — 모든 런타임에서 상세 보기를 같은 수준으로 강제

상세 보기는 JavaScript와 Go에만 있었고 그 출력을 비교하는 검사가 없었습니다. 이 작업 트리에는 Claude
서명이 없고 어느 세션 기록에도 나오지 않는, 푸시되지 않은 커밋 세 개가 있었습니다. `012b3236`과
`899bc37e`는 PHP·Rust 상세 렌더링과 네이티브 러너의 원본 HTML 상세 사례를 추가했고, `4dbe8157`은 PHP
JSON 경계 문서와 함께 제가 스테이징했지만 검증하지 않은 변경을 담았습니다. 그 위에 작업하기 전에
검토한 결과 러너는 HTML만 비교했고, 러너가 모든 사례를 보내는데도 C 확장에는 상세 연산이 없었으며,
JavaScript 렌더러는 각자의 부분 문자열 검사를 유지했고, 커밋 메시지는 내용의 일부만 설명했습니다.
`main`을 푸시된 커밋으로 되돌리고 그 구현과 문서를 이번 변경과 직전 변경에 기록했습니다.

모든 런타임을 측정해 어떤 검사도 보지 못한 차이 세 가지를 찾았습니다.
- 레코드에 없는 경로에서 JavaScript는 셀의 `value`를 생략했고, Go는 `{}`, Rust는 `null`을 썼으며,
  PHP는 생략해 상세 모델이 정의되지 않은 속성 경고를 냈습니다. 이제 행에 값이 없으면 셀의
  `value`는 `null`이고 멤버는 목록과 상세 모두에서 항상 있습니다. 렌더링된 HTML은 바뀌지 않습니다.
- 이미지의 `width`나 `height`를 `null`로 선언하면 다른 모든 런타임은 `width=""`, `height=""`를 쓰는데
  C 확장은 두 속성을 생략했습니다. 이제 같습니다.
- PHP API 계약대로 모든 PHP API는 빈 PHP 배열을 빈 루트 객체로 읽는데, PHP 라이브러리와 확장의 상세
  메서드는 이를 거부했습니다. 이제 계약을 따르며, PHP 명령행 어댑터는 모든 런타임과 마찬가지로 JSON
  배열을 계속 거부합니다.

규칙은 런타임이 제공하는 두 수준에서 모두 강제합니다. `tests/fixtures/detail-render/cases.json`에는
React에서 생성한 사례 19개가 있습니다. React, Vue, Svelte, HTML 렌더러는 각자의 부분 문자열 검사 대신
이를 적합성 검사로 실행합니다. 네이티브 러너는 모든 사례를 JavaScript, HTML 렌더러, PHP 라이브러리,
Go, Rust, PHP 확장에 `buildDetail`로 보내 멤버 순서까지 같은 모델을 요구하고, `renderDetail`로 보내
이미지 preload 링크를 포함해 바이트 단위로 같은 HTML을 요구합니다. C 확장은 목록 경로와 이제 공유하는
셀 코드 위에 두 연산을 구현합니다. 모든 런타임은 객체가 아닌 선언, `fields`가 없는 선언, 객체가 아닌
레코드를 같은 메시지로 거부합니다.

두 가지 발견 사항은 남아 있습니다. C 확장은 스키마가 허용하지 않는 `0`이나 `false`가 `text`일 때 여전히
셀 값을 링크 문구로 씁니다. 상세 명세 검증(`validateDetail`)은 JavaScript에만 있으므로 상세 기능은 진행
중으로 남습니다.

`make test-native`는 모든 대상이 사용 가능한 상태에서 검사 1,285개를 모두 통과했고 여섯 대상이 각각
214개를 통과했습니다. PHP 생성기 검사 173개가 통과했습니다. 확장은 세 구성마다 API 검사 396개와 엔진 검사 24개를 통과했고
Linux 전용 검사 1개는 건너뛰었습니다. React, Vue, Svelte, HTML 렌더러가 각각 상세 적합성 사례 19개를
통과했고, Go와 Rust 생성기 검사, `npm run lint`, `npm run test:docs`, 코어·React·HTML 타입 검사,
`make docs-check`, `npm run test:forms`가 통과했습니다.

## 2026-09-15 — 목록과 상세 고정 데이터가 preload 링크 도우미를 공유

프레임워크 적합성 검사는 React 서버 렌더링과 HTML 렌더러가 목록 앞에 쓰는 이미지 preload 링크를
제외하고 목록을 비교하며, 네이티브 생성기 검사는 전체 HTML을 비교합니다. 이 규칙은 목록 전용 이름인
`listBody`로 `tests/fixtures/list-render/list-body.mjs`에 구현되어 있었습니다. 상세 고정 데이터도 같은
규칙을 따르므로 도우미를 `tests/fixtures/preload-links.mjs`의 `withoutPreloadLinks`로 옮겼고, 목록
고정 데이터 생성기와 React·HTML 목록 적합성 검사가 이를 사용합니다.

목록 고정 데이터를 다시 생성해도 바이트가 같았고 React와 HTML 목록 적합성 검사가 통과했습니다.

## 2026-09-15 — generator-core를 선언한 라이브러리로 빌드

`3aeb4d6e` 이후 모든 CI 작업이 `npm run build`에서 실패했습니다. `detail.ts`가 패키지가 선언한
TypeScript 라이브러리에 없는 `Object.hasOwn`을 호출했습니다. 그 커밋은 변경 기록 문구 수정으로
설명했지만, 모든 변경을 스테이징하면서 진행 중이던 상세 작업도 함께 커밋했습니다. 상세 모델의 입력
검사(객체가 아닌 선언, `fields`가 없는 선언, 객체가 아닌 레코드가 각각 고유한 메시지로 실패), 그
검사, 공용 상세 픽스처의 생성 스크립트(사례 파일 없음)입니다. 스테이징한 내용을 검토하지 않고 빌드도
하지 않은 채 커밋한 제 잘못입니다.

자기 속성 검사는 이제 `Object.prototype.hasOwnProperty.call`을 사용합니다. 상세 입력 검사는 올바르고
검증되었으므로 유지하며, 남은 상세 작업은 별도 변경으로 이어갑니다. `npm run build`, `npm run lint`,
`npm run test:docs`, `make docs-check`, 코어 상세 검사가 통과했습니다.

## 2026-09-15 — 스크립트 URL 정규식을 lint에서 유지

CI가 HTML 렌더러에서 실패했습니다. 기준 렌더러에서 이식한 스크립트 URL 정규식을
`no-control-regex`가 거부했습니다. 이 정규식은 URL이 스킴 글자 사이에 숨길 수 있는 제어 문자를
건너뜁니다. 저는 커밋 전에 형식 검사만 실행하고 `npm run lint`는 실행하지 않았습니다.

정규식은 기준 렌더러가 쓰는 그대로 두고, 해당 줄에만 규칙을 끄면서 제어 문자가 의도된 것임을
주석으로 밝혔습니다. `npm run lint`가 통과하고 HTML 렌더러 검사 207개가 통과했습니다.

## 2026-09-15 — 서버 렌더링 프레임의 후보 검증 결과 기록

`e1bb6f20`의 후보 검증이 통과했습니다. 생성 검증은 HTTP 요청 899개에서 결과 450개를 모두
통과했고, 여기에는 빌드된 프레임 문서, 레코드 페이로드가 있는 SSR 폼 HTML, 조합마다 거부해야 하는
SSR 쿼리 10개가 포함됩니다. PHP 두 모드는 각각 생성 검사 62개와 저장소 검사를 통과했습니다.
서버별 브라우저 실행은 1,752개를 모두 통과했고 집계는 실패 없이 7,008개를 통과했습니다. 시나리오
1,216개, 초기화 비교 5,376개, 상호작용 320개, 로드 전 마운트 32개, 프레임 문서 64개입니다. PHP는
340,871밀리초, PHP 확장은 306,669, Go는 276,126, Rust는 265,581밀리초로 모두 900,000밀리초
제한 이내였습니다.

기능 기록에 이 결과와 소스 아카이브 digest, 이미지 digest를 적었습니다.

## 2026-09-15 — 열 비교에 렌더링 노드 규칙 적용

후보 검증이 Vue에서 다시 실패했습니다. Vue 초기화 보고서마다 비교 168개 중 16개가 실패했고,
하이드레이션한 열은 서버의 style 속성 원문(`--crudui-sticky-depth:0`)을 유지한 반면 마운트한 열은
Vue가 계산한 선언 블록(`--crudui-sticky-depth: 0;`)을 가지고 있었습니다. 명세는 style 속성을 CSS
객체 모델이 직렬화한 선언으로 비교하고 렌더링 기준점 노드를 제외한다고 이미 적고 있었지만, 그
규칙은 프레임의 하이드레이션 검사에만 구현되어 있었고 페이지는 속성 원문을 비교했습니다. React는
하이드레이션하면서 속성을 정규화하고 HTML 렌더러는 두 열에 같은 마크업을 쓰므로 Vue에서만 이
공백이 드러났습니다.

이제 규칙은 공용 폼 인스펙터의 함수 하나(`renderedNodes`)입니다. 프레임워크가 기준점으로 두는
주석과 빈 텍스트를 제거하고 모든 style 속성을 선언 블록으로 다시 씁니다. 프레임의 하이드레이션
검사와 페이지의 열 비교가 모두 이 함수를 사용합니다.

폼 인스펙터 검사 20개가 통과했습니다.

## 2026-09-15 — 비교 대상을 뷰 컨테이너가 담은 것으로 정의

프레임 문서 변경의 후보 검증이 Vue 두 렌더링 경로에서 실패했습니다. Vue 초기화 보고서마다 비교
168개 중 18개가 실패했고 첫 차이는 폼 뷰 요소 자체였습니다. `csr` 열의 컨테이너에는
`data-v-app=""`이 있고 `ssr` 열에는 없었습니다. Vue는 이 속성을 `createApp().mount()`에서 쓰고
하이드레이션하는 `createSSRApp()` 마운트에서는 쓰지 않습니다. 즉 이 속성은 렌더링된 내용이 아니라
그 열이 어떻게 시작했는지를 기록합니다. 이전에는 두 열이 모두 마운트했기 때문에 드러나지
않았습니다.

이제 비교는 `renderedViews`로 뷰 컨테이너가 담고 있는 것을 대상으로 하며, 페이지에 속한 컨테이너
자체는 대상이 아닙니다. 하이드레이션은 이전보다 더 엄격하게 강제됩니다. SSR 프레임은 인계 후 폼
DOM이 그대로인지 확인하고, React·Vue·HTML 렌더러에서는 서버가 렌더링한 모든 요소가 남아 있는지
확인합니다. 명세에 Vue의 표시와 하이드레이션 강제 위치를 기록했습니다.

폼 인스펙터 검사 19개가 통과했습니다.

## 2026-09-15 — 상세 보기를 구현한 런타임을 사실대로 기술

런타임 동작 표는 PHP 라이브러리, Rust, PHP 확장에 `Generator::buildDetail`, `build_detail`과
렌더링 대응 심볼을 적어두고 있었습니다. 그 여섯 심볼은 존재하지 않습니다. 상세 보기는 JavaScript
패키지와 Go에만 구현되어 있고, 기능 계약도 이미 그렇게 기록하고 있습니다(`buildDetail`,
`renderDetail`이 `partial`이고 PHP·Rust·PHP 네이티브는 `unsupported`).

이제 표는 구현하지 않은 동작을 줄표로 표시하고, 상세 보기에 없는 것도 함께 적습니다. 공용 픽스처,
렌더러 적합성 검사, 네이티브 바이트 동일성 실행은 폼과 목록만 다루므로 JavaScript와 Go의 상세
출력을 비교하는 검사가 없습니다. JavaScript 렌더러 네 개는 각자의 인라인 명세로 부분 문자열 세
개만 단언하고, 유일한 공용 상세 픽스처에는 레코드도 기대 HTML도 없는 명세 유효성 사례 두 개만
있습니다.

`make docs-check`가 통과했습니다.

## 2026-09-15 — 공개 브라우저 모듈을 import까지 함께 로드

프레임 문서 변경의 후보 검증이 컨테이너에서 실패했습니다. 공개 프레임 준비 모듈을 Chromium에서
로드하는 소스 검사가 파일을 읽어 `data:` URL로 import했기 때문에, 이 모듈이 새로 가지게 된 공용
브라우저 행렬 import를 해석하지 못했습니다(`Failed to resolve module specifier
"./runtime-paths.mjs"`). 이 검사는 공개 모듈이 모두 단일 파일일 때만 통과했고, 제가 import를
추가하면서 검사를 함께 넓히지 않았습니다.

이제 검사는 배포와 같은 방식으로 공개 모듈을 HTTP로 제공하고 같은 출처의 문서에서 모듈을
로드하므로, JSON 행렬을 포함한 import 그래프 전체를 확인합니다. 모듈의 export 세 개도 단언합니다.
또한 초기화할 수 없는 프레임은 준비 이벤트를 영영 게시하지 않는 대신 이유를 페이지에 게시하고,
페이지는 무진행 제한을 기다리지 않고 그 이유로 실패합니다.

Chromium 소스 검사 4개, 비교 소스 검사 150개, `make docs-check`가 통과했습니다.

## 2026-09-15 — SSR 열을 서버가 렌더링한 프레임 문서로 제공

비교 페이지의 `ssr` 열은 서버 렌더링이 아니었습니다. 프레임 문서에는 빈 폼 뷰만 있었고,
브라우저가 `render`를 요청해 받은 HTML을 페이지에 넣은 뒤 그 위에 프레임워크를 마운트했습니다.
두 열 모두 첫 화면이 JavaScript에서 나왔습니다. 정적 문서 검사가 그 빈 뷰를 요구했으므로 계약이
서버 렌더링의 반대를 강제하고 있었습니다. 서버가 제공하던 별도의 SSR 문서는 링크와 네이티브 폼,
서버별 출처를 담은 다른 페이지였고 비교 페이지는 그 문서를 불러오지 않았습니다.

이제 `ssr` 동작이 프레임 문서 자체를 제공합니다. 쿼리는 정확히 `lang`, `server`,
`initialization=ssr`이며 각각 한 번씩이고, 그 밖의 쿼리는 하나의 메시지로 거부합니다. 서버는
빌드된 프레임 문서를 읽습니다. 이 문서에는 `<html>` 시작 태그, 빈 `<div id="form-view"></div>`,
`</body>`가 각각 정확히 하나 있어야 하며, 응답은 그 문서에 세 가지만 삽입하고 나머지는 그대로 둔
것입니다. html 시작 태그의 언어, 폼 뷰 안에 저장 레코드로 렌더링한 폼, body 종료 태그 앞의
`<script type="application/json" id="crudui-ssr">`에 담은 레코드와 생성기 출처이며 `<`, `>`, `&`는
이스케이프합니다. PHP, PHP 확장, Go, Rust가 같은 규칙과 같은 오류 메시지 두 개를 구현합니다.

프레임 문서는 서버가 렌더링한 폼과 브라우저 전용 도구를 분리합니다. `#form-view`,
`#outline-view`, `#data-view`입니다. 모든 어댑터가 `mountView`와 `hydrateView`를 제공하고
하이드레이션이 서버 노드를 어떻게 다루는지 선언합니다. React는 `hydrateRoot`로 하이드레이션하고
대기 대신 하이드레이션된 트리의 effect로 커밋을 알리며 복구 가능 오류에서 실패합니다. Vue는
`createSSRApp`로 하이드레이션합니다. HTML 렌더러는 마크업을 유지하고 폼과 구조 맵 바인딩을
연결합니다. Svelte는 노드를 교체합니다. Svelte 하이드레이션은 자신의 서버 렌더러만 쓰는
`<!--[-->` 표시를 읽으므로 컨테이너를 비우고 마운트하며, 어댑터가 이를 선언하고 명세에
기록했습니다. SSR 프레임은 레코드를 페이로드에서 읽고, 인계 후 폼 DOM이 그대로인지 확인하며,
노드를 이어받는 어댑터에서는 서버가 렌더링한 모든 요소가 남아 있는지 확인합니다. 초기화 단계
`mounted`는 이제 문서 자체입니다. 페이지가 레코드를 초기화하고 해당 열의 문서를 다시 불러 두 열이
각자의 경로로 시작합니다.

검사는 같은 계약을 모듈 하나에서 따릅니다. `frame-document.mjs`는 프레임 문서를 읽고 SSR 문서의
세 삽입을 제거해 빌드 문서를 돌려줍니다. 프레임 빌드, 브라우저 검사, 생성 검사가 모두 이 모듈을
사용합니다. 브라우저 검증은 모든 렌더링 경로와 프레임워크의 초기화 문서 두 개, 서버당 16개를
기록하고 네 서버 문서 뒤의 빌드 문서를 SHA-256으로 비교합니다. 생성 검증은 빌드된 프레임 문서,
페이로드 레코드와 출처, 조합마다 모든 서버가 같은 메시지로 거부해야 하는 SSR 쿼리 10개를
추가했습니다. 결과 450개, 요청 899개입니다. 운영 문서의 생성·집계 수치는 오래되어 있었고
(결과 290개, 요청 411개, 시나리오 912개) 현재 수치로 정정했습니다.

비교 소스 검사 149개와 `make docs-check`가 통과했습니다.

## 2026-09-15 — Vue 컴포넌트가 문법 노드만 렌더링

jsdom에서 측정한 결과, 공용 세션 폼의 서버 마크업을 Vue `createSSRApp`로 하이드레이트하면 입력
요소가 교체되고 불일치 40건이 보고되었습니다. Vue가 주석을 기대하는 자리에 서버 마크업에는 노드가
없었습니다. Vue 노드와 구조 맵 빌더는 없는 헤더, 푸터, 번호, 제목, 행 컨트롤, 중첩 본문에 `null`을
넘겼고, Vue는 `null` 자식을 자리 표시 주석으로 렌더링합니다. 공용 비교는 비교 전에 주석을 제거하므로
이 추가 노드는 보고되지 않았습니다.

이제 빌더는 없는 부분에 자식을 추가하지 않습니다. 변경 후 같은 마크업을 하이드레이트하면 모든 요소가
유지되고 불일치가 없었으며, `createForm` 경로(비어 있을 때, 주입 후, 모든 행을 접은 후)와 `bindForm`
경로에서 렌더링한 폼, 구조 맵, 데이터 보기에 주석 노드가 없었습니다. `npm test -w
@crudui/generator-vue`가 테스트 342개를 통과했습니다.

## 2026-09-15 — HTML 렌더러를 문자열 렌더러 형식에 맞춤

문자열 렌더러는 같은 바이트를 만들어야 했지만 검사에는 HTML 렌더러가 없었습니다. 네이티브 생성
검사는 PHP, PHP 확장, Go, Rust만 React 서버 렌더링과 비교했습니다. 폼 고정 데이터 90개를 바이트
단위로 비교하면 HTML 렌더러는 60개에서 React와 달랐습니다. input 속성 순서, 속성 이름
대소문자(`readonly`, `autocomplete`), 빈 요소 닫기, `style` 텍스트, 텍스트 이스케이프가 달랐고
목록 이미지 preload 링크를 쓰지 않았으며 속성 값의 `>` 이스케이프도 달랐습니다. 런타임 계약은 바이트
규칙이 어느 렌더러에 적용되는지 밝히지 않았습니다.

이제 계약은 문자열 렌더러(React 서버 렌더링, HTML 렌더러, PHP, PHP 확장, Go, Rust 생성기)를 밝히고
React 서버 렌더링을 기준으로 삼아 그 형식을 나열합니다. HTML 렌더러는 이 형식을 씁니다. 이스케이프,
React 속성 이름, input의 `style`, `name`, `checked`, `value`를 마지막에 두기, `/>`로 닫는 빈 요소,
`property:value`를 `;`로 이은 `style`, 차단한 스크립트 URL, textarea의 앞 줄바꿈 중복, 이벤트 속성이
있는 컨트롤의 원본 속성, 원본 목록 동작, 목록 이미지 preload 링크입니다. 네이티브 생성 검사는
`javascript.mjs --renderer html`로 HTML 렌더러를 여섯 번째 대상으로 실행하므로 이 규칙이 모든 문자열
렌더러에 강제됩니다. React와 HTML 렌더러의 목록 레이아웃 검사와 목록 고정 데이터 생성기는 따로 두던
복사본 대신 정규화 전에 preload 링크를 제거하는 `list-body.mjs`를 함께 사용하며, 목록 고정 데이터를
재생성한 결과는 같은 바이트였습니다.

`make test-native`가 검사 1171개(JavaScript, HTML 렌더러, PHP, Go, Rust, 네이티브 PHP 각 195개)를
통과했습니다. `npm run test:forms`(core 110, HTML 207, React 352, Vue 342, Svelte 339·10, Chromium 17),
`npm run test:form-comparison:source` 141개와 `:browser` 4개, `make docs-check`가 통과했습니다.

## 2026-09-15 — 실수 고정 데이터 값을 C double 리터럴로 작성

`make test-native`가 PHP 확장 엔진 테스트 "list rendering has no undefined behavior findings"에서
멈췄습니다. 생성된 C 고정 데이터가 `ps_float_value(1000000000000000100)`을 썼고, Apple clang 21이
값을 1000000000000000128로 바꾸는 정수에서 double로의 암시적 변환을
거부했습니다(`-Wimplicit-const-int-float-conversion`, `-Werror`). 같은 검사는 2026-09-14에
통과했습니다. 2026-09-15에 Xcode 27이 설치되어 `xcode-select`가 Command Line Tools 16.2 컴파일러
대신 그 clang 21을 선택합니다. 값은 네이티브 숫자 사례 1000000000000000128에서 오며,
JavaScript는 이를 `1000000000000000100`으로 출력합니다.

고정 데이터 작성기는 안전한 정수 범위 밖의 숫자를 JavaScript 출력 그대로 썼으므로 정수값이 C
정수 리터럴이 되었습니다. 이제 C double 리터럴을 쓰며 정수값에는 `.0`을 붙입니다. C는 이
리터럴을 같은 가장 가까운 double로 읽습니다. 엔진 테스트는 22개가 통과했습니다. address
sanitizer 테스트는 선언된 플랫폼 조건에 따라 Linux 밖에서 건너뛰며 Linux CI 작업에서
실행됩니다.

## 2026-09-15 — 비교 페이지를 한 화면에 고정

6273d16 배포 뒤 실제 Safari에서 왼쪽 프레임 안의 모두 펼치기를 누르고 포인터를 페이지 머리글로 옮긴 뒤
PHP, React, bindForm 반복 주입 비교를 실행했습니다. 168/168 대신 비교 3개 뒤에 포인터 안내로
멈췄습니다. 실행 중 기록을 보면 페이지는 `saved`까지 스크롤 0이었습니다. `copied` 단계가 새 행으로
포커스를 옮기자 Safari가 페이지를 602px로 스크롤했고, 왼쪽 프레임의 위쪽이 602px에서 0으로 올라와
멈춰 있던 포인터 아래에 왔으며, 그 프레임의 문서 요소가 `:hover`와 일치했습니다. 프레임은 각각 뷰포트
높이로 스크롤되는 페이지에 쌓여 있었으므로, 어떤 포커스 이동이든 사용자가 프레임 밖에 둔 포인터 아래로
프레임을 가져올 수 있었습니다.

이제 페이지는 한 화면에 들어가며 스크롤하지 않습니다. 제목, 컨트롤, 설명, 비교 결과, 소스 정보,
보고서는 뷰포트 높이의 45%로 제한한 패널로 묶여 그 안에서 스크롤하고, 두 프레임은 나머지를 좌우로
나눠(1000px 이하에서는 위아래 절반) 각자 안에서 스크롤합니다. 페이지의 마크업과 스타일시트에 긴 결과와
3,000px 높이의 프레임 문서를 넣어 Chromium과 Playwright WebKit의 1680×1100, 900×700에서 측정한 결과,
페이지는 스크롤할 수 없고, 두 프레임은 뷰포트 안에 있으며, 각 프레임 맨 아래 컨트롤에 포커스하면 그
프레임만 스크롤되고(2,474px, 2,862px) 페이지는 0에 머물며, 머리글 위의 포인터는 어느 프레임 위에도
있지 않았습니다. 비교 계약에 이 배치를 명시했습니다.

`npm run test:form-comparison:source` 141개와 `:browser` 4개, `make docs-check`가 통과했습니다. 배포된
a40f434 페이지에서 실제 Safari로 왼쪽 프레임 안의 모두 펼치기를 누르고 포인터를 페이지 머리글로 옮긴
뒤 PHP, React, bindForm 반복 주입 비교를 실행한 결과 168/168 일치했습니다. 포인터를 왼쪽 프레임 위에
둔 채 시작하면 비교는 결과 없이 포인터 안내로 멈췄습니다.

## 2026-09-15 — 포인터가 프레임 밖에 있을 때만 비교를 캡처

3eb6db3 배포 뒤, safaridriver로 실행한 실제 Safari에서 포커스 테두리 차이를 재현했던 절차를
반복했습니다. 왼쪽 프레임 안의 모두 펼치기를 실제 포인터로 누른 뒤 PHP, React, bindForm 반복 주입
비교를 실행했습니다. 이제 모든 단계에서 포커스된 컨트롤과 `:focus-visible` 상태는 같았지만 비교는
`copy-removed`부터 `restored`까지 CSS에서 168개 중 7개가 실패했습니다. 다른 속성은 버튼의
`background-color`였습니다. 포인터가 머문 왼쪽 열은 `.crudui-action:hover` 배경인
`rgb(249, 250, 251)`이고 오른쪽 열은 투명 또는 흰색이었습니다.

포인터는 한 프레임 위에만 있을 수 있습니다. Chromium, Playwright WebKit, Safari에서 프레임의 문서
요소는 포인터가 그 프레임 위에 있는 동안 정확히 `:hover`와 일치합니다. 모든 브라우저에서 프레임 안의
`:hover`를 막는 페이지 스타일은 없습니다. Safari에서 iframe의 `pointer-events: none`은 hover를 그대로
두었고, iframe을 덮는 투명한 요소는 포인터 위치의 최상위 요소였는데도 최상위 문서에서 포인터가
움직이기 전까지만 hover를 해제했습니다. Playwright WebKit도 두 방법 모두 포인터를 움직인 뒤 hover를
복원했습니다.

이제 비교 페이지는 포인터가 두 프레임 밖에 있을 때만 열을 캡처합니다(`src/frame-pointer.mjs`).
포인터가 프레임 위에 있으면 비교는 결과 없이 멈추고 포인터를 프레임 밖으로 옮긴 뒤 다시 비교하라고
알리며, 로드 뒤 표시하는 목록도 비교하지 않고 같은 안내를 표시합니다. 비교에서 제거하는 스타일은
없습니다. Chromium 검사는 포인터를 페이지에서 프레임으로, 다시 페이지로 옮기며 매번 프레임 상태를
읽습니다.

`npm run test:form-comparison:source` 141개와 `:browser` 4개, `make docs-check`가 통과했습니다.

## 2026-09-15 — 스크립트 포커스의 표시 여부를 명시

Safari에서 배포된 68ee49c 페이지의 PHP, React, bindForm 반복 주입 비교가 `expanded-all`,
`undone`, `empty`, `restored`에서 CSS만 실패했습니다. 두 열 모두 같은 버튼에 포커스가 있었지만
왼쪽 열은 포커스 테두리가 없고 오른쪽 열은 `:focus-visible` 테두리가 있었습니다. safaridriver로
실행한 실제 Safari는 네 번 168/168 통과했고, 그중 한 번은 실제 포인터로 비교를 시작했습니다. 왼쪽
프레임 안의 모두 펼치기를 실제 포인터로 누른 뒤에는 168개 중 8개가 실패했습니다. `copy-removed`부터
`restored`까지 CSS가 달랐고, 단계 기록은 포커스된 컨트롤이 오른쪽 열에서만 `:focus-visible`과
일치함을 보였습니다.

Chromium, Playwright WebKit, Safari에서 측정한 결과, 포인터로 버튼에 포커스된 뒤 다른 컨트롤에
스크립트로 `focus()`하면 `:focus-visible`과 일치하지 않으며, 세 브라우저 모두 `focus({ focusVisible
})`가 이를 결정합니다. 바인딩은 포커스를 `focus({ preventScroll: true })`로 복원하고 `focus()`로
옮겼으며, 비교 단계는 `focus()`로 컨트롤에 포커스했습니다. 따라서 한 프레임 안의 이전 포인터
입력이 그 열만 바꿨습니다.

이제 바인딩은 표시 여부를 명시합니다. `connectForm`은 포커스된 컨트롤이 `:focus-visible`과
일치하는지 기록하고 그 표시 여부로 복원합니다. 작업 뒤 행이나 추가 버튼으로, 또는 구조 맵에서
선택한 행으로 옮긴 포커스는 사용자의 위치를 옮기므로 표시합니다. 비교 페이지의 bindForm
컨트롤러도 같은 규칙을 따르고, 비교 단계는 키보드 사용자처럼 `focusVisible: true`로 컨트롤에
포커스합니다. 런타임과 비교 계약에 두 규칙을 명시했습니다. 페이지, 스크롤 박스, 프레임 호스트의
Chromium 검사는 포인터로 누른 펼치기/접기 버튼을 테두리 없이 복원하는지, 테두리가 보이게 포커스한
버튼을 테두리 있게 복원하는지, 포인터로 누른 추가가 새 행으로 보이는 포커스를 옮기는지 확인합니다.
`connectForm` 변경이 없으면 세 호스트 모두 테두리가 보이게 포커스한 버튼에서 실패하고, 변경이
있으면 모두 통과합니다.

`npm run test:forms`(core 110, HTML 207, React 352, Vue 342, Svelte 339·10, Chromium 17), `npm run
test:form-comparison:source` 141개와 `:browser` 3개, `make docs-check`가 통과했습니다.

## 2026-09-14 — 비교 저장소 잠금이 브라우저 하나에만 적용됨을 명시

Playwright WebKit 비교가 배포에 대해 실행되는 동안 사용자의 Safari 검사가 끝나지 않았습니다. 각
페이지가 자기 저장소 잠금을 가졌어도 두 실행은 같은 저장 레코드를 썼습니다. `navigator.locks`의
잠금은 브라우저 하나에 속합니다. 이제 비교 계약은 같은 배포를 쓰는 다른 브라우저, 다른 사람, 자동화
실행이 잠금 없이 레코드를 읽고 교체하므로 서로 다른 브라우저의 검사를 동시에 실행하면 안 된다고
명시합니다. 서버는 서버·렌더링 경로·프레임워크마다 레코드 저장소 하나를 유지하며, 실행마다 저장소를
분리하는 안은 검토했지만 채택하지 않았습니다.

## 2026-09-14 — 사용할 수 없는 조작을 aria-disabled로 표시

Safari에서 배포된 9d6beec 페이지의 반복 주입 비교가 `restored`의 CSS와 포커스 차이를
보고했습니다. 왼쪽 열은 비활성화된 되돌리기 버튼에 포커스와 포커스 테두리가 남았고 오른쪽 열은
포커스가 없었습니다. Chrome(React, bindForm, PHP: 168/168), Playwright WebKit의 PHP 8개 조합(각
168/168), 사용자의 Safari 전체 실행(보고서 96개, 실패 0개)에서는 재현되지 않았습니다.

`undone` 단계는 되돌리기 버튼에 포커스하고 누릅니다. 이력이 비면 모든 렌더러가 그 버튼에
`disabled`를 썼습니다. Playwright로 측정한 결과, 포커스된 버튼이 비활성화되면 Chromium은 포커스를
유지하고 WebKit은 다음 렌더링 갱신에서 포커스를 해제합니다. 어느 엔진이든 같은 비활성 버튼으로
교체하면 포커스를 잃습니다. 따라서 "되돌리기는 포커스된 조작 버튼을 유지한다"는 결과가 브라우저에
따라, 그리고 WebKit의 포커스 해제가 프레임의 재렌더링·포커스 복원보다 먼저인지 나중인지에 따라
달라졌습니다.

이제 폼과 구조 맵의 모든 조작 버튼은 HTML·React·Vue·Svelte 렌더러와 Go·PHP·Rust·PHP 확장
생성기에서 사용할 수 없는 조작을 `disabled` 대신 `aria-disabled="true"`로 표시합니다. 버튼은
포커스를 받을 수 있고 클릭해도 아무 일도 하지 않습니다. `connectForm`, `connectOutline`, 비교
페이지의 bindForm 컨트롤러는 `aria-disabled`를 읽고, 스타일시트는 `[aria-disabled='true']`에
스타일을 적용합니다. 필드 컨트롤의 `disabled`는 선언된 데이터 상태이므로 그대로 둡니다. 공유 폼
렌더·구조 맵 픽스처를 재생성했고 바뀐 것은 이 속성뿐입니다. 마크업 명명 검사는 조작 버튼의
`disabled`와 `true`가 아닌 `aria-disabled` 값을 거부하고, 공유 DOM 시나리오는 사용할 수 없는
위로 이동 버튼이 포커스를 유지하며 클릭해도 아무것도 바꾸지 않는지 확인합니다.

`npm run test:forms`(core 110, HTML 207, React 352, Vue 342, Svelte 339·10, Chromium 14), `make
test-native` 976/976, Go 생성기 테스트, Rust 생성기 테스트(20·4), PHP 생성기 테스트(163), `npm run
test:form-comparison:source`(141)와 `:browser`(3), `make docs-check`, `make format-check`가
통과했습니다.

배포된 68ee49c 페이지에서 PHP 서버의 모든 프레임워크·렌더링 경로의 두 프레임을 Playwright로
측정했습니다. 되돌리기 버튼은 처음에 `aria-disabled="true"`이고 `disabled`가 없습니다. `undone`
단계처럼 포커스한 뒤 스크립트 클릭으로 누르거나 Enter로 누르면, 이력이 비고 렌더링 갱신이 여러 번
지난 뒤에도 Chromium과 WebKit 모두 되돌리기에 포커스가 남습니다. WebKit에서는 어떤 버튼이든 마우스로
클릭하면 포커스가 body로 가며, 데이터를 바꾸지 않는 모두 펼치기도 같습니다. 이는 두 열에서 같은
WebKit의 마우스 동작이며 렌더링 결과가 아닙니다.

## 2026-09-14 — 비교 저장소 작업을 한 번에 하나만 실행

배포된 cf95123 페이지에서 왼쪽과 오른쪽 프레임의 검사 실행을 동시에 누르자 두 프레임 모두 여러
검사가 "검사 오류"로 실패했습니다. 한 프레임만 실행하면 같은 검사가 19/19 통과했습니다. 두 프레임과
페이지, origin의 모든 탭은 같은 저장 레코드를 읽고 교체하는데, 각 프레임과 페이지는 자기 `running`
플래그로 자신만 막았고 페이지의 반복 주입 비교에는 막는 장치가 없었습니다. 두 실행이 서로의 레코드를
초기화하고 덮어썼습니다.

이제 페이지에서 시작한 작업(프레임 버튼, 폼 제출, 비교 버튼, 전체 검사)은 `navigator.locks`의
origin 잠금 하나(`src/storage-lock.mjs`)를 가진 동안에만 레코드를 변경합니다. 다른 작업이 잠금을 가진
동안 시작한 작업은 실행되지 않고 다른 검사나 저장이 실행 중이라고 알립니다. 전체 검사와 검증기가 직접
호출하는 검사는 이미 잠금을 가진 작업 안에서 실행됩니다. 자기 검사를 실행 중인 프레임은 계속 다른
버튼을 무시하므로, 그 메시지가 작성 중인 결과 목록을 대체하지 않습니다.

`npm run test:form-comparison:source`가 잠금 테스트 2개를 포함한 141개, `npm run
test:form-comparison:browser`가 3개를 통과했고 `make docs-check`가 통과했습니다.

## 2026-09-14 — 빈 컬렉션 추가 뒤 컬렉션을 다시 조회

HTML 프레임을 처음 빌드해 실행한 cc8cd95의 후보 검증은 생성 검증(결과 386개, 요청 547개)을 통과한 뒤
PHP 검사 1,744개 중 4개에서 실패했습니다. 두 렌더링 경로와 두 전송 방식의 HTML 렌더러 `empty` 시나리오가
"add into empty collection: expected 1, actual 0"을 보고했습니다. 실행은 거기서 멈춰 다른 서버는 실행되지
않았습니다. 시나리오는 추가 버튼을 누르기 전에 찾은 컬렉션 요소를 붙잡아 두고 그 뒤 그 요소에서 행을
셌습니다. React, Vue, Svelte는 그 요소를 유지하지만 HTML 렌더러는 변경마다
새 마크업을 쓰므로 붙잡은 요소는 문서에서 떨어져 있었습니다. 런타임 계약은 이미 렌더링이 요소를 교체할 수
있다고 하므로 틀린 것은 시나리오였습니다. 이제 `addEmpty`는 컬렉션을 찾는 함수를 받아, 시나리오의
`departmentWrapper`처럼 추가가 렌더링된 뒤 다시 조회합니다. 시나리오의 다른 보조 함수는 수행하는 작업 전에만
요소를 사용합니다.

그 실행은 저장소에 있던 다른 세션의 커밋되지 않은 변경 때문에 후보 준비가 시작을 거부해, 해당 커밋의 별도
git worktree에서 진행했습니다. `npm run test:form-comparison:source`가 테스트 139개를 통과했습니다.

## 2026-09-14 — Go 상세 모델과 SSR 렌더링 추가

Go 생성기가 `BuildList`에서 사용하는 기존 순서 보존 표시·합성 경로를 재사용하는
`BuildDetail`과 `RenderDetail`을 제공합니다. 명령 어댑터는 `renderDetail` 작업에
객체 레코드 하나를 받습니다.

## 2026-09-14 — Svelte 상세 렌더링 추가

Svelte 생성기가 공용 읽기 전용 `Detail` 컴포넌트와 `renderDetail` SSR 진입점을
제공합니다. 표시 분기는 코어 상세 모델을 소비하며 기존 raw HTML 표시 경계를
유지합니다.

## 2026-09-14 — Vue 상세 렌더링 추가

Vue 생성기가 공용 `Detail` 컴포넌트와 비동기 `renderDetail` SSR 진입점을
제공합니다. 코어 상세 모델과 기존 목록 셀 표시 매핑을 소비합니다.

## 2026-09-14 — React 상세 렌더링 추가

React 생성기가 공용 `Detail` 컴포넌트와 `renderDetail`을 제공합니다. 코어 상세
모델과 기존 셀 표시 컴포넌트를 소비하며, 출력은 읽기 전용이고 데이터 조회나
중복 표시 평가를 수행하지 않습니다.

## 2026-09-14 — CRUDUI 상세 명세와 공용 읽기 모델 추가

CRUDUI에 순서가 있는 읽기 전용 표시 필드를 갖는 `Detail` 선언을 추가했습니다.
코어는 기존 목록 엔진에 합성, 조건, 지역화, 표시 형식 처리를 위임하는
`buildDetail`을 제공하고 HTML 생성기는 `renderDetail`을 제공합니다. TypeScript
검증기와 스키마 검사가 새 진입점을 확인합니다. 다른 런타임 생성기는 아직
미완성이며 기능 상태는 partial로 기록했습니다.

## 2026-09-14 — 비교 페이지에서 HTML 렌더러 비교

비교 페이지는 클라이언트 열을 React, Vue, Svelte로만 렌더링했고, 프레임워크와 무관한 렌더러인
`@crudui/generator-html`은 브라우저 행렬에 포함된 적이 없었습니다. 이제 `html`이
`runtime-paths.json`의 네 번째 프레임워크이므로 서버가 그 경로를 받아 SSR 문서를 렌더링하고 모든
검사가 이를 포함합니다.

- `create-form-html.ts`는 프레임에 `renderForm`, `renderOutline`, `renderData`를 렌더링하고, 렌더링
  구독보다 먼저 `connectForm` 바인딩 하나(폼과 구조 맵의 작업을 모두 실행)를 연결하며, 변경마다 다시
  렌더링하고 동기화합니다. `bind-form-html.ts`는 `bindForm`으로 `renderFormView`, `renderOutlineView`,
  `renderDataPanel`을 렌더링합니다. 프레임 빌드는 `#html`을 렌더러 소스로 연결하고, 페이지는 프레임워크
  선택기에 HTML을 제공하며 소개문과 README에 이를 적습니다.
- 행렬 숫자를 적던 테스트가 이제 이를 계산합니다. 생성 테스트는 내보낸 생성 합계를, 상호작용 테스트는
  행렬에 다섯 동작을 곱한 값을, 런타임 경로 테스트는 행렬과 조합 수를 비교합니다.
- 비교 명세는 새 규모를 적습니다. 시나리오 보고서 64개와 초기화 보고서 32개, 서버마다 보고서 24개(시나리오
  16, 초기화 8)의 작업, 상호작용 80개, 로드 전 마운트 8개, 정적 문서 8개, 집계 시나리오 검사 1,216개, 초기화
  비교 5,376개, 상호작용 320개, 마운트 32개, 정적 문서 32개, 생성 검증 결과 386개, 요청 547개, 조합 32개입니다.
  이 문장의 오류 두 가지도 함께 바로잡았습니다. a384cfc가 범주를 일곱 개로 줄였는데도 집계는 초기화 비교
  4,608개라고 적었고, 로드 전 마운트 프레임을 880cb11이 `csr`로 바꾼 열 이름 `inject`로 불렀습니다.
  런타임 패키지와 네이티브 생성기 문서도 브라우저 대상에 HTML 렌더러를 적습니다.

`make format-check`, `npm run test:form-comparison`(소스 139, 라이브러리 10, 브라우저 작업 3),
`npm run test:runtimes`(20), `make docs-check`, Go 서버 테스트, Rust 서버 테스트 4개가 통과했습니다. HTML
프레임을 포함한 프레임은 후보 검증에서만 빌드되어 네 서버와 함께 실행됩니다.

## 2026-09-14 — HTML 렌더러로 bindForm 폼 렌더링

React, Vue, Svelte는 애플리케이션이 `bindForm`으로 관리하는 폼을 상태 없는 `FormFields`로 렌더링하지만,
`@crudui/generator-html`은 `createForm` 인스턴스로만 폼을 렌더링할 수 있었습니다(`renderForm(form)`).
구조 맵과 데이터 보기에는 이미 상태 없는 `renderOutlineView`와 `renderDataPanel`이 있었습니다. 이제
`renderFormView(fields, buttons, messages)`가 `bindForm`, `bindButtons`, `formMessages`로 `crudui-form`
블록을 렌더링하고 `renderForm`이 이를 사용하므로 마크업은 한 곳에서 만들어집니다. README와 폼 런타임
명세가 이를 설명합니다.

HTML 렌더러의 적합성 테스트는 렌더링 가능한 모든 폼 사례를 이 경로로도 렌더링합니다. `bindForm`은
누락된 반복 데이터에 고정 행 키를 주므로, 인스턴스 경로가 건너뛰는 누락 데이터 사례도 포함합니다.
`npm test -w @crudui/generator-html`이 테스트 206개(기존 116개와 bindForm 사례 90개)를 통과했고,
`npm run build -w @crudui/generator-html`이 성공했으며 `make docs-check`가 통과했습니다.

## 2026-09-14 — 속성 순서에 관한 런타임 계약 정정

폼 런타임 명세는 여전히 복원한 HTML 문자열이 "속성 순서까지" 같아야 하고 공통 DOM 바인딩이
checkbox의 `checked` 속성을 마지막에 둔다고 적고 있었습니다. 이는 a384cfc가 정정한 기준이며 이를
강제하던 코드도 그때 제거했지만 계약 문장은 바꾸지 않았습니다. 이제 명세는 정정한 규칙을 적습니다.
속성 순서는 계약에 포함되지 않고, 바인딩은 속성을 재배치하지 않으며, 비교는 파싱한 DOM을 사용하고,
문자열 렌더러의 바이트 단위 동일 HTML은 따로 검사합니다.

`make docs-check`가 통과했습니다.

## 2026-09-14 — 브라우저 보고서 개수를 행렬에서 계산

브라우저 행렬을 한 파일로 옮긴 뒤에도 서버 보고서 정책은 보고서 개수를 숫자로 적었습니다. 브라우저
작업의 보고서 18개, 시나리오 보고서 12개, 초기화 보고서 6개, 상호작용 검사 60개, 로드 전 마운트·정적
문서 검사 각 6개였고, `check.mjs`는 작업을 18로 시작했습니다. 프레임워크를 추가하면 모든 숫자가
틀리게 됩니다. 이제 정책은 보고서 키를 확인할 때 이미 쓰는 조합 함수로 각 개수를 확인하고,
`browserJobReportCount()`(시나리오 보고서와 초기화 보고서의 합)가 `check.mjs`와 보고서 테스트에 작업
크기를 줍니다.

`npm run test:form-comparison:source`가 테스트 139개를 통과했습니다.

## 2026-09-14 — 비교 브라우저 행렬을 한 곳에서 정의

비교 페이지의 서버, 렌더링 경로, 프레임워크, 전송 방식, 초기화 경로, API 작업이 `runtime-paths.mjs`에
적혀 있고, 브라우저 보고서 정책, 후보 검증·준비·시작 검사, 프레임, 배포 헬스체크, PHP API와 생성기,
Go·Rust 서버와 그 테스트에 다시 적혀 있었습니다. 렌더러를 추가하려면 모든 목록을 찾아야 했고,
프레임워크와 무관한 HTML 렌더러가 비교에 추가되지 않은 원인 중 하나였습니다.

이제 행렬은 `examples/form-comparison/src/runtime-paths.json` 한 곳에서 정의합니다.
`runtime-paths.mjs`가 이를 가져오고 모든 JavaScript 검사가 그 export를 사용합니다. 빌드는 이 파일을
`spec.json` 옆에 게시합니다. Go 서버(`newServer`)와 Rust 서버(`Server::load`)는 시작할 때 한 번 읽어
API 경로를 만들므로 캐시된 템플릿 렌더링은 여전히 파일을 읽지 않으며, 테스트도 같은 파일을 읽습니다.
PHP API는 새 `matrix.php`의 `browserMatrix()`로 경로를 검사하고 PHP 생성 테스트도 이를 순회합니다.
`FormGeneration::document()`는 API 경로가 이미 하는 렌더링 경로·프레임워크 검사를 반복하지 않습니다.
처음에는 `FormGeneration` 안에서 행렬을 읽었는데 파일을 읽지 않아야 하는 요청 생성 검사가 깨져, 별도
함수로 바꿨습니다.

`npm run test:form-comparison`(소스 139, 라이브러리 10, 브라우저 작업 3), Go 서버 테스트, Rust 서버
테스트 4개, 바꾼 PHP 파일의 `php -l`, `make format-check`가 통과했고, `browserMatrix()`가 파일에서 렌더링
경로·프레임워크·작업을 읽었습니다.

## 2026-09-14 — 폼 스냅숏 모듈 하나만 유지

`form-snapshot.mjs`와 그 테스트가 같은 내용으로 두 벌 있었습니다. 원본인 `tests/form-inspector/`와
`examples/form-comparison/src/`의 복사본입니다. 변경을 두 곳에 해야 했고, 비교 검사는 복사본 테스트를,
CI 네이티브 작업은 원본 테스트를 실행했습니다. 복사본과 그 테스트를 제거했습니다. 비교 프레임은
원본을 가져오고, 비교 빌드는 원본을 페이지에 게시하며, `test:form-comparison:source`가 원본 테스트를
실행하므로 로컬 검사와 비교 CI 작업이 계속 이를 확인합니다.

`node --test tests/form-inspector/form-snapshot.test.mjs`가 테스트 18개를 통과했고,
`npm run test:form-comparison`이 원본을 소스 검사에 포함해 통과했습니다.

## 2026-09-14 — 속성 순서 없이 브라우저 DOM을 비교하고 순서를 강제하던 코드 제거

f3109ad에서 비교 페이지의 전체 검사를 Safari로 실행하자 네 서버 모두 Vue `bindForm`의
`ssr/restoration`과 `csr/restoration`이 `html` 범주에서 실패했고, 파싱 DOM을 포함한 다른 범주는
모두 통과했습니다. 차이는 checkbox 하나였습니다. 마운트 때 `checked="" value="1"`, 복원 뒤
`value="1" checked=""`였습니다. 후보 검증은 Chromium만 실행하므로 통과했습니다.

틀린 것은 폼이 아니라 기준이었습니다. 직렬화한 HTML은 속성이 만들어진 순서를 드러내고, 그
순서는 프레임워크와 브라우저 엔진이 정하며, 속성 순서는 DOM의 일부가 아닙니다. 이 기준을
맞추려고 세 곳이 검사만을 위해 속성을 재배치하고 Chromium의 순서를 전제로 했습니다.
`connectForm`의 `sync()`는 `checked`를 맨 뒤로 옮겼고, 비교 `bindForm` 컨트롤러는 컨트롤마다
속성 순서를 기록해 복원했으며, React의 `resolvedStyleProps`는 `style`을 렌더링된 속성 뒤에
두었습니다. 정정한 규칙: 문자열 렌더러(PHP, PHP 확장, Go, Rust, HTML 렌더러)는 생성 검사가
확인하는 대로 바이트 단위로 같습니다. 브라우저에서 만든 DOM은 어떤 경로와 엔진에서도 파싱
DOM(요소, 속성 이름과 값, 텍스트, 자식 순서)이 같아야 합니다. 비교를 통과하려고 DOM을 재배치하는
코드는 두지 않습니다.

- 초기화 비교는 `html` 범주를 뺍니다(보고서마다 일곱 범주, 결과 168개). `formSnapshot`은 HTML을
  증거로 계속 기록합니다. 공유 초기화 테스트는 HTML을 뺀 스냅숏을 비교하고, React 스타일 테스트는
  `isEqualNode`로 노드를 비교합니다.
- 속성 순서를 다루던 세 루틴과 checkbox의 속성 순서를 고정하던 컨트롤러 테스트를 제거했습니다.
- 기대 브라우저 합계가 배포 검사와 테스트 두 곳에 숫자(456, 2304, 5,808)로 적혀 있어 범주 변경 뒤
  오래된 합계가 남았습니다. 이제 `browser-report-policy.mjs`의 `expectedBrowserSections()`가 브라우저
  행렬에서 한 번 계산하고 배포 검사와 테스트가 이를 사용합니다.

`make format-check`, `npm run test:forms`(core 108, HTML 116, React 350, Vue 341, Svelte 338과
클라이언트 10, Chromium·명명 검사 14), `npm run test:form-comparison`(소스 139, 라이브러리 10,
브라우저 작업 3), `npm run test:build`(9), `npm run test:dependencies`(12),
`npm run test:runtimes`(20), `make docs-check`가 통과했습니다.

## 2026-09-14 — 폼 비교 검사에서 generator-core보다 검증기를 먼저 빌드

다음 `main` CI 실행에서 같은 작업이 한 단계 앞에서 다시 실패했습니다. `@crudui/generator-core`
빌드가 `Cannot find module '@crudui/validator'`로 멈췄는데, generator-core의 선언이 빌드되지 않은
검증기 패키지를 가져오기 때문입니다. 이전 확인은 `packages/generator-core/dist`만 지웠으므로 로컬
검증기 빌드가 이를 가렸습니다. 이제 `test:form-comparison:source`는 `test:forms`와 같은 순서로
generator-core보다 먼저 `build:validator`를 실행합니다. `packages/validator-ts/dist`와
`packages/generator-core/dist`를 모두 지운 상태에서 `npm run test:form-comparison:source`가 두 패키지를
빌드하고 테스트 140개를 통과했습니다.

## 2026-09-14 — 폼 검사의 Chromium 검사를 CI 샌드박스 Chrome으로 실행

같은 `main` CI 실행에서 "Form instances and data injection" 작업도 실패했습니다. 이 브랜치가
`npm run test:forms`에 추가한 Chromium 스타일 검사 6개가 브라우저를 실행하지 못했습니다("No usable
sandbox!"). 그 작업은 전에는 브라우저 작업이 아니어서 Ubuntu 러너에서 쓸 수 있는 샌드박스가 없는
Puppeteer 다운로드 Chrome을 사용했고, 다른 브라우저 작업은 `/opt/google/chrome/chrome`의 일반 Chrome을
선택하고 Puppeteer 다운로드를 건너뛰며 `scripts/check-ci-browser.mjs`로 샌드박스를 확인합니다. 이제 그
작업도 같게 하며, 브라우저 작업을 나열하는 CI 정책 테스트는 이 작업을 포함하고
`tests/form-styles.test.mjs`가 샌드박스를 끄지 않는지도 확인합니다. 이전 워크플로에서 정책 테스트는
`form-runtime`의 빠진 설정 세 가지로 실패했고, 변경 후 `npm run test:runtimes`가 테스트 20개를
통과했습니다.

## 2026-09-14 — 폼 비교 소스 검사 전에 generator-core 빌드

`main`에 머지한 뒤 CI 작업 "Form comparison runner regressions"가 실패했습니다.
`examples/form-comparison/src/bind-form-controller.test.mjs`가
`@crudui/generator-core/dist/index.mjs`를 불러오지 못했습니다. 비교 `bindForm` 컨트롤러는 이
브랜치에서부터 generator-core의 뷰 상태·이력 함수를 사용하는데, 그 CI 작업은 패키지를 빌드하지 않은
깨끗한 체크아웃에서 `npm run test:form-comparison`을 실행합니다. 로컬에서는 이전 빌드가 `dist`를
남겨 두어서만 통과했습니다. 이제 `test:form-comparison:source`는 `test:forms`가 패키지를 빌드하듯,
비교 소스가 불러오는 유일한 패키지인 `@crudui/generator-core`를 먼저 빌드합니다.

`packages/generator-core/dist`를 지운 상태에서 `npm run test:form-comparison:source`가 패키지를
빌드하고 테스트 140개를 통과했습니다.

## 2026-09-14 — 화면 높이 프레임 후보 검증과 배포 기록

`node examples/form-comparison/candidate-verification.mjs`가 f3109ad에서 통과했습니다. PHP,
PHP 확장, Go, Rust가 각각 검사 1,452개를 실패 없이 통과했고, 브라우저 검증은 검사 5,808개를
실패 없이 기록했습니다. `node examples/form-comparison/comparison-deployment.mjs --commit
f3109ad…`가 이를 `https://crudui.test/`에 배포하고 동일 재적용 검사를 통과했습니다. 798px
브라우저 창에서 프레임은 798px 높이이고 SSR과 CSR 열은 8/8 일치합니다. 페이지를 프레임까지
스크롤하고 프레임을 700px 스크롤하면 회사 헤더는 화면 맨 위 0px 고정선에, 스토어 헤더는 38.5px
고정선의 39px에 있으며 둘 다 단계 레이블을 보이고, 고정되지 않은 부서와 Busan 헤더는 레이블을
숨깁니다. 스크롤 직후 페이지가 렌더링되기 전에 잰 값은 레이블을 여전히 숨김으로 읽었고, 렌더링 뒤
다시 재자 표시되었습니다.

## 2026-09-14 — 비교 프레임 높이를 화면에 맞춤

고정 행이 CSS만으로 동작하게 된 뒤에도 비교 페이지는 일반 페이지와 다르게 동작했습니다. 원인은
스크립트가 아니라 배치였습니다. 각 프레임이 798px 화면에서 1,450px로 고정되어 페이지와 프레임이
모두 스크롤되었고, 고정 헤더가 붙는 프레임 위쪽 가장자리가 페이지를 스크롤하자마자 화면 밖으로
나갔습니다. 화면보다 긴 스크롤 박스도 같게 동작합니다. 이제 각 프레임은 `100vh` 높이이므로 스크롤
영역이 보는 화면과 같습니다. 스크롤 위치가 현재 행을 정한다고 남아 있던 주석 두 곳(`actions.ts`,
`instance.ts`)을 바로잡았습니다. 스크롤과 관련해 남은 스크립트는 작업이나 맵 선택 뒤 행의 컨트롤에
포커스하는 것뿐입니다.

generator-core 테스트(108)와 `npm run test:form-comparison:source`(140)가 통과했습니다.

## 2026-09-14 — CSS 전용 고정 행 후보 검증과 배포 기록

`node examples/form-comparison/candidate-verification.mjs`가 3578158에서 통과했습니다. PHP,
PHP 확장, Go, Rust가 각각 검사 1,452개를 실패 없이 통과했고, 브라우저 검증은 검사 5,808개를
실패 없이 기록했습니다. 앞선 실행은 멈췄습니다. 338d060은 React의 고정 행 SSR 인계에서,
5fbcf5a는 Chromium 스크린샷 오류로 실패했고 둘 다 이후 커밋에서 고쳐지거나 대체되었으며,
3578158의 첫 실행은 디스크가 가득 차 이미지 구성 중 실패했습니다. 컨테이너 이미지 빌더가 반복된
후보 빌드로 약 75GB의 빌드 캐시를 갖고 있었고, `container prune`, `container image prune --all`,
빌더 삭제(다음 빌드에서 캐시를 다시 만듦)로 83GiB를 확보했으며 실행 중인 컨테이너와 볼륨은
건드리지 않았습니다. `node examples/form-comparison/comparison-deployment.mjs --commit 3578158…`가
이를 `https://crudui.test/`에 배포하고 동일 재적용 검사를 통과했습니다. 브라우저에서 SSR과 CSR
열은 8/8 일치하고, 각 프레임은 고정 행 4개를 가지며 `data-crudui-stuck`, `data-crudui-current`,
게시 길이가 없고, SSR 프레임을 스크롤하면 회사 헤더가 고정선에 붙어 레이블을 보이며 아직 고정되지
않은 Busan 헤더는 레이블을 숨깁니다.

## 2026-09-14 — 고정 행을 CSS만으로 동작하게 하고 스크롤 측정 제거

고정 행이 프레임에서 페이지와 같게 동작하지 않은 것은 브라우저 바인딩이 스크롤 위치를 스크립트로
측정했기 때문입니다. `connectRows`가 경계 사각형으로 고정 행과 현재 행을 정하고 계산된 폼 뒤
여백을 위해 길이를 게시했으며, `alignRow`는 둘러싼 모든 문서까지 스크롤하는 `scrollIntoView`로
행을 스크롤했습니다. 그 계산 중 하나(스크롤 컨테이너, 폼 뒤 내용)를 고칠 때마다 기준이 틀린 다른
곳이 드러났습니다. 사용자는 CSS로 할 수 있는 것만 남기기로 결정했습니다.

- 제거: `connectRows`, `RowTracking`, `markOutline`, `alignRow`, `data-crudui-stuck`과
  `data-crudui-current` 속성, `crudui-current` 이벤트, 구조 맵의 `aria-current` 표시, 게시하던
  `--crudui-scroll-height`와 `--crudui-form-end-*` 길이, 폼 뒤 여백, 현재 행 테두리, 현재 맵 줄에만
  `controls: outline`을 보이던 규칙(맵 줄은 이제 항상 컨트롤을 보임). `scrollIntoView`의 jsdom
  대역과 인계 비교에서 그 속성을 빼던 처리도 함께 없어졌고, `contracts/features.json`은 세 함수를
  더 이상 나열하지 않습니다.
- `crudui.css`: 고정 헤더는 계속 `--crudui-sticky-depth` 고정선에 쌓입니다. 단계 레이블은
  `scroll-state(stuck: top)` 컨테이너 쿼리로 헤더가 고정된 동안에만 보입니다. 고정 행 안의
  컨트롤은 위에 고정되는 헤더만큼의 위쪽 스크롤 여백(`--crudui-sticky-cover`)을, 모든 폼 컨트롤은
  푸터만큼의 아래쪽 스크롤 여백을 가집니다.
- 행 작업 뒤나 구조 맵 선택으로 행에 이동하면 그 컨트롤에 포커스하고 브라우저가 보이게
  스크롤합니다(Chromium은 가운데에 둠). `connectForm`, `connectOutline`, 비교 페이지의 `bindForm`
  컨트롤러가 같은 방식을 씁니다.
- Chromium 스타일 검사는 모든 경우를 페이지, 스크롤 박스, 프레임에서 실행합니다. 고정선에 쌓인
  헤더와 고정된 동안에만 보이는 레이블, 행 추가와 맵 선택 뒤 고정 헤더와 푸터에 가리지 않는
  포커스를 확인합니다.

`make format-check`, `npm run test:forms`(core 108, HTML 116, React 350, Vue 341, Svelte 338과
클라이언트 10), `npm run test:form-comparison:source`(140), `npm run test:build`,
`npm run test:dependencies`, `make docs-check`, Chromium 스타일 검사 6개(환경마다 2개)가
통과했습니다. 마지막 `make docs-check`는 Rust 크레이트를 다시 빌드하다 디스크가 가득 차 먼저
실패했고, 멈춘 5fbcf5a 후보 컨테이너·이미지·디렉터리를 지운 뒤 통과했습니다.

## 2026-09-14 — React에서 고정 행을 동일하게 넘겨받기

338d060의 후보 검증은 `browser-php`에서 실패했습니다. React의 SSR 인계가 첫 고정 행에서 달랐는데,
서버는 그 style을 `--crudui-sticky-depth:0`으로, React는 `--crudui-sticky-depth: 0;`으로 씁니다.
로컬 공유 인계 테스트는 스펙에 고정 행이 없어 이를 잡지 못했습니다. 저는 고정 행을 비교 예제에만
선언했습니다.

- `style` 속성은 CSS 선언 블록이므로, 비교 프레임과 `compareServerTakeover`의 인계 비교는 CSS
  객체 모델이 직렬화한 선언으로 비교합니다.
- 공유 폼 세션 스펙이 회사와 스토어에 고정 행을 선언하므로 React, Vue, Svelte 폼 테스트가 이를
  렌더링하고 비교합니다.
- 이로써 f7f814e부터 있던 React 결함이 드러났습니다. `resolvedStyleProps`는 React가 ref를 호출할
  때마다, 즉 렌더링마다 style 속성을 지우고 다시 추가했으므로, 다시 렌더링된 행의 style이 브라우저
  바인딩이 쓴 `data-crudui-current` 뒤로 옮겨졌고, 나중에 데이터를 받은 폼이 데이터와 함께 만든 폼과
  원시 HTML에서 달랐습니다. 이제 style 속성은 요소가 처음 연결될 때만 렌더링된 속성 뒤에 놓이고,
  이후 선언은 제자리에서 바뀝니다.

`make format-check`, `npm run test:forms`(core 108, HTML 116, React 350, Vue 341, Svelte 338과
클라이언트 10), `npm run test:form-comparison:source`, `npm run test:build`,
`npm run test:dependencies`, `make docs-check`, Chromium 스타일 검사 5개가 통과했습니다.

## 2026-09-14 — 폼 뒤 여백에 폼 뒤 내용 반영

폼 뒤 여백은 스크롤 컨테이너에서 이미 폼 뒤에 있는 내용을 무시했습니다. 결과 영역이 폼 뒤에
있는 비교 프레임에서는 1,037px(프레임 1,448px에서 끝 행 범위 362px와 푸터 49px를 뺀 값)을
더해 폼과 결과 사이에 빈 영역이 생겼고, 끝 행은 그 내용 높이만큼 고정선을 지나 스크롤되었습니다.
이제 규칙은 `connectRows`가 측정해 `--crudui-form-end-after`로 게시하는 폼 뒤 내용(폼 자신의
여백 제외)을 빼며 0보다 작아지지 않습니다. 폼 뒤 내용이 끝 행에 필요한 공간보다 짧으면 끝 행이
고정선에서 멈추고, 길면 여백을 더하지 않고 그 내용까지 스크롤됩니다. 문서는 더 이상 폼 뒤에
아무것도 없을 때만 한계가 정확하다고 설명하지 않습니다.

Chromium 검사 두 개가 이를 확인합니다. 스크롤 박스 안 폼 뒤에 60px 내용이 있으면 변경 전에는
끝 행이 고정선을 60px 지나쳤고(87px 대신 27px), 600px 내용이면 여백 없이 그 내용 끝까지
스크롤됩니다.

## 2026-09-14 — 모든 스크롤 컨테이너에 고정 규칙 적용, 비교 예제에 고정 행 선언

비교 페이지에 고정 헤더가 나오지 않은 것은 예제 스펙이 `multiple.header: sticky`를 선언하지
않았기 때문입니다. 로컬 미리보기는 선언했으므로 같은 생성기가 두 예제에서 다르게 동작했습니다.
원인을 확인하면서 폼이 페이지가 아닌 스크롤 박스, 대화상자, 프레임 안에 있을 때 드러날 결함을
찾았습니다. `crudui.css`는 폼 뒤 여백을 페이지 뷰포트인 `100vh`로 계산했지만 고정 헤더는 자신의
스크롤 컨테이너를 따르고, `connectRows`는 `position: sticky`와 달리 내용이 이미 넘칠 때만 조상을
스크롤 컨테이너로 취급했습니다. 700px 페이지 안 420px 스크롤 박스에서는 끝 행이 87px 고정선에서
멈추지 않고 박스 위 193px까지 스크롤되었습니다.

- `connectRows`는 `position: sticky`와 같은 방식으로 스크롤 컨테이너(세로 overflow가 `auto`
  또는 `scroll`인 가장 가까운 조상, 없으면 문서)를 정하고 그 높이를 끝 행 두 길이와 함께
  `--crudui-scroll-height`로 게시합니다. `crudui.css`는 `100vh` 대신 이 값을 씁니다. SSR 인계
  비교는 다른 바인딩 상태와 함께 이 값을 뺍니다. jsdom처럼 `scrollingElement`가 없는 DOM은 루트
  요소를 문서 스크롤 요소로 쓰고, 비교 컨트롤러 테스트의 대역 문서도 실제 문서처럼 루트 요소를
  가집니다.
- 비교 예제는 회사, 스토어, 부서에 `header: sticky`와 `title: name`을 선언하므로 모든 서버와
  프레임워크가 고정 행을 렌더링하고 비교합니다.
- Chromium 검사가 스크롤 박스 안에 폼을 마운트해 고정선 위 고정 헤더, 스크롤 되돌림 없음, 끝 행이
  고정선에서 멈추고 현재 행이 됨, 게시된 높이를 확인합니다. 변경 전에는 끝 행이 87px 고정선 대신
  −193px에 있어 실패했습니다.

## 2026-09-13 — SSR/CSR 후보 검증 통과와 배포 기록

`node examples/form-comparison/candidate-verification.mjs`가 8d0d467에서 통과했습니다. PHP,
PHP 확장, Go, Rust가 각각 검사 1,452개를 실패 없이 통과했고, 여기에는 서버·렌더링 경로·
프레임워크마다 SSR 인계를 포함한 초기화 비교 192개가 들어 있습니다. 브라우저 검증은 검사
5,808개를 실패 없이 기록했습니다. 8d0d467의 첫 실행은 디스크가 가득 차 이미지 구성 중에
멈췄고, Go 빌드 캐시와 임시 검사 디렉터리를 지운 뒤 같은 커밋으로 다시 실행했습니다.
`node examples/form-comparison/comparison-deployment.mjs --commit 8d0d467…`가 이를
`https://crudui.test/`에 배포하고 동일 재적용 검사를 통과했습니다. 브라우저에서 페이지는 SSR과
CSR 열(너비 1,000px 초과 시 좌우)을 보여 주며 PHP·React·bindForm에서 비교 8/8이 일치합니다.

## 2026-09-13 — 브라우저 상호작용 검사에 SSR·CSR 열 이름 사용

4607254의 후보 검증은 상호작용이 실행되기 전에 `browser-php`에서 실패했습니다. 상호작용 검사는
여전히 `initialization=data` 프레임을, 초기 마운트 검사는 `initialization=inject` 프레임을
찾았는데, 이는 880cb11이 바꾼 열 이름입니다. 이제 상호작용 검사는 `ssr` 프레임, 초기 마운트
검사는 `csr` 프레임, 보고서 테스트 픽스처는 `ssr` 열을 사용합니다. 이 검사들은 후보 컨테이너
안에서만 실행되므로 로컬 소스 검사(140개 통과)는 옛 이름을 드러내지 못했습니다.

## 2026-09-13 — 레거시 UI와 함께 삭제된 React 폼 세션 테스트 복원

d26ecce가 레거시 FormBuilder 테스트와 함께 같은 파일의
`packages/generator-react/src/__tests__/Form.test.tsx` 전체를 삭제해, Vue와 Svelte가 실행하는
공유 초기화·세션 DOM·컨트롤·포커스 시나리오를 React는 실행하지 않게 되었습니다. 레거시 테스트를
뺀 파일을 복원하고 `compareServerTakeover`도 실행합니다. React는 테스트 350개를 통과합니다.

## 2026-09-13 — Vue와 Svelte가 서버 렌더링 폼을 바꾸지 않고 넘겨받기

d80a3a0의 첫 후보 검증은 SSR 열에서 실패했습니다. Vue는 조건 블록의 기준점으로 주석 노드를
두고, Svelte 5는 템플릿 형제 요소 사이 공백을 텍스트 노드로 남기고 빈 텍스트 기준점을 두었으며
input의 `value` 속성, textarea 텍스트, checkbox의 `checked` 속성을 브라우저 DOM에 쓰지
않았습니다. 주석과 빈 텍스트는 아무것도 그리지 않으므로, 비교 프레임과 새 공유 테스트
`compareServerTakeover`의 인계 비교에서 뺍니다. Vue·Svelte 폼 테스트는 같은 세션의 HTML
렌더러 출력과 이 테스트로 비교합니다. Svelte 템플릿은 형제 노드 사이 공백 없이 작성하고, input·
textarea·checkbox는 서버용 속성·텍스트와 `defaultValue`/`defaultChecked`를 함께 설정해 Svelte의
서버 출력과 브라우저 DOM이 다른 렌더러와 같습니다.

`make format-check`, `npm run test:forms`(core 108, HTML 116, Vue 341, Svelte 338과 클라이언트
10), `npm run test:form-comparison:source`, `npm run test:build`,
`npm run test:dependencies`, `make docs-check`, `svelte-check`가 통과했습니다. 후보 검증은 별도
항목에 기록합니다.

## 2026-09-13 — 비교 페이지에서 서버 렌더링과 클라이언트 렌더링 비교

비교 페이지는 "데이터와 함께 생성"과 "마운트 후 데이터 주입"이라는 두 클라이언트 열을 보여
주었으므로, 서버 언어와 브라우저 프레임워크가 같은 폼을 렌더링한다는 점을 드러내지
못했습니다. 이제 두 열은 SSR과 CSR입니다. SSR 열(`initialization=ssr`)에서는 선택한
서버(PHP, PHP 확장, Go, Rust)가 저장 레코드로 폼을 렌더링하고, 프레임이 그 HTML을 페이지에
넣은 뒤 선택한 프레임워크가 같은 템플릿과 데이터로 폼을 넘겨받습니다. 넘겨받은 뒤에도 파싱한
폼 DOM(모든 요소, 속성 값, 텍스트, 주석)은 브라우저 바인딩이 쓰는 상태(`data-crudui-stuck`,
`data-crudui-current`, 끝 행 길이)를 제외하고 바뀌지 않아야 합니다. 첫 후보 검증은 직렬화한
HTML을 비교했고 속성 순서에서만 실패했습니다. React는 input의 `type`, `value`, `name`을 다른 속성
뒤에 설정합니다. 속성 순서는 DOM의 일부가 아니고 문자열 렌더러의 바이트 동일 HTML은 생성 검사가
계속 확인하므로, 인계 검사는 파싱한 DOM을 비교합니다. CSR 열(`initialization=csr`)은 데이터 없이 폼을 마운트한 뒤
레코드를 주입합니다. 이후 모든 단계는 전과 같이 두 열 사이에서 비교합니다. 비교 이름, SSR
문서 링크, 프레임 준비·타이핑 검사와 문서가 새 이름을 사용합니다.

폼 비교 소스 검사 140개와 Go·Rust 비교 서버 테스트, `make docs-check`가 통과했습니다. SSR
인계 자체는 네 서버 후보 검증에서만 실행되며 별도 항목에 기록합니다.

## 2026-09-13 — crudui.css와 레거시 제거의 네 서버 후보 검증 통과 기록

`node examples/form-comparison/candidate-verification.mjs`가 0ab3c93(`crudui.css`만으로 폼
스타일링)과 eb9f7b7(레거시 UI 경로 제거, 빌드·의존성 검사 수정 후)에서 통과했습니다. 두 실행
모두 PHP, PHP 확장, Go, Rust가 각각 검사 1,452개를 실패 없이 통과했고, 브라우저 검증은 검사
5,808개를 실패 없이 기록했으며 명령은 상태 0을 반환했습니다.

## 2026-09-13 — CI가 실행하는 빌드·의존성 검사 수정

`npm run test:build`와 `npm run test:dependencies`가 실패하고 있었으며, 이번 작업에서 사용한
폼 검사 묶음은 이를 실행하지 않았습니다.

- `tests/build/public-types.mts`와 `public-types.cts`는 노드 뷰모델이 제거한 `FieldShape`와
  `MultipleSettings`를 여전히 참조했습니다. 이제 현재 공개 타입 `NodeVM`과 `ButtonVM`을
  참조합니다.
- 폼 비교 컨트롤러는 7a2b73a부터 `@crudui/generator-core`를 import하지만 루트 패키지가 이를
  선언하지 않았습니다. 이제 루트 패키지가 워크스페이스 패키지를 개발 의존성으로 선언합니다.
- `tests/build/package-consumer-pack.test.mjs`는 존재하지 않는 경로를 넘겼는데, `packPackage`는
  07e8f9f부터 패키지 이름을 확인하려고 원본 manifest를 읽습니다. 이제 테스트가 임시 디렉터리에
  manifest를 만듭니다.

`npm run test:build`, `npm run test:dependencies`, `npm run test:runtimes`와 `tests/build`,
`tests/docs`의 테스트 67개가 모두 통과했습니다.

## 2026-09-13 — Bootstrap 기반 레거시 UI 경로 제거

레거시 폼 컴포넌트와 원본 Limepie 렌더링 비교는 Bootstrap 위에 만들어졌고, 노드 문법과
`crudui.css`로 대체되었습니다. 현재 경로 옆에 두지 않고 제거합니다.

- `@crudui/generator-react/legacy`, `@crudui/generator-vue/legacy`,
  `@crudui/generator-svelte/legacy`와 그 소스, React `@crudui/generator-react/styles.css`
  스타일시트, 이를 검사하던 테스트(React 테스트 16개, Vue·Svelte 패리티 테스트와 캡처, Svelte
  레거시 컴포넌트 테스트)
- `examples/legacy/demo-app`, `playground`, `limepie-bootstrap`, `limepie-compare`,
  `limepie-original`, `limepie-validate-test`, `react-usage.tsx`와 해당 docker-compose 서비스,
  README 항목
- `tests/parity`, `tests/cross-framework`, `tests/legacy-client`,
  `tests/fixtures/reference-html`, `tools/limepie-baseline`, 루트 `compare` 페이지, 벤더링한
  `packages/generator-legacy`, Vue·Svelte 단계가 form-render 작업을 반복하던 CI parity 작업
- 레거시 컴포넌트만 쓰던 React, Vue, Svelte 패키지의 `lucide-react`, `yaml` 의존성

레거시 명세 번역과 검증기(`@crudui/validator/legacy`와 PHP, Go, Rust 대응 구현), 레거시 검증 API
예제와 공유 명세는 데이터를 검증할 뿐 렌더링하지 않으므로 남깁니다. 공개 패키지 테스트는 이제
`@crudui/generator-core/crudui.css`가 유일하게 export되는 스타일시트인지 확인합니다.

제거 후 `npm run build`, `npm run lint`, Svelte 타입 검사가 통과했습니다. generator-core와
HTML은 계속 테스트 108, 116개를 통과했고, React, Vue, Svelte는 347, 341, 338개(제거한 레거시
테스트만큼 358, 7, 11개 감소), Svelte 클라이언트는 10개, Node 검사는 11개를 통과했습니다. 폼
비교 소스 검사 140개와 새 스타일시트 export 검사가 통과했고, 구형 스키마·표시 문서가 제거한
React 소스를 더 이상 링크하지 않게 한 뒤 `make docs-check`가 통과했습니다. 같은 실행에서
`tests/build/public-packages.test.mjs`의 선언 컴파일 검사와 의존성·pack 검사 두 개가 이미 실패하고
있었음이 드러났으며, 다음 항목에서 고칩니다.

## 2026-09-13 — crudui.css만으로 폼 스타일링: 위젯은 Bootstrap 대신 crudui 문법 사용

위젯 마크업은 원본 폼에서 이어받은 Bootstrap 어휘(`form-control`, `form-select`,
`input-group`, `input-group-text`, `btn`, `btn-group`, `btn-check`, `btn-switch`,
`flex-wrap`, `data-toggle="buttons"` 속성, 테두리 없는 언어 그룹의 `p-0 border-0`)를 그대로
썼고, core 스타일시트는 이를 전혀 스타일링하지 않았습니다. 미리보기는 CDN에서 Bootstrap을
불러왔고 비교 페이지는 `#view` 안의 컨트롤을 직접 스타일링했으므로, 폼은 라이브러리 밖의
스타일이 있어야 제대로 보였습니다. 이제 위젯은 다섯 구현과 여덟 렌더러 모두에서 클래스 문법을
따릅니다. `__affix`, `__button`, `--search`, `--unsupported`를 가진 `crudui-widget`, `--select`와
`--file`을 가진 `crudui-input`, `__input`, `__label`, `--multiple`을 가진 `crudui-choices`이고,
action 위젯 버튼은 `crudui-action crudui-action--text`, 테두리 있는 언어 그룹은
`crudui-node--framed`입니다. 위젯 모델 layout `input-group`과 `btn-group`은 `widget`과
`choices`가 되었습니다. 렌더러가 그 밖에 쓰는 클래스는 검증 훅 `valid-target`,
`valid-target-async`, 에디터 호스트, 스펙이 선언한 클래스뿐이며, 명명 검사는 그 외 클래스가
나오면 실패합니다.

core 스타일시트는 `@crudui/generator-core/crudui.css`입니다(`./styles.css` export는 제거).
모든 위젯을 스타일링하고, box-sizing과 `[hidden]` 요소 숨김을 포함한 모든 규칙이 crudui 블록
범위 안에 있습니다. 페이지는 자기 레이아웃만 스타일링합니다. 미리보기는 레이아웃을 페이지 안에
두고 더 이상 Bootstrap을 불러오지 않으며, 비교 페이지 스타일시트는 `#view` 안을 스타일링하지
않고, 비교 서버의 SSR 문서는 `crudui.css`를 불러옵니다. Go와 PHP 패키지 예제도 폼 스타일을
`crudui.css`에서 가져오며, 폼 푸터의 제출 버튼과 중복되던 자체 제출 버튼을 더 이상 붙이지 않습니다.

`make format-check`가 통과했습니다. 다시 생성한 폼 렌더링·구조 맵 사례로 generator-core, HTML,
React, Vue, Svelte가 테스트 108, 116, 705, 348, 349개를, Svelte 클라이언트가 10개, 문법 밖 클래스를
거부하는 명명 검사를 포함한 Node 검사가 11개를 통과했습니다. `make test-native`가 생성기 검사
976개(구현별 195개), 구성별 PHP API 검사 361개, 검증 사례 103개를 통과했습니다. 비교 Go·Rust 서버
테스트, 비교 소스 검사 140개와 Chromium 검사 3개, `make docs-check`가 통과했습니다. Chrome에서
미리보기는 자기 레이아웃과 `crudui.css` 두 스타일시트만 불러오며 Bootstrap 없이 입력, select,
textarea, 체크박스, 언어 테두리, 구조 맵, 푸터 버튼을 그립니다.

## 2026-09-13 — 모든 Rust 크레이트와 Go 파일 포맷 정리, `make format-check`로 검사

rustfmt나 gofmt를 실행하는 검사가 없어 포맷이 어긋나 있었습니다. Rust 크레이트 다섯 개에
rustfmt 차이 62곳(최근 폼 변경 코드를 포함해 generator-rust에 54곳), Go 파일 두 개에 gofmt 차이가
있었습니다. `tests/runner/go/run_test.go`는 import 별칭을 두 번 적어(`validator validator "…"`)
아예 컴파일되지 않았습니다. 모든 크레이트와 파일을 정리하고 import를 고쳤습니다. `make
format-check`는 추적 중인 모든 `Cargo.toml`에 대해 공용 Rust 명령 진입점으로 `cargo fmt --check`를,
추적 중인 모든 Go 파일에 대해 `gofmt -l`을 실행하고 차이가 있으면 실패합니다. 스펙을 참조로
컴파일하는 비교 Rust 서버 테스트도 비교 검사처럼 `buttons`를 루트에 둡니다.

`make format-check`가 통과했습니다. generator-rust가 테스트 20개와 4개를, validator-rust가 모든
테스트 대상을, 비교 Rust 서버가 4개를 통과했고, 레거시 Go 검증기와 Go 테스트 러너의 `go test`가
통과했으며, 레거시 Rust API와 Rust 벤치가 빌드되었고, `make test-native`가 생성기 검사 976개를
모두 통과했습니다.

## 2026-09-13 — 버튼·스크롤 변경의 네 서버 후보 검증 통과 기록

`node examples/form-comparison/candidate-verification.mjs --ref e3f8c00`가 통과했습니다.
PHP, PHP 확장, Go, Rust가 각각 검사 1,452개를 실패 없이 통과했고, 브라우저 검증은 검사 5,808개를
실패 없이 기록했으며 명령은 상태 0을 반환했습니다. 이 검증은 폼 버튼(dd37759), 명명·DOM 시나리오
검사(6912b31), 스크롤 중 렌더링 없음(67f510e), 앞선 검증이 찾은 비교 페이지 수정 두 건을
포함합니다. 67f510e 검증은 PHP 생성 테스트에서 실패했고(fc2ee17에서 수정), fc2ee17 검증은 참조
컴파일 검사에서 실패했습니다(e3f8c00에서 수정).

## 2026-09-13 — 스크롤은 아무것도 렌더링하지 않음: 현재 행은 더 이상 인스턴스 상태가 아님

스크롤로 행을 지나면 그 행이 현재 행이 되고, `connectForm`이 `selectRow`를 호출해 새
스냅숏을 게시했습니다. 애플리케이션은 스냅숏마다 다시 렌더링하므로, 스크롤하며 행 경계를
넘을 때마다 폼 전체와 구조 맵, 현재 데이터 보기가 교체되고 포커스를 받은 컨트롤과 텍스트
선택이 복원되었습니다. 컨트롤에 포커스가 있으면 스크롤이 그 컨트롤 쪽으로 되돌아갔습니다.
선택은 맵 표시에만 쓰였으므로 조건으로 막지 않고 제거했습니다. `FormInstance.selectRow`,
스냅숏과 뷰 상태의 `selection`, `RowSelection`, `selectRowView`, `OutlineRow.current`를
없앴고, `setAllExpandedView`는 노드와 펼침 여부만 받습니다. `connectRows(element)`는 폼
행만 추적하며(맵 행은 자신의 `data-field-path`를 가짐) 다른 행이 현재 행이 되면
`crudui-current` 이벤트를 보냅니다. 새 `markOutline(outline, form)`은 폼의 현재 행에 해당하는
맵 행에 `aria-current`를 붙이고, `connectOutline`은 그 이벤트가 오거나 맵이 다시 렌더링될
때마다 이를 호출하며, 비교 페이지의 `bindForm` 컨트롤러도 자기 맵에 호출합니다.
`select-row`는 상태를 바꾸지 않습니다. `runAction`이 이동할 행을 반환하고 바인딩이 그 행을
정렬합니다. `multiple.controls: outline`이면 맵은 모든 행의 컨트롤을 렌더링하고 스타일시트가
현재 행의 컨트롤만 보여 줍니다.

Chromium 스타일 검사는 이제 폼 옆에 구조 맵을 렌더링하고, 행을 스크롤하는 동안 아무것도
렌더링하지 않으며 매 단계 맵이 폼의 현재 행 하나만 표시하는지 확인합니다. 멤버 두 명을 추가하고
컨트롤에 포커스를 둔 미리보기를 puppeteer로 측정한 결과, 변경 전에는 스크롤 제스처마다 전체
렌더링이 한두 번 일어났고 변경 후에는 한 번도 일어나지 않았습니다. 다시 생성한 구조 맵 사례로
generator-core, HTML, React, Vue, Svelte가 테스트 108, 116, 705, 348, 349개를, Svelte
클라이언트가 10개, Node 검사(정규화, 스타일, 명명)가 11개, 폼 비교 소스 검사가 140개, Chromium
검사가 3개를 통과했고 `make docs-check`가 통과했습니다.

## 2026-09-13 — 마크업 명명 규칙과 접기·되돌리기 DOM 경로 검사

폼 마크업의 클래스 명명 규칙(N1–N3: `crudui-{block}`, `__{element}`, 블록과 함께 쓰는
`--{modifier}`, 헤더 안의 부품, 본문 안의 노드)은 문서에만 있고 검사하지 않았습니다. 이제
`tests/form-markup/naming.test.mjs`가 폼 렌더링과 구조 맵 사례의 모든 `crudui-` 클래스를 허용한
블록·요소·수식자와 대조하고, 규칙을 어긴 예시 다섯 개를 거부하는지 확인하며, `npm run
test:forms`가 이를 실행합니다. 공유 DOM 시나리오는 모든 행을 접고 펼쳐 각 토글의
`aria-expanded`와 `aria-controls`가 가리키는 본문의 `hidden`을 확인하고, 편집 하나를 되돌려
컨트롤 값과 인스턴스 값을 확인합니다.

명명 검사가 테스트 2개를 통과했고, React, Vue, Svelte가 확장한 시나리오를 포함해 각각 705,
348, 349개 테스트를 통과했습니다.

## 2026-09-13 — 고정 푸터의 폼 버튼, 폼 바깥에 생기는 끝 여백

스펙은 루트에 폼 버튼(`buttons`와 제출 대상 `action`)을 선언하지만, 스키마가 이를 거부했고
컴파일은 `properties`만 보존해 선언한 저장·취소·이전 버튼이 사라졌습니다. 이제 버튼은 다섯
구현 모두에서 폼 계약에 포함됩니다. `buttons`는 `{ type: submit | reset | button | link, text,
name, value, href, design, behavior }` 목록이며, `buttons`가 없는 스펙은 제출 버튼 하나를 가집니다.
제출·초기화 버튼은 인터페이스 문구를 기본값으로 쓰고, button·link는 `text`가, link는 `href`가
필요합니다. `action`(`method`, `url`, `enctype`)은 애플리케이션을 위해 템플릿에 보존합니다. 두
키는 폼 루트 아래에서는 거부됩니다. 템플릿이 `buttons`와 `action`을 담고, `bindButtons`가 이를
평가하며 스냅숏이 보관하고, 모든 렌더러가 `formButtonsHtml`로 만든 마크업을 컨트롤 그룹 하나로
`crudui-form__footer`에 넣습니다. 푸터는 고정 행 헤더가 위에 붙듯 스크롤 영역 하단에
`--crudui-form-footer-height` 높이로 붙습니다. JSON 스키마, 검증기 네 개, CLI, 레거시 번역기가
이 선언을 받아들입니다.

폼 끝 행은 이제 마지막 행 안의 최소 높이(중첩 카드 안에 빈칸을 남김) 대신 폼 바깥 여백으로
고정선에 닿습니다. `connectRows`는 측정한 두 길이(그 행 상단부터 폼 내용 끝까지의 범위와 정렬
위치)를 연결 요소에 게시하고, 스타일시트는 `.crudui-form`의 아래 여백을 화면 높이에서 두 길이와
푸터를 뺀 값으로 줍니다. 폼 요소 자체에 게시하면 재렌더링이 여백을 없애 스크롤을 되돌렸으므로,
교체되지 않는 연결 요소에 게시합니다.

폼 비교 서버(PHP, PHP 확장, Go, Rust)는 렌더링한 폼 뒤에 자체 `_form_complete` 제출 버튼을
붙였는데, 이제 폼 푸터가 제출 버튼을 하나 더 그렸습니다. 비교 스펙과 Go·Rust·PHP 생성 테스트의
스펙이 그 버튼을 선언하고 서버는 버튼을 붙이지 않으며, 생성 검사는 문서의 제출 버튼이 정확히
하나인지 확인합니다. 이 변경의 첫 네 서버 후보 검증은 자체 스펙에 아직 버튼을 선언하지 않은 PHP
생성 테스트에서 실패했습니다. 두 번째 검증은 공개 스펙을 참조로 컴파일하는 생성 검사에서
실패했습니다. 이 검사는 버튼을 포함한 스펙 전체를 참조 파일에 넣었고, 합성은 파일의 필드만
가져오므로 참조 템플릿에는 기본 버튼이 들어갔습니다. 프레임도 같은 방식으로 서버에서 컴파일해
선언한 버튼이 템플릿에서 조용히 빠졌습니다. 이제 둘 다 루트 선언을 루트에 두고 필드만 참조합니다.

검증 결과: generator-core, HTML, React, Vue, Svelte가 테스트 108, 116, 705, 348, 349개를,
Svelte 클라이언트가 10개, 정규화가 6개, Chromium 스타일 검사가 3개를 통과했습니다.
`make test-native`가 생성기 검사 976개 전부와 구성별 PHP API 검사 361개, 검증 사례 103개를
통과했습니다. JSON 스키마가 검사 70개, TypeScript와 PHP 검증기가 1629, 1461개, Rust 검증기가
62개를 통과했고 Go 검증기와 CLI 37개가 통과했습니다. PHP 확장 엔진 테스트 22개, 교차 검증 콘솔
117개, 폼 비교 소스 검사 140개와 Chromium 검사 3개, Go·Rust 비교 서버 테스트, `make docs-check`가
통과했습니다. Chrome에서 끝 행은 최소 높이 없이 고정선에서 0.2px 떨어져 멈췄고, 폼 뒤 공간은
폼 바깥의 200px 여백이었습니다.

## 2026-09-13 — 구조 맵에 폼의 행만 표시

구조 맵은 단계마다 개수가 붙은 컬렉션 줄(예: "스토어 2개")과 그 아래 행 줄을 따로
보여 주었고, 줄마다 가이드선이 붙었으며 빈 컬렉션도 나열했습니다. 이제 규칙 하나를
따릅니다. 맵의 한 줄은 폼의 행 하나입니다. `buildOutline`은 각 행에 중첩된 행을 담은
`OutlineRow[]`를 반환하므로 맵은 폼과 똑같이 중첩되며, `OutlineCollection`은 제거했습니다.
컬렉션, 개수, 빈 컬렉션은 행이 아니므로 폼에만 남고, 중첩된 행 본문은 가이드선 없이 한 단계
들여씁니다. `multiple.controls: outline`이면 행 컨트롤은 여전히 선택한 행의 맵 줄로 옮겨지지만,
빈 컬렉션의 추가 컨트롤은 행 컨트롤이 아니므로 다섯 구현 모두에서 항상 컬렉션 푸터에 남습니다.

generator-core가 타입 검사와 테스트 104개를 통과했고, 다시 생성한 구조 맵 사례로 HTML, React,
Vue, Svelte가 116, 705, 348, 349개를 통과했습니다. 폼 비교 소스 검사 140개가 통과했고, 다섯 구현
모두 빈 컬렉션 배치를 바꾼 뒤 `make test-native`가 생성기 검사 976개를 통과했습니다. Chrome에서
맵은 단계마다 한 번씩 들여쓴 행만 보여 줍니다. 직전 변경 dad977d의 네 서버 후보 검증은 서버마다
검사 1,452개(브라우저 검사 5,808개)를 실패 없이 통과했습니다.

## 2026-09-13 — 행을 고정선에 정렬하고 현재 행이 스크롤을 따르게 함

고정 행은 계산한 오프셋 대신 값 하나에서 나온 규칙을 따릅니다. 행 루트가
`--crudui-sticky-depth`를 가지며(다섯 구현 모두 헤더 스타일에서 옮김), 고정선은 그 값에
헤더 높이를 곱한 값입니다. 헤더는 고정선에 고정됩니다. 행의 `scroll-margin-top`이 헤더를
고정선에 놓으므로 `alignRow`는 `scrollIntoView({ block: 'start' })`입니다. 마지막 행은 정렬된
상단 아래 화면 높이 이상이므로, 그 헤더가 고정선에 닿을 때 스크롤이 끝납니다. 이 변경의
중간 초안은 폼 끝에 화면 높이만큼 여백을 두어 그 지점을 넘어 스크롤되었고, 이 방식은
남기지 않았습니다.

현재 행은 규칙 하나, 스크롤 위치로 정합니다. `connectRows`는 상단이 고정선에 닿은 행(고정
행에 `data-crudui-stuck`)과 그중 마지막인 현재 행(`data-crudui-current`, 테두리 강조)을
표시하고, 선택된 행과 구조 맵이 현재 행을 따릅니다. 행 작업 뒤나 구조 맵에서 행으로 이동하면
그 행을 고정선까지 스크롤합니다. 포커스는 선택하거나 스크롤하지 않고, 바인딩은 스크롤 위치를
복원하지 않습니다. 새로 포커스를 받은 컨트롤의 행도 정렬하고 렌더링 뒤 캡처한 스크롤 위치를
복원하던 초안은, 다른 입력에 포커스를 둔 채 끝까지 스크롤하면 포커스된 행으로 되돌렸으므로
둘 다 제거했습니다. 비교 페이지 컨트롤러도 같은 core 함수를 사용합니다.

`npm run test:forms`가 core 104, HTML 116, React 705, Vue 348, Svelte 349, 정규화 10개,
node 검사 9개를 통과했습니다. node 검사에는 Chromium 검사 3개가 포함됩니다. 정확한 헤더
높이로 쌓기, 다른 곳에 포커스가 있을 때 현재 행이 스크롤을 따르기, 끝 행이 행 안 빈칸 없이
고정선에서 정확히 멈추기입니다. 폼 비교 소스 검사 140개와 Chromium 검사 3개가 통과했습니다.
다섯 구현 모두 깊이 변수를 행 루트로 옮긴 뒤 `make test-native`가 생성기 검사 976개를
통과했습니다. `make docs-check`가 통과했습니다. Chrome에서 회사명에 포커스를 둔 채 휠로
스크롤하면 거꾸로 튀지 않고 끝에 도달했고, 포커스가 유지되었으며, 판교점이 현재 행이 되고
그 상단이 정렬 위치와 0.2px 차이로 멈췄습니다.

## 2026-09-13 — 고정 행 헤더를 정확한 높이로 쌓기

고정 행 헤더(`multiple.header: sticky`)는 단계마다 `--crudui-node-header-height`만큼
내려 쌓습니다. 그런데 헤더의 실제 높이는 패딩, 내용, 아래 테두리의 합이었습니다.
기준 미리보기에서 44px 오프셋에 45px였고, 긴 제목이나 컨트롤이 줄바꿈되면 더
높아졌습니다. 그래서 고정된 단계마다 위 단계와 겹쳤습니다. 이제 고정 헤더는 테두리를
포함해 정확히 그 높이이고, 줄바꿈하지 않으며 긴 제목을 줄임표로 자릅니다. 고정된
단계는 겹치지 않고 맞닿습니다. 고정된 헤더는 불투명 배경과 그림자를 가지며, 단계
라벨은 여전히 고정된 동안에만 보입니다. 고정 판정은 임계값 0과 1의
IntersectionObserver를 사용했는데, 화면보다 긴 행에서는 호출되지 않아 가장 바깥의 고정
단계에 라벨이 보이지 않았습니다. 이제 `connectForm`은 헤더가 행 상단의 본래 위치를
벗어났을 때 고정으로 표시하며, scroll과 resize에서 애니메이션 프레임당 최대 한 번
측정합니다. jsdom에는 레이아웃이 없으므로 Chromium 검사 `tests/form-styles.test.mjs`를
`npm run test:forms`에서 실행합니다. form-structure 미리보기는 이전에 고정 헤더를
선언하지 않아 순차 고정이 보이지 않았고, 이제 다섯 단계 모두에 선언합니다.

`npm run test:forms`가 core 104, HTML 116, React 705, Vue 348, Svelte 349, 정규화 10개,
node 검사 7개를 통과했으며 새 Chromium 검사가 포함됩니다. 이 검사는 판정 변경 전에는
가장 바깥의 고정 헤더를 기다리다 시간 초과로 실패했습니다. Chrome의 미리보기에서 다섯
단계가 라벨과 함께 겹침 없이 차례로 고정되었습니다.

## 2026-09-13 — 네 서버 후보 검증에서 실패한 비교 검사 수정

초기화 비교의 첫 후보 검증에서 PHP 검사 1,452개 중 36개가 실패했고 다른 서버는
실행되지 않았습니다. 빈 컬렉션 사례 단계는 행 안에 있는 컬렉션의 추가 버튼을
제외했습니다. 이 조건은 재귀 노드 변경에서 들어갔습니다. bindForm 컨트롤러는 새 행에
포커스를 준 뒤 스크롤해서, 선택 렌더링이 이전 스크롤 위치를 복원하고 입력이 프레임
밖에 남았습니다. 이제 core처럼 먼저 스크롤합니다. createForm 검사는 메인 페이지가
스크롤되지 않는다고 단정했는데, 1,450px 프레임에서는 행 포커스 규칙과 맞지 않습니다.
이제 포커스를 받은 입력이 프레임 뷰포트와 메인 페이지 뷰포트 안에 모두 보여야 합니다.
로컬 소스 검사와 Chromium 검사는 이 검사들을 실행하지 않으며, 후보 검증만 실행합니다.

이후 e4d1375의 후보 검증이 통과했습니다. PHP, PHP 확장, Go, Rust가 각각 검사 1,452개를
실패 없이 통과해 브라우저 검사가 모두 5,808개였고, 명령은 상태 0으로 끝났습니다.

## 2026-09-13 — 두 초기화 경로를 좌우로 비교

폼 비교 페이지가 두 초기화 경로를 두 열로 보여 줍니다. 왼쪽 프레임은 데이터와 함께
폼을 생성하고, 오른쪽 프레임은 빈 폼을 마운트한 뒤 데이터를 주입합니다. API
선택(bindForm 또는 createForm)은 서버·프레임워크·언어 선택기 옆의 선택기로
옮겼습니다. 두 열은 같은 고정 행 키로 같은 단계를 실행합니다. 단계는 마운트, 반복
주입, 데이터 숨김과 복원, 편집, 저장, 다시 불러오기, 복사, 이동, 제거, 추가, 새 행
저장, 비우기, 복원, 구조 맵의 모두 펼치기·모두 접기·되돌리기입니다. 두 열이 같은
레코드에 저장하므로 차례로 실행하고, 오른쪽의 각 단계를 저장해 둔 왼쪽 단계와
비교합니다. 원시 HTML, DOM, 컨트롤 상태, 필드, 계산된 CSS, 제출 데이터, 포커스,
저장 응답을 정규화 없이 비교합니다. 상단 목록은 단계가 끝날 때마다 갱신됩니다.
프레임은 문법 스타일시트를 불러오므로 계산된 CSS가 실제 스타일을 반영합니다. 프레임
안의 초기화 검사는 제거했습니다.

bindForm 경로도 createForm과 같은 작업(펼치기/접기, 선택, 모두 펼치기, 모두 접기,
되돌리기)을 같은 뷰 상태·이력·포커스 규칙으로 지원합니다. generator-core는 이 규칙을
순수 뷰 상태·이력 함수로 export하고, 폼 인스턴스와 bindForm 컨트롤러가 함께
사용합니다. 두 경로 모두 프레임에 구조 맵과 현재 데이터 보기를 렌더링합니다. React,
Vue, Svelte는 상태 없는 `OutlineView`와 `DataPanel`(Vue: `outlineVNode`, `dataVNode`)을
제공하고, HTML 렌더러는 `renderOutlineView`와 `renderDataPanel`을 추가합니다. 공유 사례
`tests/fixtures/form-outline/cases.json`은 네 언어, 상위·중첩 행 선택,
`controls: outline`, 데이터 이스케이프에 대한 React 마크업을 담고, 네 렌더러가 모두
재현합니다. 기능 계약 매니페스트에 뷰 상태·이력 함수와 새 사례를 기록했습니다.

`make test-native`가 생성기 검사 976개(구현별 195개), 구성별 PHP API 검사 361개, PHP
구현별 검증 사례 100개를 통과했습니다. `npm run test:forms`가 core 104, HTML 116, React
705, Vue 348, Svelte 349, 정규화 10개 검사를 통과했습니다. 구조 맵 사례는 네 렌더러에서
각각 4개를 통과했습니다. 폼 비교 소스 검사 140개와 Chromium 검사 3개가 통과했습니다.
`UndoResult` 타입에 문서를 추가한 뒤 `make docs-check`가 통과했습니다. 이 타입 변경은
네이티브 검사 뒤의 타입 전용 변경입니다. 네 서버를 사용하는 전체 후보 검증은 이 변경을
커밋할 때 실행하지 않았습니다.

## 2026-09-13 — 행 작업 후 대상 행으로 포커스 이동

이전에는 행 작업이 활성 입력, 텍스트 선택, 스크롤 위치를 유지했고, 행 버튼을 포인터로
누를 때 포커스 이동을 막았습니다. 이제 런타임은 기준 폼의 포커스 규칙을 따릅니다.
추가나 복사는 새 행으로, 이동은 이동한 행으로 포커스를 옮기고, 제거는 이전 행, 다음
행, 상위 행, 컬렉션의 추가 버튼 순으로 옮깁니다. 포커스는 행의 첫 번째 활성 표시
입력이나 펼치기/접기·추가 버튼으로 가고, 행은 필요한 만큼만 스크롤합니다.
펼치기/접기, 선택, 되돌리기는 포커스를 받은 작업 버튼을 포함해 현재 포커스를
유지합니다. 포인터와 키보드 실행의 동작이 같습니다. `runAction`은 포커스를 받을 행을
`{ focus }`로 반환하고, 대상이 불완전하면 `undefined`를 반환합니다.

generator-core가 타입 검사와 테스트 102개를 통과했습니다. `npm run test:forms`가
HTML 112, React 701, Vue 344, Svelte 345, 정규화 10개 검사를 통과했고, 공유 DOM 사례가
추가·제거·복사·이동·펼치기/접기·마지막 행 제거 뒤 포커스를 받은 행을 확인합니다. jsdom은
스크롤을 구현하지 않으므로 테스트에서 `scrollIntoView`를 대체합니다. Chrome의
form-structure 미리보기에서 추가 뒤 새 행, 제거 뒤 이전 행으로 포커스가 이동했습니다.
호출을 계측해 포커스 전에 행을 스크롤하는 것을 확인했습니다. 이 순서는 동기 재렌더링이
교체한 요소를 스크롤하는 문제를 막습니다. 자동화 탭은 창을 스크롤하지 않아 실제 화면
위치는 측정하지 못했습니다. 비교 페이지의 포커스 검사는 다음 변경에서 같은 규칙으로
바뀝니다.

## 2026-09-13 — 폼을 행 카드가 있는 재귀 노드로 렌더링

모든 폼 렌더러(HTML, React, Vue, Svelte, PHP, Go, Rust, C PHP 확장)가 형태별 래퍼
대신 하나의 재귀 노드 문법을 출력합니다. 필드, 그룹, 컬렉션, 행, 언어 필드, 언어
항목은 모두 `__header`, `__body`, `__footer` 슬롯을 가진 `crudui-node`입니다. 종류는
수식자(`crudui-node--row`)이며, 동작은 `data-field-path`, `data-crudui-row-key`,
`data-lang`, `data-crudui-action`, `hidden`, ARIA 속성만 읽습니다. `bindForm`은 모든
구현에서 같은 JSON 모델의 `NodeVM[]`을 반환합니다. [폼 마크업](docs/spec/form-markup.ko.md)
명세가 문법을 정의하고 기준 폼에서 채택하지 않은 동작을 기록합니다.

- **행 카드:** 행은 계층 번호, `multiple.title`로 지정한 제목, 개수 또는 하위 행
  요약을 표시합니다. 이동·추가·복사·제거 컨트롤은 고정된 순서이며 비활성 상태를
  `min`, `max`, 위치로 모든 렌더러가 계산합니다. 브라우저가 렌더링 후 고치지
  않습니다. `multiple.controls`(`header`, `footer`, `outline`)와
  `multiple.header`(`static`, `sticky`)를 JSON 스키마, 검증기 네 개, CLI에 선언합니다.
- **문구:** 컨트롤 레이블, 개수, 요약은 모든 구현이 공유하는 ko/en/ja/zh 표 하나에서
  가져옵니다.
- **런타임:** 폼 인스턴스는 접힌 행, 선택한 행, 되돌리기 이력(100개, 같은 경로의
  연속 입력 병합)을 레코드 데이터와 분리해 보관합니다. `buildOutline`,
  `connectOutline`, `resolveAction`, `runAction`을 export합니다. React, Vue, Svelte는
  `Outline`과 `DataView`를, HTML 렌더러는 `renderOutline`과 `renderData`를 제공합니다.
- **스타일:** `@crudui/generator-core/styles.css`에 문법 스타일이 있습니다.
- **입력 규칙**(다섯 구현): 컴파일에서 `lang`은 불리언 또는 객체, `lang.only`는 언어
  코드 문자열 목록 또는 객체여야 합니다. 바인딩은 문자열이 아닌 언어, 문자열이 아닌
  `keyPrefix`·`idPrefix`, `throw`·`marker`가 아닌 `unsupported`, 지원하지 않는 언어를
  이 순서로 거부합니다. 이전에는 TypeScript가 `lang: null`에서 비정상 종료했고, C
  확장은 문자열이 아닌 `only` 항목에서 기본 언어 목록 범위 밖을 읽었으며,
  TypeScript는 `throw`가 아닌 모든 `unsupported` 문자열을 marker로, PHP는 오류로
  처리했습니다.
- **API 변경:** Go `BindOptions.Language`, `IDPrefix`, `KeyPrefix`, `Unsupported`는
  `any`이고 `KeyPrefixProvided`를 제거했으며 빈 `IDPrefix`를 그대로 사용합니다. Rust
  `BindOptions`의 문자열 옵션은 JSON 값입니다.

`examples/form-structure`는 5단계 기준 폼의 로컬 미리보기입니다. 폼 비교 페이지, 공유
DOM 사례, 교차 검증 콘솔은 속성으로 요소를 선택합니다.

복사된 PHP 검증기를 다시 설치한 뒤 `make test-native`가 생성기 검사 976개(구현별 195개와
입력 불변 검사), 구성별 PHP API 검사 361개, PHP 구현별 검증 사례 100개를 통과했습니다. `npm run test:forms`가 core 101, HTML 112, React 701, Vue 344, Svelte 345,
정규화 10개 검사를 통과했습니다. 폼 비교 페이지 소스 검사 137개, Go·Rust 검증기
바이너리를 다시 빌드한 뒤 교차 검증 콘솔 117개, `make docs-check`가 통과했습니다.
## 2026-09-13 — 통과한 검사의 임시 디렉터리 삭제

`tests/native-generators/run.mjs`는 실행마다 `crudui-native-generators-*` 빌드
디렉터리를 만들고 삭제하지 않았습니다. `scripts/check-packages.mjs`도 실행마다
145MB `crudui-consumer-*` 프로젝트를 남겼습니다. 반복 실행이 디스크를 채운 원인 중
하나였습니다. 이제 통과한 실행은 디렉터리를 삭제합니다. 실패한 실행은 디렉터리를
남기고 경로를 출력하며 보고서(`buildDirectory`) 또는 `failure.log`와 함께 기록합니다.
다른 검사 파일은 이미 임시 디렉터리를 삭제하고 있었습니다.

`make test-native`가 886개 검사를 통과하고 빌드 디렉터리를 남기지 않았습니다.
`npm run test:packages`가 통과하고 소비자 프로젝트를 남기지 않았습니다.
`make docs-check`가 통과했습니다.

## 2026-09-13 — 잘못된 multiple·design 값 형식을 컴파일에서 거부

TypeScript, PHP, Go, Rust와 C PHP 확장의 폼 컴파일은 `multiple`과 `design`의 값
형식이 잘못되어도 무시했습니다. 형식이 잘못된 행 설정은 버려지고 잘못된 design은
빈 design이 되었습니다. 이제 컴파일이 `INVALID_FORM_INPUT`와
`Invalid {key} at {path}: expected {expected}`로 거부하며 `{path}`는 필드의 구조
경로입니다. `multiple`은 불리언 또는 객체이고 `min`·`max`는 숫자, `copy`·`sortable`은
불리언이어야 합니다. `design`은 불리언 또는 객체입니다. `show`는 표현식, 불리언
또는 조건 맵입니다. `class`와 `style`, 그리고 `label`·`wrapper`·`group`·`prepend`
노드의 `class`와 `style`은 문자열 또는 조건 맵이며 노드는 객체여야 합니다. 조건 맵은
JSON 스키마와 같이 비어 있지 않은 객체입니다. 이 버킷의 알 수 없는 키는 검사하지
않습니다. 스키마 명세가 규칙을 정의합니다.

C 템플릿은 엔진 검사에서 값·오류·합성 모듈과만 링크되므로 메시지를 지역 도우미로
만듭니다. 네이티브 검사는 컴파일 거부 8건을 전체 기록으로 비교합니다.

`make test-native`가 생성기 검사 886개(구현별 177개), 구성별 PHP API 검사 361개,
각 PHP 구현의 검증 사례 100개를 통과했습니다. generator-core 타입 검사와 89개
검사, `npm run test:forms`, `make docs-check`가 통과했습니다.

## 2026-09-13 — 형태가 잘못된 생성기 데이터를 전체 경로로 거부

TypeScript, PHP, Go, Rust와 C PHP 확장의 `bindForm`과 편집 인스턴스는 검증기와
같은 데이터 형태 규칙을 적용합니다. 객체가 아닌 루트 데이터는
`Form data must be an object`로 실패합니다. 값이 있지만 객체가 아닌 그룹 값이나
반복 그룹 행은 `Group data must be an object: {path}`로 실패합니다. 값이 있지만 키
기반 객체가 아닌 반복 값은 `Repeated data must be a keyed object: {path}`로
실패합니다. `{path}`는 행 키를 포함한 전체 데이터 경로입니다. 이전에는 인스턴스가
필드 이름만 보고했고 `bindForm`은 그룹 데이터를 검사하지 않았습니다. `addRow`는
제공한 그룹 행 값을 `{collection}.{key}`에서 검사합니다. 폼 런타임 명세가 규칙과
검사 순서를 정의합니다. 폼 비교 컨트롤러의 인스턴스 정규화 사본도 같은 메시지를
사용하며 이를 검사합니다.

네이티브 검사는 데이터 형태 8가지를 `bindForm`과 인스턴스 양쪽으로 검사하며, 거부
동작 시나리오에 중첩 경로의 `setValue`와 `addRow` 사례를 추가했습니다.

`make test-native`가 생성기 검사 846개(구현별 169개), 구성별 PHP API 검사 361개,
각 PHP 구현의 검증 사례 100개를 통과했습니다. generator-core 타입 검사와 88개
검사, 폼 비교 컨트롤러 5개 검사, `npm run test:forms`, `make docs-check`가
통과했습니다.

## 2026-09-13 — 구현 간 생성기 오류 메시지 비교

네이티브 생성기 검사는 오류 코드와 위치만 비교했고 README는 언어마다 메시지가
달라도 된다고 허용했습니다. 모든 구현이 동일해야 한다는 요구와 모순되므로 코드,
메시지, 위치가 모두 일치해야 한다는 규칙으로 바꿨습니다. 거부된 폼 입력은
JavaScript와 전체 기록으로 비교합니다.

강화한 비교로 기존 차이 12건을 찾아 수정했습니다.

- PHP, Go, Rust 생성기 CLI는 객체가 아닌 `data`를 각각 `Data must be an object`,
  `Group data must be an object`, `data must be an object`로 보고했습니다. 모두
  `Form data must be an object`로 보고합니다.
- Go와 Rust는 지원하지 않는 필드 형식 메시지 표기가 달랐습니다. 둘 다
  `Unsupported field type "{type}" at "{path}"`로 보고합니다.
- Go는 잘못된 행 키 메시지에 `SequenceRowKey`를 표기했으나 다른 구현과 같이
  `sequenceRowKey`를 표기합니다.

`make test-native`가 생성기 검사 786개, 구성별 PHP API 검사 361개, 각 PHP 구현의
검증 사례 100개를 통과했습니다.

## 2026-09-13 — 검증기 로드 실패와 입력 실패를 동일하게 보고

TypeScript, PHP, C PHP 확장, Go, Rust 검증기는 형태가 잘못된 제출 데이터를 건너뛰거나
변환하지 않고 입력 실패로 거부합니다. 루트 데이터는 객체여야 하며 합성 전에
검사합니다(`Form data must be an object`). 값이 있는 그룹 또는 반복 그룹 행은
객체여야 합니다(`Group data must be an object: {path}`). 값이 있는 반복 데이터는
키 기반 객체여야 합니다(`Repeated data must be a keyed object: {path}`). 각 언어는
코드 `INVALID_FORM_INPUT`와 빈 위치를 가진 `FormInputError`를 제공하며, Rust는
`ValidateError::Load` 또는 `ValidateError::Input`을 반환합니다. 모든 구현이 키 기반
행을 정렬된 키 순서로 순회합니다.

네 검증기 CLI는 하나의 프로세스 계약을 사용합니다. 결과는 종료 상태 0과
`{valid, errors}`, 로드 또는 입력 실패는 종료 상태 2와 정확히 `{error, code, at}`,
잘못된 요청은 종료 상태 1과 `{error}`를 출력합니다. 이전에는 TypeScript와 Go가
`at` 없이 1로 종료했고 PHP는 `rule: "compose"` 오류와 함께 0으로 종료했습니다.
검증 사례는 `expectLoadError: {code}`를 `expectFailure: {code, message, at}`로
대체하고 입력 실패 사례 6개를 추가합니다. 이전 배열 행 사례는 키 기반 행을
사용합니다. 사례 생성기에는 커밋 `8688990`이 `cases.json`에만 추가했던 종료일
사례 7개를 넣어 재생성해도 사라지지 않습니다. 교차 검증 콘솔은 전체 `failure`
기록을 비교합니다. 비교·예제 서버는 입력 실패에 HTTP 400으로 응답합니다.

전체 기록을 비교하면서 Go에만 있던 차이가 드러났습니다. Go 목록 검증은 금지 키
위치 앞에 `list.`을 붙였고 Go 테스트가 이 접두를 고정했습니다. 공유 목록 사례와
다른 구현은 `columns.<이름>`을 사용하므로 Go도 같게 수정했습니다.

C 확장의 할당 실패 fixture는 키 기반 행을 사용하며 할당 횟수는 4와 3입니다. 엔진
fixture는 호출하는 C 도우미만 출력합니다. 검사 전에 콘솔이 사용하는 git 무시
대상 Go·Rust CLI 바이너리를 다시 빌드하고 generator-php의 복사된 검증기를 다시
설치했습니다. 셋 모두 소스 변경 이전 상태였습니다.

TypeScript 검증기 1618, PHP 검증기 1458, `go test ./...`, `cargo test`, 교차 검증
콘솔 117개 검사가 통과했습니다. `make test-native`는 생성기 검사 786개, 구성별
PHP API 검사 361개, 각 PHP 구현의 검증 사례 100개를 통과했습니다.
`make docs-check`가 통과했습니다.

## 2026-09-13 — 반복 행을 키 기반 객체에서만 바인딩

TypeScript, PHP, Go, Rust와 C PHP extension의 `bindForm`은 키 기반 객체에서만
반복 행을 생성합니다. 컬렉션 데이터가 없으면 `__0000000000000__` 키를 가진 행
하나를 생성합니다. 배열, null, 스칼라 컬렉션은 `INVALID_FORM_INPUT` 오류와
`Repeated data must be a keyed object: {path}` 메시지로 실패합니다. 필드 경로에
`#N` 배열 위치 세그먼트가 없으므로 다섯 구현에서 위치 도우미를 제거했습니다.
Go에서 사용하지 않던 `rowPosition` 함수도 제거했습니다. 공유 폼 사례는 키 기반
데이터를 사용하며 HTML 적합성 검사는 이전 배열 사례를 포함합니다.

`npm run test:forms`가 통과했습니다(core 88, HTML 112, React 701, Vue 344,
Svelte 345, 정규화 10). `make test-native`가 786개 생성기 검사를 통과했으며
다섯 구현의 거부 코드·메시지·경로가 같아야 하는 새 검사를 포함합니다.
`make docs-check`가 통과했습니다.

## 2026-09-13 — 스키마·검증기·CLI의 반복 행 선언 정렬

`multiple.min`을 TypeScript, Go, Rust 명세 모델에 선언하고 PHP `multiple`
버킷이 허용하며 `crudui explain`과 `crudui describe`가 표시합니다. JSON
스키마와 폼 런타임은 `min`을 정의하지만 PHP 버킷은 이를 거부했습니다. JSON
스키마에서 `multiple.copy`는 boolean이며 런타임 의미가 없던 객체 형태는
제거했습니다. 모델 주석은 숨은 식별자와 배열 순서 대신 키 기반 행 식별을
설명합니다.

스키마 검사 58개, TypeScript 검증기 테스트 1606개, PHP 검증기 테스트 1446개,
Go·Rust 검증기 테스트, CLI 테스트 37개와 `make docs-check`가 통과했습니다.

## 2026-09-13 — 프레임워크 독립 HTML 렌더링과 실행 가능한 기능 계약 추가

`@crudui/generator-html`은 프레임워크 의존성 없이 현재 폼·목록 view model을
HTML fragment로 렌더링합니다. 표·카드 목록, 현재 필드 구조, 위젯 레이아웃,
escaping 규칙과 원본 표시 콘텐츠를 지원하며 브라우저 이벤트 연결은
`@crudui/generator-core`가 담당합니다.

`contracts/features.json`은 패키지 export, 기능 계약, fixture, 테스트 파일,
지원 상태와 검증 명령을 기록합니다. manifest schema와 경로 검사기는 누락된
연결을 거부합니다. `manifest:test`는 선언된 검증 명령을 실행하며 기능 계약
페이지는 manifest에서 생성합니다. CI는 폼 검사 전에 manifest 검사와 명령 실행을
수행합니다.

HTML renderer 패키지 검사 110개가 통과했으며 폼 적합성 87개와 목록 적합성
20개를 포함합니다. 공개 패키지 export, 선언, 소비자 빌드, API 문서와
`make docs-check`가 통과했습니다. 패키지는 배포하지 않았습니다.

## 2026-09-12 — GitHub Pages로 정적 문서 게시

문서 빌드는 `DOCS_BASE_PATH`를 지원하고 영어·한국어·API 문서에 명시적인
정적 HTML 링크를 생성합니다. 개발·미리보기·404 페이지는 같은 URL 접두
경로를 사용합니다. CI는 문서를 검사한 뒤 `main`에서 생성한 사이트를
`https://polyspec.github.io/crudui/`에 배포합니다.

`DOCS_BASE_PATH=/crudui/`에서 `make docs-check`와
`make docs-verify-idempotent`가 통과했습니다. 데스크톱·모바일 화면, 한국어
탐색, 스타일시트와 중첩 경로의 404 페이지 브라우저 검사도 통과했습니다.

## 2026-09-11 — 비교 배포 명령 이름 명확화

로컬 비교 배포 진입점 이름을
`examples/form-comparison/comparison-deployment.mjs`로 변경했습니다. 검증 절차,
예제와 테스트가 명확한 비교 배포 이름을 사용합니다.

## 2026-09-11 — Linux 도구 모음에서 네이티브 C fixture 컴파일

`packages/php-ext/tests/engine.test.mjs`는 이제 네이티브 fixture를 컴파일할 때
`libm`을 연결하고 guard clause와 정리 문장을 별도 문장으로 출력합니다. C 엔진
fixture는 PHP 8.4 및 8.5 CI 작업에서 사용하는 경고 오류 설정으로 컴파일됩니다.

## 2026-09-11 — 네이티브 검사 전 JavaScript 의존성 빌드

`make test-native`는 이제 C 확장 엔진 검사 전에 작업공간 JavaScript 패키지를
빌드합니다. 네이티브 검사 대상은 깨끗한 체크아웃에서도 엔진 렌더링 fixture가
필요로 하는 빌드된 React 생성기 패키지를 제공합니다.

## 2026-09-11 — 독립 C PHP 확장 완성

PHP 확장이 폼과 검증 엔진을 C로 구현합니다. 엔진은 순서를 보존하는 값을 직접
관리하며 확장 프로세스 안에서 조합, 표현식 평가, 템플릿 컴파일, 데이터 바인딩,
폼·목록 렌더링, 검증, 행 작업과 PHP 값 변환을 수행합니다. 패키지에는 Cargo
manifest, Cargo 잠금 파일과 Rust 소스가 더 이상 없습니다. 직접 빌더는 전체 C
소스를 컴파일하며 폼 비교 이미지의 확장 단계는 Rust toolchain을 복사하지
않습니다. 비교 생성기 검사는 후보 소스 아카이브가 사용하는 루트 package lock
파일을 해시합니다.

macOS에서 C 엔진 검사 30개 중 29개가 통과했고 Linux 전용 주소 sanitizer 검사
1개는 건너뛰었습니다. 모듈 빌드와 로드는 성공했으며 PHP API 검사는 세 구성에서
각각 352개, 검증은 각 구현에서 94개를 통과했습니다. `make test-native`는 생성기
766/766개, 프로토콜 검사 19개, 모든 PHP·Go·Rust 패키지 검사와 위젯·시간대 검사를
통과했습니다. `npm run test:form-comparison`은 소스 검사 136개, 라이브러리 검사
10개와 browser-job 검사 3개를 통과했습니다. `make docs-check`도 통과했습니다.
확장과 비교 서비스는 배포하지 않았습니다.

## 2026-09-11 — C에서 폼 필드 렌더링

C 확장은 평가한 폼 필드를 서버 HTML로 렌더링합니다. 렌더러는 leaf, group, 반복,
언어 필드 구조와 현재 위젯 레이아웃 전체를 지원합니다. 컨트롤 속성 순서, 불투명
이벤트 속성, 원본 표시 콘텐츠, script와 style 요소를 유지합니다. 텍스트, 속성, URL
값과 최종 CSS 속성은 현재 렌더링 규칙을 사용합니다. 렌더링은 평가한 필드 모델을
변경하지 않습니다.

C 전용 검사는 성공하는 공통 폼 fixture 90개와 추가 escaping 및 CSS 사례 2개의
정확한 HTML이 일치하는지 확인했습니다. 같은 사례는 엄격한 C11 컴파일러 경고와
정의되지 않은 동작 검사를 통과했습니다. 이 변경은 배포하지 않았습니다.

## 2026-09-11 — C에서 폼 필드 바인딩

C 확장은 컴파일한 템플릿을 레코드 데이터에 바인딩하며 두 입력을 변경하지
않습니다. 바인딩은 표시 규칙, 번역 콘텐츠, 반복 행, 언어 필드, 체크박스 상태와
위젯 모델을 계산합니다. 명시적인 빈 배열과 빈 객체는 반복 행 0개를 생성하며,
반복 값이 누락된 경우에만 초기 행 1개를 생성합니다. 지원하지 않는 필드 타입은
호출자가 명시적인 표시 결과를 선택하지 않으면 `UNSUPPORTED_FIELD_TYPE`을
반환합니다.

위젯 구현은 완전한 버튼 및 편집기 스크립트를 생성하고 모델 멤버 순서를
유지합니다. C 전용 검사는 컴파일 가능한 공통 폼 fixture 91개의 순서 있는 필드
모델 전체가 일치하는지 확인하고 입력 불변성을 검사했으며, 같은 사례를 정의되지
않은 동작 검사와 함께 완료했습니다. 이 변경은 배포하지 않았습니다.

## 2026-09-11 — C에서 폼 표현식 평가

C 확장은 객체와 배열 경로를 확인하고 리터럴, 상대 경로, 와일드카드, 비교, 포함,
논리 연산과 삼항 표현식을 평가합니다. 조건 맵은 선언 순서에 따라 처음 일치하는
항목을 선택하고 명시적인 `true` 항목을 기본값으로 사용합니다. 구현은 표준 C11을
사용합니다.

C 전용 검사는 공통 표현식 명세 38개와 평가 사례 77개를 엄격한 컴파일러 경고
기준으로 모두 통과했습니다. 사례는 표현식 값과 논리 결과를 검사합니다. 이 변경은
배포하지 않았습니다.

## 2026-09-11 — C에서 폼 템플릿 컴파일

C 확장은 명시적인 메모리 파일을 조합하고 선언 순서를 유지하여 참조와 패치를
적용하며 참조 순환을 검출하고 조합 오류 코드와 경로를 반환합니다. 폼 컴파일은
템플릿 종류, 선택적 키 접두사, 재귀적으로 컴파일한 필드를 포함하는 데이터 독립
템플릿을 생성합니다. 필드 명세에는 중첩 `properties`를 유지하지 않습니다.

C 전용 검사는 공통 조합 20개를 모두 통과했고 공통 폼 fixture 92개에서
JavaScript 구현과 동일한 순서의 템플릿 또는 오류를 생성했습니다. C 소스는 엄격한
C11 경고 기준으로 컴파일됩니다. 이 변경은 배포하지 않았습니다.

## 2026-09-11 — C 확장 값 모델 추가

C 확장 엔진은 PHP나 Rust 데이터 구조를 사용하지 않고 null, 불리언, 정수,
유한한 수, UTF-8 문자열, 배열, 순서 있는 객체를 저장합니다. 각 값은 문자열,
객체 키, 하위 값의 수명을 직접 관리합니다. 복사, 교체, 제거는 객체 선언 순서를
유지하고 독립된 값을 생성합니다. 잘못된 UTF-8과 유한하지 않은 수는 거부합니다.

C 전용 검사는 순서, 교체, 깊은 복사, 배열, UTF-8, 숫자 비교를 확인합니다.
엄격한 C11 컴파일러 경고와 정의되지 않은 동작 검사를 통과했습니다. macOS 메모리
검사기는 누수 0건을 보고했습니다. 독립 C 확장 소스 검사는 선언된 빌드 산출물을
제외하고 패키지의 Rust 소스와 Cargo 파일을 계속 거부합니다. 이 변경은 배포하지
않았습니다.

## 2026-09-11 — Node.js 24 artifact action 사용

네이티브 PHP 8.4·8.5 CI 작업은 `actions/upload-artifact@v7`으로 비교 보고서를
업로드합니다. 이 action은 Node.js 24 런타임을 선언합니다. 이전 action은 Node.js
20을 선언했으므로 GitHub 호스팅 러너가 런타임을 교체하고 지원 종료 경고를
보고했습니다. 보고서 이름, 경로, 숨김 파일 포함 및 파일 누락 실패 동작은
변경되지 않습니다.

CI 설정 회귀 스위트는 현재 artifact action을 요구하며 검사 4개를 모두
통과했습니다. 이 변경은 배포되지 않았습니다.

## 2026-09-11 — npm 12 및 sandbox가 활성화된 Chrome CI 적용

npm 의존성 정책은 루트 매니페스트가 직접 선언하고 변경되지 않는 소스 리비전에
고정한 URL 의존성만 허용합니다. 의존성 검증은 다른 의존성이 추가한 URL 의존성을
거부합니다. 패키지 소비자 검증은 현재 npm 12 `pack --json` 보고서를 읽고 요청한
패키지와 아카이브에 대한 보고서 하나만 요구합니다.

Linux 브라우저 CI는 `/opt/google/chrome/chrome`의 정규 Chrome 파일을 사용하고
Puppeteer의 브라우저 다운로드를 비활성화합니다. 사전 검사는 브라우저 경로의 심볼릭
링크를 거부하고 sandbox 비활성화 인자 없이 Chrome을 실행하며 `chrome://sandbox`가
활성화된 1차 계층, PID, 네트워크 및 Seccomp-BPF sandbox를 확인하도록 요구합니다.
두 브라우저 CI 작업은 테스트 시작 전에 이 사전 검사를 완료합니다.

커밋 `a7ac873b5a2e47c398372a50ab8fb31a75823393`의 GitHub Actions 실행
`34551049527`은 작업 20개를 모두 성공했습니다. 이 실행은 패키지 소비자, 공개
export와 타입, 반복 빌드, 브라우저 inspector와 CSS, 폼 비교 회귀, 문서 범위 및
PHP 8.4·8.5 네이티브 생성과 PHP API 검사를 포함합니다. 실패하거나 취소된 작업은
없습니다. 이 변경은 배포되지 않았습니다.

## 2026-09-11 — 깨끗한 CI 설치 검증

저장소 루트의 폼 비교·교차 검사 명령은 직접 사용하는 JavaScript 의존성을 루트
매니페스트에 선언합니다. 폼 비교는 루트 npm 그래프를 사용하며 교차 검사 렌더러는
Vite와 Svelte 플러그인을 패키지 이름으로 해석합니다. 패키지 소비자 검증은 각 패키지
디렉터리에서 패키지를 생성하고 아카이브 결과 하나를 요구합니다.

폼 비교 CI 작업은 전체 스위트 실행 전에 PHP 8.5와 검증기·생성기 Composer 그래프를
설치합니다. 네이티브 PHP 매트릭스 작업은 선택한 PHP 릴리스의 버전이 명시된 정규
`php-config` 경로를 전달합니다. 산출물 업로드는 네이티브 검증이 보고서를 생성한
후에만 실행합니다.

깨끗한 소스 아카이브에서 폼 비교 소스 검사 136개, 생성기 구성 검사 10개와 Chromium
브라우저 검사 3개가 통과했습니다. 패키지 소비자의 export, 타입, 프로덕션 빌드와
세 프레임워크 브라우저 검증이 통과했습니다. 공개 패키지 검사 9개, 반복 빌드 검사
1개, 폼 검사기 단위 검사 18개와 브라우저 CSS 검사 6개가 통과했습니다. 교차 검사
렌더링 33개가 통과했습니다. 이 변경은 배포하지 않았습니다.

## 2026-09-11 — Svelte 편집 컨트롤 유지

Svelte 생성기는 일반 input과 textarea 컨트롤을 안정적인 DOM 요소로 렌더링합니다.
폼 인스턴스 값이 갱신되어도 각 요소, 포커스와 텍스트 선택을 유지합니다. 문자열
`on*` 동작 속성이 있는 컨트롤과 정확한 특수 HTML이 필요한 컨트롤은 raw 직렬화
경로를 사용합니다.

브라우저 연결은 현재 폼 인스턴스에서 date와 datetime 값을 포맷한 뒤 실제
컨트롤을 갱신합니다. 초기 데이터와 나중 주입은 같은 값 변환을 사용합니다.

회귀 검사는 text, email, number, password, textarea, date, datetime 컨트롤을
확인합니다. Svelte SSR·HTML 비교 345개, 마운트 브라우저 검사 10개, 생성기 코어
검사 86개가 통과했고 `svelte-check`는 오류와 경고 0개를 보고했습니다. 이 변경은
배포하지 않았습니다.

전체 `make test-native` 명령은 종료 상태 0을 반환했습니다. 확장 빌드 검사 11개,
PHP 생성기 검사 160개, 모든 Go 패키지 검사, Rust 생성기 검사 20개, PHP API 세
구성에서 각각 352개, 두 PHP 구현의 검증 사례 각각 94개, 프로토콜 검사 19개,
생성기 보고서 766/766과 Chromium 위젯·시간대 검사 5개가 통과했습니다. 생성기
보고서 SHA-256은
`16ab371b3691429ca4e2c1a3eaa3c35fb7209861abd5759f16efea6c1a19aa5d`입니다.

## 2026-09-11 — 명시적인 브라우저·PHP 입력 검증

Chromium 위젯 검사는 Vite 의존성 탐색을 비활성화하고 명시한 React·CRUDUI 패키지
5개만 최적화합니다. 모든 검사 단계에서 페이지 예외, HTTP 오류 응답, 요청 실패,
`console.error` 메시지가 발생하면 실패합니다. 위젯·시간대 검사 5개가 통과했습니다.

PHP 폼 서버는 선택한 생성기 vendor의 `composer/installed.php`에서
`crudui/validator` 설치 디렉터리를 읽습니다. 등록된 다른 Composer 설치는 패키지
선택에 영향을 주지 않습니다. 디렉터리는 선택한 vendor 디렉터리 내부에 있어야 합니다.
모든 경로 구성 요소와 로드한 클래스 파일은 일반 파일 또는 디렉터리여야 하며, 설치한
검증기 파일은 후보 소스 파일과 일치해야 합니다. 선택한 기록의 누락 또는 잘못된 형식,
외부 경로, 변경된 패키지 복사본은 생성을 실패시킵니다.
시작 상태 검사는 `Generator`와 `Form`을 생성기 소스 디렉터리에서만 허용하고
`Validator`를 선택한 Composer 패키지 복사본에서만 허용합니다. 저장소 검증기 소스
경로는 거부합니다. 상태 응답을 거부하면 서버와 검증에 실패한 첫 응답 필드를
보고합니다.

PHP 소스·생성 스위트 10개가 통과했습니다. 검증을 포함한 500회 생성은 250밀리초
제한 이내에 완료됐습니다. PHP와 PHP 확장 통합 검사는 각 모드의 생성 검사 125개와
JSON 변환, 저장, 검증, 공개 시그니처, 처리 모드 검사를 통과했습니다. 전체 폼 비교
빌드 명령은 소스 검사 131개와 생성 검사 10개를 통과했습니다.

후보 소스 검사는 운영체제의 정규 임시 디렉터리 아래에 쓰기 가능한 검사 데이터를
생성합니다. 임시 경로의 모든 구성 요소는 일반 디렉터리여야 하며 심볼릭 링크를 사용할
수 없습니다. 후보 검사는 Git 메타데이터를 요구하지 않으며 추출한 소스 디렉터리 아래에
검사 데이터를 쓰지 않습니다. 후보 검사 데이터 위치 회귀 검사와 PHP 생성 검사 10개가
모두 통과했습니다.

## 2026-09-11 — PHP 확장 직접 빌드

PHP 확장 빌더 하나가 CRUDUI과 OrderedJSON 모듈을 컴파일하고 로드합니다. 별도
진입점은 각 모듈의 소스, 출력, 플랫폼 라이브러리, 로드 검사를 선언합니다. 후보 이미지는
두 진입점을 사용하며 `phpize`, Autoconf, libtool을 실행하지 않습니다.

빌더는 컴파일 전에 정규 `php-config`, C 컴파일러, Cargo, rustc 파일을 확인합니다.
상대경로, 심볼릭 링크, 누락되거나 모호한 도구, 서로 다른 PHP 설치 정보를 거부합니다.
Rustup은 선택한 도구 체인 하나의 정규 Cargo와 rustc 파일을 식별합니다. Cargo에는
정규 rustc와 linker 경로를 명시합니다. 생성 경로 정리는 제거 전에 선언한 모든 대상을
검사하고 심볼릭 링크를 따라가지 않습니다.

직접 빌드한 두 모듈을 PHP 8.5.10에서 로드했습니다. 한 프로세스에서 두 모듈 호출이
성공했습니다. PHP API 검사는 세 구성에서 각각 352개를 통과했고 구현별 검증 사례
94개를 통과했습니다. 빌더와 진입점 회귀 검사 6개가 통과했습니다.

## 2026-09-11 — 명시적인 브라우저 완료 신호 사용

폼 비교 실행기는 탐색 전에 메인 페이지와 프레임 준비 메시지를 구독합니다. 상호작용과
타이핑 검증기는 각 UI 작업을 실행 전에 예약하고 해당 작업의 완료를 기다립니다. React와
Svelte는 `flushSync`로 동기 갱신을 완료하며 Vue는 `nextTick` 완료를 게시합니다.
검증기는 렌더러 완료 후에만 DOM 결과를 읽습니다. 주기적인 DOM 조회, 네트워크 유휴
추론, 고정 렌더링 대기를 사용하지 않습니다.

문서 개발 서버는 초기 빌드 전에 재귀 파일 시스템 구독을 등록합니다. 생성 경로인
`docs/.site/` 이벤트를 제외하고 빌드를 직렬로 실행하며 빌드 중 수신한 소스 이벤트를
추가 빌드 한 번으로 합칩니다. 빌드 실패를 보고하고 다음 소스 이벤트가 새 빌드를 요청할
수 있습니다. 파일 시스템 구독이 실패하면 서버를 종료 상태 1로 닫습니다.

후보 검증 절차는 커밋별 수명 주기 명령 하나를 실행합니다. 이 명령은 후보를 준비하고
빌드하며 시작 전에 준비 파일을 구독하고 HTTP·브라우저 검사를 순차 실행한 뒤 검증된
배포 근거만 유지합니다. 절차는 sleep 간격이나 준비 재시도 반복을 사용하지 않습니다.

폼 비교 소스 스위트 129개, 생성기 구성 성능 스위트 4개, 브라우저 작업 스위트 1개가
통과했습니다. 문서 스위트 15개도 통과했습니다. 개발 서버 검사는 HTTP 상태 200을
반환했고 소스 이벤트 한 번에 빌드 한 번을 실행했으며 `SIGINT` 후 종료 상태 0을
반환했습니다.

## 2026-09-11 — 네이티브 Cargo 명령 경로 수정

`test-native` 타깃은 Cargo를 시작할 때 확장한 `PATH`를 전달합니다. GNU Make
3.81은 시작 환경에 해당 디렉터리가 없어도 Makefile이 추가한 디렉터리에서 Cargo를
찾습니다. 회귀 검사는 모의 명령으로 타깃을 실행하고 Cargo는 추가한 디렉터리에만
배치합니다.

회귀 검사와 런타임 정책 검사 8개가 모두 통과했습니다. PHP 8.5.10에서 전체
`make test-native` 명령이 종료 상태 0을 반환했고 PHP 검사 160개, 모든 Go 패키지
검사, Rust 검사 20개, 프로토콜 검사 19개, 생성기 보고서 766/766과 Chromium
위젯·시간대 검사 3개가 통과했습니다.

## 2026-09-11 — 로컬 비교 배포 검증

저장소는 로컬 비교 Compose 파일을 생성하기 전에 후보 메타데이터, 생성·저장·브라우저
보고서, 정확한 로컬 이미지 태그와 이미지 digest를 검사합니다. 배포는 기존 데이터를
보존하며 내용이 다른 파일을 덮어쓰지 않습니다. HTTPS 검증은 명시적인 containerctl 인증
기관을 사용하고 소스 커밋, 라우트, 인증서, 데이터 마운트, 저장 파일, 응답 바이트를
검사합니다. 같은 설정을 두 번째로 적용했을 때 모든 검사 값이 변경되지 않아야 합니다.

배포가 성공하면 후보 컨테이너, 후보 디렉터리, 원본 보고서, 스크린샷, 이전 배포 결과와
배포 서비스가 사용하지 않는 로컬 비교 이미지를 제거합니다. 배포 정리 검사 11개와 폼
비교 소스 검사 96개가 모두 통과했습니다.

검사는 실패하거나 오래된 근거, 정확한 보고서 개수, 결정적 Compose 출력, 데이터 보존,
인증 기관 로드, 동일 설정 재적용 변경과 정리 경로 제한을 포함합니다. 이 변경의 배포는
아직 실행하지 않았습니다.

## 2026-09-10 — 네이티브 검사 의존성 선언

저장소 루트 빌드·검사 진입점은 직접 import하는 모든 외부 패키지를 루트
매니페스트에 선언합니다. 의존성 검사는 `make test-native`가 실행하는 Node.js
진입점을 확인하고 선언되지 않은 import를 거부합니다. 위젯 스크립트 검사는 전이
설치 대신 루트 의존성의 Vite 8.2.2를 해석합니다.

의존성 검사 6/6이 통과했습니다. PHP 8.5.10에서 전체 `make test-native`가 종료
상태 0을 반환했고 PHP 검사 160개, 모든 Go 패키지 검사, Rust 검사 20개, 프로토콜
검사 19개, 생성기 보고서 766/766과 Chromium 위젯·시간대 검사 3개가
통과했습니다.

## 2026-09-10 — 의존성 설치 스크립트 승인 적용

독립적으로 설치하는 각 npm 그래프는 모든 의존성 생명주기 스크립트의 승인을
정확한 버전으로 기록합니다. 워크스페이스 패키지는 루트 잠금 파일을 사용합니다.
CI와 컨테이너 빌드의 새 설치는 `--strict-allow-scripts`를 사용하며 승인이 없으면
설치 전에 실패합니다.

추적하는 모든 잠금 파일의 의존성 검사 5/5가 통과했습니다. 브라우저 애플리케이션
3개가 빌드됐고 parity 검사 7/7, 런타임 정책 검사 7/7, 패키지 빌드 검사 7/7과
전체 문서 검사가 통과했습니다.

## 2026-09-10 — 현재 후보 검증

교차 프레임워크와 레거시 클라이언트 잠금 파일은 각 매니페스트가 허용하는 현재
패키지 릴리스를 해석합니다. 깨끗한 `npm ci`와 `npm audit` 실행은 취약점 0개를
보고했습니다. 교차 프레임워크 비교는 14/14, 레거시 클라이언트 비교는 5/5로
통과했습니다.

후보 `757f144b9c4b5e2dd5f5dfd91c09362b3edbcedd`는 index digest가
`sha256:7842bd0a40f1e51d4c975008a9b5bdaf6d148e9faba05e68faf3a935b02fe2c7`인
이미지 `localhost/crudui-form-comparison:757f144b9c4b`를 빌드했습니다. 이미지
구성에서 소스 검사 81개와 라이브러리 검사 4개가 통과했습니다. 실행 검증은 PHP
두 모드, HTTP 요청 411개의 생성·SSR 검사 290개, 저장·검증 검사 120개와 Ordered
JSON 검사 3개를 통과했습니다.

브라우저 검증은 서버별 312개와 전체 1,248개를 통과했습니다. PHP는
213,288밀리초, PHP 확장은 206,475밀리초, Go는 200,691밀리초, Rust는
200,500밀리초에 완료했습니다. 집계는 `complete: true`, `passed: true`,
`failedChecks: 0`, `performancePassed: true`를 기록합니다. 패키지와 비교 서비스는
배포하지 않았습니다.

## 2026-09-10 — 완전한 공개 TypeScript API 타입

패키지 진입점은 공개 TypeScript 선언이 참조하는 이름 있는 타입을 모두 export합니다.
폼·목록 검증은 공개 파일 집합 타입 하나를 사용합니다. TypeDoc 검증 경고가 있으면
API 생성과 문서 커버리지가 실패합니다. export되지 않은 타입 회귀 검사 2개, 공개
선언 검사 6개와 격리한 다섯 패키지 소비자 검사가 통과했습니다.

## 2026-09-10 — 선택한 런타임 채널

`.node-version`, CI와 Node.js 컨테이너 단계는 정확한 패치 릴리스를 고정하지 않고
다음 LTS 릴리스 계열인 Node.js 26을 선택합니다. `.go-version`, CI와 Go 컨테이너
단계는 Go 1.27 안정 릴리스 계열을 선택합니다. Rust CI와 컨테이너 단계는 Rust 안정
채널을 선택합니다. CI는 현재 안정 npm 릴리스를 설치합니다. 런타임 정책 검사
6개가 모두 통과했습니다. 패키지 잠금 파일은 해석한 패키지 버전을 계속 기록합니다.

## 2026-09-10 — 네 서버 후보 검증

후보 이미지는 커밋한 소스 아카이브 하나를 압축 해제 전에 검증하고 PHP, PHP
확장, Go, Rust 서버를 시작하기 전에 애플리케이션 사용자로 전체 소스 검사를
실행합니다. 이미지 구성에서 소스 검사 81개와 라이브러리 검사 4개가 통과했습니다.
실행 검증은 Chromium 프로세스 검사, HTTP 요청 411개의 생성·SSR 검사 290개,
저장 검사 120개와 PHP 처리기 모드·Ordered JSON 검사를 모두 통과했습니다.

브라우저 집계는 시나리오 960개, 상호작용 240개, 로드 전 마운트 24개, 정적
문서 24개를 통과했습니다. 모든 서버는 900,000밀리초 제한 이내에 완료되었습니다.
집계는 실패 0개와 `passed: true`를 기록했습니다. 패키지와 비교 서비스는
배포하지 않았습니다.

## 2026-09-09 — CI 패키지·문서 검사

문서 CI 작업은 `make docs-check`를 실행하기 전에 두 PHP 패키지의 의존성을
모두 설치합니다. 패키지·브라우저 작업은 JavaScript 패키지 다섯 개를 격리한
소비자에 패키징하고 공개 export·선언·스타일, 반복 빌드 출력을 검사하며 폼
검사기 단위 검사와 Chromium CSS 검사를 실행합니다.

패키지 소비자·공개 빌드·재현 빌드·폼 검사기 검사는 로컬에서 통과했습니다.
세 프레임워크 브라우저를 통한 native PHP 출력 검증은 별도의 비교 환경
검증으로 남아 있으며 이 CI 변경으로 확인하지 않았습니다. 원격 CI 실행이나
배포는 수행하지 않았습니다.

## 2026-09-09 — 현재·보존 비교 문서

기능 상태는 구현된 네이티브 패키지와 pending인 네 서버 통합을 구분합니다. 검증
절차는 라이브러리 경로와 커밋을 명시적으로 받고, 현재 PHP·PHP 확장·Go·Rust 대상과
보존 비교 모드를 구분하며, 네이티브 모듈 두 개·생성 검사·SSR 경로를 설명합니다.
서버가 컴파일한 직렬화 템플릿을 사용하는 브라우저 연결은 구현됐고, 집중 단위 검사
7개, Go 서버 패키지 전체, Rust 서버 검사 4개와 React·Vue·Svelte 프레임 production
build 12개가 로컬에서 통과했습니다. 후보 이미지의 네 서버 전체 HTTP·브라우저·저장
검증은 계속 pending이며 배포하지 않았습니다. 실행 중인 보존 이미지는 교체하지
않았습니다.

## 2026-09-09 — OrderedJSON 구현 하위 모듈

처리기 검사기는 고정한 OrderedJSON 공통 저장소와 구현 하위 모듈 다섯 개를
사용합니다. 현재 registry API, PHP 네임스페이스와 확장 이름을 사용하며,
소스 변경·잘못된 출력·불완전한 결과를 거부합니다. 보고서는 소스·고정 사례·
모듈 해시를 기록합니다.

공식 처리기 검사 575개와 CRUDUI 검사 50개가 모두 통과했습니다.
검사기 단위 테스트 5개가 통과했고 잘못된 소스 입력 2개를 거부했습니다.
이 결과는 JSON 처리 검증이며 브라우저나 저장 통합 검증은 아닙니다.

## 2026-09-09 — 네이티브 폼 생성기와 공통 PHP API

PHP·Go·Rust는 폼 컴파일, 데이터 바인딩, 편집 인스턴스, 폼·목록 HTML,
CLI 어댑터와 HTTP 예제를 제공합니다. CRUDUI PHP 확장은 PHP 패키지와
동일한 Generator·Form·Validator 클래스를 등록합니다. C 바인딩은 PHP 값을
정적으로 연결한 Rust 엔진 값으로 직접 변환합니다. 각 구현은 순서가 있는
값 변환, UTC 날짜 렌더링, CSS 선언 처리와 위젯 컨트롤 계약을 공유합니다.

공통 검사는 구현 다섯 개에서 각각 153개와 입력 해시 검사 1개를 통과하여
총 766개 통과, 실패 0개입니다. PHP API는 세 프로세스 구성에서 각각
352개, PHP·네이티브 검증은 각각 94개를 통과했습니다. 폼 패키지 검사,
패키지 소비자 검사와 문서 검사가 통과했습니다. Linux 이미지는 일반 사용자를

현재 소스 스냅샷으로 새로 만든 일반 사용자 Linux arm64 이미지에서 전체
`make test-native` 명령이 통과했습니다. 확장을 다시 빌드하고 로드한 뒤
PHP·Go·Rust 패키지 검사, PHP API·검증 검사, 프로토콜 검사 19개, Chromium
위젯·시간대 검사 3개를 실행했고 생성기 보고서도 다시 766/766으로
완료했습니다. 이미지 index digest는
`sha256:0612f157880aa4bd9ff05a64dc6044969d0736117164cafec466e45d53c64c02`,
보고서 SHA-256은
`3f8a91ccbbdaf72c116f2749aa4b6f5cee0975567f6edcbe1372e602cdcf7442`,
실행 로그 SHA-256은
`378f4e3a63a88823b3a15b88859237332c27d36f43ee89bd62f9ad03cd38b0b1`입니다.
이 결과는 네이티브 패키지 검증이며 별도 네 서버 비교 통합 검증은 아닙니다.
패키지 게시와 비교 환경 배포는 실행하지 않았습니다.

## 2026-09-09 — 검증기 CLI 응답

비교 콘솔은 프로세스 종료 상태, JSON 응답 타입, 오류 필드 다섯 개,
유효 여부와 오류의 일관성을 검사합니다. 누락된 필드를 채우거나 잘못된
타입을 변환하지 않고 반환된 값을 유지합니다. 명세 로드 실패는 CLI에
문서화된 응답과 종료 상태가 일치해야 합니다. 프로세스 실패와 잘못된
응답은 비교 실패로 처리합니다.

최초 회귀 사례 8개는 수정 전에 실패했습니다. 응답 검사 35개와 네 언어
CLI 실행을 포함한 콘솔 검사 116개가 모두 통과했습니다.
`make docs-check`가 통과했습니다. 로컬 검사 결과이며 배포는 실행하지 않았습니다.

## 2026-09-09 — 런타임 패키지 계약

런타임 계약은 JavaScript, PHP, Go, Rust, PHP 확장의 폼 생성, SSR, 검증
요구사항을 정의합니다. PHP API 계약은 공통 `CRUDUI\Generator`,
`CRUDUI\Validator`, `CRUDUI\Form` 클래스, Composer 클래스 로딩보다
먼저 실행되는 확장 클래스 등록, 동일한 메서드를 명시합니다.
구현 제안은 패키지, 현재 소스의 지원 범위, 필수 검사를 정리합니다.
기능 상태는 이 요구사항과 구현된 패키지를 구분합니다.

비교 문서는 네이티브 JSON 파싱과 네이티브 CRUDUI 생성·검증을 구분합니다.
`make docs-check`가 통과했습니다.

## 2026-09-09 — 구형 스펙 변환 식별자

내부 변환 변수는 변환된 필드나 스키마 값을 설명합니다.
명명 계약은 파일명·공개 API·내부 식별자에 적용합니다.
validator 패키지 빌드, validator 검사 1,606개와 `make docs-check`가 모두
통과했습니다.

## 2026-09-09 — CLI 의존성 빌드

CLI CI는 테스트 전에 validator 패키지를 빌드합니다. 로컬 실행 절차도 같은
선행 작업을 포함하며 문서 검사는 CLI README와 한국어 번역을 포함합니다.

validator 출력을 제거해 패키지 누락 실패를 재현했습니다. 다시 빌드한 뒤
CLI 검사 37개, 문서의 명령 네 가지와 실패 종료 코드 검사 두 가지가
통과했습니다. `make docs-check`를 통과했습니다.

## 2026-09-09 — 의존성 업데이트 절차

예약된 의존성 업데이트 풀 리퀘스트를 사용하지 않습니다. 의존성 업데이트는
로컬에서 준비하고 관련 패키지 검사와 문서 검사를 포함합니다.
`make docs-check`를 통과했습니다.

## 2026-09-09 — 비교 환경 검증

HTTP 대상 네 가지는 `83181c2`에서 각각 현재 브라우저 시나리오 120개와 현재
상호작용 검사 30개를 통과했으며 페이지 오류는 없었습니다. `dfe70a6` 이미지는
잠금 버전의 PHP 의존성을 설치하며 HTTP 검사 240개와 PHP 처리 모드 검사가
통과했습니다. 외부 Compose 환경은 `containerctl`로 로컬 HTTPS를 제공합니다.
반복한 `up`은 상태·응답 비교 8개를 통과했습니다. 영어·한국어 절차는 환경
수명 주기를 설명합니다.

## 2026-09-09 — 의존성 설치와 생성 파일

PHP CI 작업은 `composer.lock`으로 의존성을 설치합니다. PHP `vendor/` 디렉터리와
컴파일한 Go CLI 실행 파일은 Git에서 제외합니다. 소비자 CI 작업은 필요한 폼
패키지를 모두 빌드하며 구형 비교 작업은 회귀 검사도 실행합니다. CI 주석과
단계 이름은 실제 실행 명령을 설명합니다.

새 Composer 설치는 의존성 26개의 버전·소스 참조를 모두 재현했습니다. PHP 검사
1,418개, 네 언어 구형 비교 사례 1,074개, 공용 검증 콘솔 검사 81개가
통과했습니다. 문서 검사가 통과했습니다.

## 2026-09-09 — 공개 API 설명

공개 폼·목록 API 주석은 현재 동작과 오류 결과를 설명합니다. 런타임 계약은
폼 인스턴스 용어를 사용하며 구형 검증기 예제는 명시적인 legacy 진입점을 import합니다. 사용하지 않는 Vue
타입 import와 존재하지 않는 옵션 타입 참조를 제거했습니다. 수정한 파일 5개의
실행 JavaScript는 동일합니다. 패키지 export·엄격한 소비자 타입·프로덕션 렌더링·
반복 빌드 검사가 통과했습니다.

## 2026-09-09 — 종료일 필드 참조

TypeScript·PHP·Rust는 Go와 같이 `enddate` 필드 참조 매개변수를 유지합니다.
점으로 구분한 시작일 경로를 날짜 비교가 생략되는 불리언 조건으로 변환하지 않습니다.
TypeScript·PHP는 상대 참조에 공통 경로 해석기를 사용합니다.
시작일보다 이전인 종료일 회귀 검사는 수정 전에 실패했습니다. 공통 사례 7개는
절대·형제·상위 참조와 참조 날짜보다 이전·같음·이후인 날짜를 검사합니다. TypeScript 검사 1,606개,
PHP 검사 1,418개와 Go·Rust 패키지 검사가 통과했습니다.

현재 규칙 계약은 `docs/spec/`에서 영어·한국어로 관리합니다. 현재·구형 규칙이
혼재한 문서를 대체하고 등록·매개변수 평가·검증 근거를 구분합니다.

## 2026-09-09 — 구형 비교 정확성

비교 실행기는 명시적인 JavaScript legacy 진입점을 로드하고 선택한 Go·Rust 구형
실행 파일을 다시 빌드합니다. 프로세스 실패·읽을 수 없는 스위트·사례 기대값과
다른 결과를 거부합니다. 소스 로드와 개발자 홈 경로 폴백을 제거했습니다.
실패 회귀 검사 2개는 수정 전에 실패했고 수정 후 통과했습니다. 네 구현 모두
구형 사례 1,074개를 통과했습니다. 기본 테스트 명령에 실행기 회귀 검사를
포함합니다. 영어·한국어 테스트 절차는 현재 적합성과 구형 비교를 구분합니다.

## 2026-09-09 — 테스트 사례 계약

영어·한국어 사례 계약은 현재 검증·조합·표현식·렌더링·구형 사례를 구분합니다.
전체 검증 결과와 로드 실패를 별도로 설명하고 형식 명세에서 오래된 검사 수를
제거했습니다. 현재·구형 TypeScript 적합성 검사 1,124개가 통과했습니다.
문서 검사와 엄격한 사이트 빌드가 통과했습니다.

## 2026-09-09 — CLI 조합 실패와 문서

`check`는 조합 전 입력 검사로 대체하지 않고 해결되지 않은 조합을 오류로
반환합니다. 참조 누락 회귀 검사는 수정 전에 실패했고 수정 후 통과했으며
CLI 검사 37개가 모두 통과했습니다. 영어·한국어 CLI 안내는 등록된 명령 4개를
설명합니다. 패키지 설명에서 미구현 명령을 제거하고 미구현 MCP 제안을 제거했습니다.

## 2026-09-09 — 스키마 문서 통합

현재 스키마와 표현식 계약은 기존 문서를 사용합니다. 별도의 영어·한국어
구형 스키마는 명시적인 legacy 필드 모델을 설명합니다. 중복된 루트 스키마와
조건식 파서 문서를 제거하고 참조를 해당하는 현재 또는 구형 계약으로 변경했습니다.
구형 예제의 정상 입력과 사용자 지정 필수 메시지 검사가 통과했습니다.

## 2026-09-09 — 구형 표시 계약

영어·한국어 구형 표시 계약은 검증기 조건과 렌더러 표시를 구분합니다.
렌더러의 맵 형식 처리를 설명하고 표시와 검증이 독립적인 현재 스키마 설정으로
연결합니다. 중복 표시 안내를 제거했습니다. 선택한 TypeScript 구형
display-switch 검사 84개가 통과했습니다.

## 2026-09-09 — 문서 사이트 탐색

사이트는 영어 탐색 메뉴와 한국어 색인 링크를 제공합니다. 생성 API 탐색에
공통 생성기 core를 포함합니다. 문서 검사·엄격한 사이트 빌드·생성된 탐색 링크의
대상 검사가 통과했습니다.

## 2026-09-09 — 데이터 검증 안내

검증 안내는 `validate` 규칙을 사용하는 현재 JavaScript·PHP·Go·Rust 진입점을
설명합니다. 스키마 로드·입력 실패·표시 여부·전송 처리를 구분합니다. 오래된 API
안내를 제거하고 탐색 링크를 영어 안내와 한국어 번역으로 변경했습니다.
네 코드 예제는 모두 실행에 성공했고 예상한 필수 입력 실패를 확인했습니다.

## 2026-09-09 — Svelte 생성 출력

Git은 Svelte의 임시 `.svelte-kit` 출력을 제외합니다. 생성 파일 117개를
추적 대상에서 제거했습니다. 이전 디렉터리가 없는 상태에서 빌드가 통과했고,
패키지 export·소비자 타입 검사·프로덕션 빌드·React·Vue·Svelte 브라우저 검사도
통과했습니다.

## 2026-09-09 — 공개 API 문서 생성

필수 도구가 실패하거나 출력이 없으면 API 생성이 실패합니다.
TypeScript는 Svelte 컴포넌트 선언을 포함한 공개 패키지 진입점 5개를
검사합니다. Go는 모든 검증기 패키지를 문서화합니다. Rust와 PHP HTML 참조는
정적 사이트에 포함됩니다. 문서 생성 절차에 필수 도구를 명시하고 중복 절차를 제거했습니다.

생성 실패 검사 8개, 문서 검사, Svelte 서버 검사 345개와 마운트 검사 3개가
통과했습니다. 전체 문서를 두 번 생성한 결과는 네이티브 HTML 자산을 포함해
동일했습니다. 엄격한 사이트 빌드가 통과했습니다.

## 2026-09-09 — 문서 링크 검증

사이트 빌드는 내부 링크를 검사합니다. TypeDoc은 상대 링크와 패키지 색인
페이지를 생성합니다. 사이트 밖의 실제 저장소 파일은 GitHub 소스 URL로
연결하며 파일이 없으면 실패합니다. `make docs-check`는 링크 검사 5개를
실행합니다. 엄격한 사이트 빌드, 문서 검사, 생성된 HTML 링크 검사가 통과했습니다.

## 2026-09-09 — 현재 문서 탐색

과거 평가와 구현 비교 보고서는 외부 검증 작업 공간에 보존하고 문서 사이트에서
제거했습니다. 사이트는 현재 표현식 계약으로 연결합니다. 문서 관리 절차는
`make docs-check`가 검사하는 현재 예제 색인을 명시합니다.
문서 검사와 정적 사이트 빌드가 통과했습니다.

## 2026-09-09 — 삼항식 매개변수의 공통 AST 평가

폼 표시와 TypeScript·PHP·Go·Rust 검증 매개변수는 완전한 삼항식 AST를 평가합니다.
선택한 필드 경로, 중첩된 참 분기, 따옴표 문자열의 이스케이프는 별도 문자열
파서로 처리하지 않습니다. 폼 회귀 검사 3개와 검증 회귀 검사 1개는 수정 전에
실패했고 수정 후 통과했습니다. 공통 검증 사례 6개는 경로 값과 중첩 제한값을
검사합니다. 기존 검증 결과와 기대 폼 HTML은 변경하지 않았습니다. 클래스 이름
사례는 문자열 분기에 따옴표를 사용합니다.

표현식 계약은 `docs/spec/`에서 영어와 한국어로 관리합니다. 현재 불리언 변환과
필수 입력 검증을 구분하고 연산자 우선순위·조건맵 기본값을 설명합니다. CLI 설명은
이 계약을 사용합니다. 네 검증기 전체 테스트, 전체 폼 테스트, CLI 검사 36개와
문서 검사가 통과했습니다. 이 결과가 보존한 외부 브라우저 비교를 갱신하지는 않습니다.

## 2026-09-09 — 현재 API와 고정 사례 설명

콘솔 문서는 현재 렌더링 API 이름을 사용합니다. 조합·렌더링 고정 사례 설명은
구현 버전 표기 없이 동작을 설명합니다. 관련 조합 테스트 23개가 모두
통과했으며 고정 사례의 입력과 기대 결과는 변경하지 않았습니다.

## 2026-09-09 — 독립된 과거 구현 비교 작업 공간

과거 구현 비교 애플리케이션, 고정 소스, 빌드 입력, 보고서는 독립된 외부
작업 공간에 보존합니다. 패키지 테스트는 저장소 내부 폼 검사기와 JSON 순서
검사를 사용합니다. 분리 후 JSON 순서 사례 50개와 전체 폼 테스트가
통과했습니다.

## 2026-09-09 — 재사용 폼 검사기

폼 검사기와 Node·브라우저 검사는 `tests/form-inspector/`에서 관리합니다.
프레임워크 초기화 테스트는 해당 모듈을 직접 사용합니다.
경로 변경 후 Node 검사 18개와 브라우저 검사 6개가 모두 통과했습니다.

## 2026-09-09 — 예제 명세 포함과 중첩 데이터

Bootstrap 예제는 정적 빌드에 상품·반복 폼 명세를 포함합니다. 부모가 데이터를
관리하는 페이지는 점으로 구분된 경로를 최상위 키로 설정하지 않고 전체 폼
데이터를 적용합니다. 애플리케이션 빌드와 문의·가입·상품·반복 폼의 브라우저
검사가 통과했으며 상품 중첩 데이터와 잘못된 점 경로 키의 미생성을 확인했습니다.

## 2026-09-09 — 부모가 데이터를 관리하는 레거시 React 갱신

레거시 폼 변경 알림은 React 상태 갱신 함수 밖에서 실행합니다. 연속 필드
변경은 이전 값을 보존하고 변경마다 데이터를 관리하는 부모에게 한 번 알립니다.
회귀 검사는 수정 전에 실패했습니다. 수정 후 React 검사 692개와 패키지
빌드가 통과했습니다.

## 2026-09-09 — 레거시 예제 구조와 빌드

레거시 예제는 `examples/legacy`를 사용합니다. import, 패키지 참조, 빌드 컨텍스트,
테스트와 문서는 이동한 경로를 사용합니다. 컨테이너 빌드는 패키지 명령으로
전체 작업 공간을 설치하고 빌드합니다. PHP 연동 클래스는 개별 PSR-4 파일을
사용합니다. Node 예제 잠금 파일은 현재 패키지 선언을 반영합니다.

로컬 프론트엔드 빌드, Go 테스트, Rust 컴파일, PHP API 검사 5개와 Node HTTP
유효·무효 사례가 통과했습니다. Composer 엄격한 PSR-4 생성과 문서 검사도
통과했습니다. 프론트엔드 예제와 Node·PHP·Go·Rust의 Linux 이미지가 빌드됐습니다.
서버 이미지 네 가지 모두 HTTP 유효·무효 사례가 통과했습니다. PHP Apache
라우팅과 문서 루트도 통과했습니다. 프론트엔드 브라우저 검증은 남아 있습니다.

## 2026-09-09 — 반복 필드 스키마

선언 스키마는 `multiple.min`을 허용하며 숨김 필드 없이 컬렉션 키로 행을
식별하는 구조를 설명합니다. 최소 개수 허용과 숫자가 아닌 최솟값의 거부를
포함한 스키마 고정 사례 56개가 통과했습니다.

## 2026-09-09 — 현재 비교 이미지

비교 이미지는 정상 의존성 설치로 라이브러리 소스 `a5b4491`을 빌드합니다.
이미지는 브라우저 압축 해제 도구를 설치하며 작업 공간 잠금 파일로
네이티브 JavaScript 빌드 의존성을 해석합니다.
로컬 비교 환경은 PHP·PHP 확장·Go·Rust를 실행합니다.
HTTP 검사 240개와 PHP 처리 모드 검사가 모두 통과했습니다.
이 소스와 의존성 그래프의 브라우저 비교는 진행 중입니다.

## 2026-09-09 — 의존성 설치와 패키지 검사

작업 공간 잠금 파일은 선언된 의존성 범위를 해석하며 지원 플랫폼의 네이티브
패키지를 포함합니다. 루트는 공통 테스트 연동을 위해 Vitest를 선언합니다.
npm 설치 스크립트 승인은 검토한 패키지 버전을 명시합니다.
별도 소비자는 같은 스크립트 승인을 사용하여 정상 설치합니다.

새 설치, 공개 패키지 검사 5개, 반복 빌드 비교 1개, 소비자 타입 검사,
프로덕션 컴파일과 세 프레임워크 브라우저 검사가 통과했습니다.
폼 검사는 코어 26개, React 691개, Vue 344개, Svelte 345개와 마운트 검사 3개,
HTML 정규화 검사 6개가 통과했습니다. JavaScript 검증 1,579개가 통과했습니다.
이 결과는 비교 환경의 배포를 확인하는 근거가 아닙니다.

## 2026-09-09 — 필드 오류 설명

지원하지 않는 필드 오류는 필드 타입과 경로를 명시합니다. 현재 검사 이름은
버전 없는 동작 이름을 사용합니다. 코어 검사 26개와 문서 검사가
통과했습니다.

## 2026-09-09 — 독립된 PHP 확장 대상

PHP 확장 실행은 별도 프로세스·저장소·서버 식별자를 사용합니다. 확장 모드는
네이티브 처리기를 필수로 요구하며 PHP 모드는 확장 사용을 금지합니다.
서버·브라우저 검사는 PHP 확장을 네 번째 대상으로 포함합니다.

독립된 컨테이너에서 처리 모드 확인을 포함한 네 대상의 HTTP 검사 240개가
통과했습니다. 두 PHP 코덱 모드와 확장 누락·잘못된 확장 사용의 거부 검사도
통과했습니다. 확장의 전체 브라우저 검증은 남아 있습니다. 기본 비교
컨테이너는 아직 이 이미지로 교체하지 않았습니다.

## 2026-09-09 — 빈 컬렉션 브라우저 검사

브라우저 검사는 필드 래퍼로 포커스된 버튼의 컬렉션을 확인합니다. 현재
렌더러는 래퍼의 name 속성을 사용하지 않습니다. 서버 세 가지·프레임워크
세 가지·전송 형식 두 가지의 현재 빈 컬렉션 검사 18개가 모두 통과했습니다.
PHP 실행에서는 현재 초기화 비교 6개와 현재 런타임 포인터·키보드 동작 검사
30개(비교 모드 전체 108개)가 통과했고 페이지 오류는 없었습니다. 보존된 소스의 HTML 차이는 실패로 유지합니다.

## 2026-09-09 — SSR 비교 인스턴스 공유

교차 검사 콘솔은 세 렌더러에 사용할 폼 인스턴스를 하나 생성합니다.
반복 데이터가 없을 때 생성되는 행 키가 프레임워크 출력 간에 동일합니다.
생성된 키 비교를 포함한 콘솔 검사 81개가 통과했습니다.

## 2026-09-09 — 비교 서버 진입점

현재 PHP·Go·Rust 서버는 버전 없는 검증 진입점을 사용합니다. 보존된
Go·Rust 서버는 고정된 서버 소스 아카이브에서 빌드합니다. 비교 컨테이너는
라이브러리 소스 `30ff267`을 사용합니다. HTTP 저장 검사 180개가 모두
통과했습니다. 브라우저 동작 검증은 진행 중입니다. 패키지는 게시하지 않았습니다.

## 2026-09-09 — 비교 브라우저 진입점

비교 브라우저 빌드는 현재 소스와 보존된 소스의 진입점을 명시적으로 선택합니다.
현재 컬렉션 검사는 필드 경로를 사용합니다. 빌드에는 작업 공간의 절대 경로를
명시해야 합니다. 브라우저 번들 12개가 모두 빌드되었습니다.
서버 통합과 저장·재로드 검증은 남아 있으며 실행 중인 비교 환경은 교체하지 않았습니다.

## 2026-09-09 — 공개 타입 선언 빌드

TypeScript 패키지 빌드는 번들러로 JavaScript를 생성하고 TypeScript 컴파일러로
타입 선언을 생성합니다. 공개 진입점에는 선언된 legacy export를 포함합니다.
선언 컴파일은 `noEmitOnError`를 적용하며 폐기 예정 옵션의 경고를 억제하지
않습니다. 감시 명령은 JavaScript 빌드가 성공하면 선언을 다시 생성합니다.

검증: 새 설치와 전체 빌드가 통과했습니다. 엄격한 ESM·CommonJS 타입 소비,
스타일시트 생성, 잘못된 공개 선언의 생성 차단을 포함한 공개 패키지 검사
5개가 통과했습니다. 전체 빌드 두 번의 파일 경로와 SHA-256이 일치했습니다.
별도 패키지 소비자의 타입 검사·프로덕션 빌드·세 프레임워크 브라우저 검사도
통과했습니다. 이번 빌드 변경에서 런타임 소스 파일은 변경하지 않았습니다.
패키지는 게시하지 않았습니다.

## 2026-09-08 — 폼 인스턴스와 입력 요소

폼 API는 `compileForm`으로 템플릿을 준비하고 `createForm`으로 편집 인스턴스를
생성합니다. `Form` 컴포넌트로 표시하며 `renderForm`도 인스턴스를 받습니다.
목록 렌더러는 같은 `layout` 옵션을 사용합니다. 기본 입력은 폼별로 구분되는
고정 라벨 식별자를 사용하고 복수 선택 입력은 배열을 전송합니다.
필드 컨테이너는 전송 이름 대신 `data-field-path`를 사용합니다.
Svelte 패키지에는 생성한 컴포넌트 타입 선언을 포함합니다. 패키지 의존성은
`0.0.1` 버전을 사용합니다. 필수 엔진의 실패·누락·중복 결과는 검증 비교 실패로
처리합니다.

검증: 폼 검사 1,409개, JavaScript 검증기 검사 1,579개, PHP 검사 1,392개,
Go·Rust 검사, 콘솔 검사 42개, 검사기 검사 18개, Svelte 타입 검사,
패키지 소비자 컴파일·빌드, 문서 검사가 통과했습니다.
실행 중인 비교 컨테이너에는 이 소스를 반영하지 않았습니다.

## 2026-09-08 — 레코드 복원 HTML

공통 DOM 바인딩은 기존 `checked` 속성을 입력의 다른 속성 다음에 배치합니다.
최초 렌더링과 레코드 복원은 입력 요소를 교체하지 않고 같은 속성 순서를 사용합니다.
공유 회귀 검사는 복원한 HTML 전체를 비교하고 체크박스 요소가 유지되는지 확인합니다.

검증: 강화한 회귀 검사는 수정 전 React와 Vue에서 실패했습니다.
수정 후 생성기 빌드, 생성기 테스트 1,405개와 검사기 테스트 18개가 모두 통과했습니다.
소스 `f4ec125`는 서버·프레임워크·전송 방식 18개 조합에서 현재 런타임 시나리오
360개를 모두 통과했습니다. 초기화·반복 주입·복원의 항목별 비교 3,024개가 모두
통과했으며 HTML 원문 비교 378개를 포함합니다. 이전 복원 차이 24개를 해결했습니다.

실제 상호작용 324개, 로드 전 마운트 36개, 정적 문서 36개, HTTP 검사 180개,
타이핑 36개와 Chrome CSS 검출 검사 6개가 모두 통과했습니다. Rust를 사용하는
한국어 React와 영어 Vue 검사로 검사 버튼, 실행별 168개 항목 전체와 JSON·HTML
원문 다운로드를 확인했습니다. 브라우저 페이지 오류는 없었습니다. 전체 비교는
시나리오 1,290개 통과와 150개 실패를 기록했으며 남은 실패는 모두 보존한 소스의
실패로 이전 결과와 일치합니다.

중간 실행에서는 진행 확인용 연결이 브라우저 화면 크기를 변경한 후 CSS 실패가
추가됐습니다. 확인용 자동화를 제거하고 화면 크기 변경을 별도로 재현했으며,
추가 연결 없이 1680 × 1100에서 전체 검사를 다시 실행했습니다. 두 실행과 이전
보고서를 모두 보존했습니다. 내보낸 HTML 스냅샷 2,160개는 기록된 문자열과
일치합니다. 배포: 로컬 컨테이너는 `f4ec125`를 사용하며 예제 파일 52개, DOM
바인딩 소스와 제공하는 메타데이터가 검증한 소스와 일치합니다. 패키지는 게시하지
않았습니다.

## 2026-09-08 — 폼 초기화 검사기

파싱한 브라우저 DOM, HTML 원문, 현재·기본 컨트롤, 순서를 유지한 필드, 계산된
CSS, 포커스와 저장 레코드로 초기 데이터 생성과 마운트 후 주입을 비교합니다.
검사기는 항목별 실패를 유지하며 반복 주입, 레코드 교체와 같은 행 동작을 계속
검사합니다. 예제에 별도 검사 버튼과 HTML·비교 자료 다운로드를 추가했습니다.
정적 HTML 응답과 데이터 로드 전 마운트를 독립적으로 검사합니다. React는
평가된 인라인 스타일을 제거할 때 빈 style 속성도 제거합니다.

검증: 생성기 빌드, 생성기 테스트 1,405개, 검사기 테스트 18개, Chrome CSS 검출
검사 6개가 통과했습니다. 15:35 UTC에 세 API 서버가 보고서 72개와 시나리오
결과 1,440개를 완료했으며 1,278개 통과와 162개 실패를 기록했습니다.
현재 런타임의 초기 데이터 생성·마운트 후 주입 비교는 18개 조합의 15단계에서
모두 통과했습니다. 반복 주입은 HTML 원문까지 통과했습니다. 레코드 복원에서는
React·Vue의 HTML 원문 속성 순서 차이 24개를 유지했으며 현재 DOM, CSS,
컨트롤, 데이터, 포커스와 저장 비교는 모두 통과했습니다. 과거 렌더러의 차이도
기록합니다. 서버별 실행기는 종료 코드 1을 반환했습니다.

상호작용 324개, 로드 전 마운트 36개, 정적 HTML 36개, HTTP 180개,
타이핑 36개와 두 언어의 UI 선택 54개가 모두 통과했습니다. 브라우저 페이지
오류는 없었습니다. 단계별 스냅샷 2,160개를 내보내고 중단한 보고서 42개를
보존했습니다. 브라우저 프로토콜 호출은 API 서버 하나씩 실행합니다. 들여쓴 DOM
기록이 런타임 문자열 제한을 초과하므로 전체 보고서 JSON에서 들여쓰기를 제거했으며
스냅샷 내용은 유지합니다. 배포 대상은 `localhost:4317`의 로컬 Apple container이며
패키지 게시와 원격 배포는 실행하지 않았습니다.

## 2026-09-07 — 빈 컬렉션 수정 병합

빈 컬렉션 수정을 `main`에 병합하고 안정적인 행 키와 포커스 처리를 유지했습니다.
React, Vue, Svelte의 빈 컬렉션 추가 버튼에 접근성 레이블을 적용했습니다.
회귀 검사 6개는 명시적인 빈 값, 데이터 누락, 표시 여부, 중첩 행 순서를
검증하며 현재 루트 그룹 계약을 사용합니다.

고정한 수정 원본 커밋을 `main` 이력에 포함하므로 전체 복제에서 비교 예제를
준비할 때 별도 브랜치가 필요하지 않습니다.

검증: 생성기 빌드와 테스트 1,402개(코어 25개, React 689개, Vue 342개,
Svelte 345개, Svelte 클라이언트 1개)가 통과했습니다. 회귀 검사는
`compileForm`과 `bindForm`을 사용합니다. 배포: 패키지를 게시하지 않았으며
로컬 비교 예제는 기존 고정 소스를 계속 사용합니다.

## 2026-09-07 — PHP·Go·Rust 폼 영속 저장

PHP와 함께 네이티브 폼·JSON 제출, 기존 CRUDUI 검증, 원자적 JSON 저장, 계층 재로드를
수행하는 독립된 Go·Rust 서버를 추가했습니다. 서버와 소스 리비전마다 독립된
저장소를 사용합니다. Go·Rust 실행 파일은 표시한 검증기 리비전으로 빌드합니다.
Node는 브라우저 파일을 제공하고 요청 바이트를 전달합니다. 공용 초기 자료는
동일한 저장 레코드를 정의합니다.

화면에서 서버를 선택하며 언어를 변경해도 서버 선택을 유지합니다. 폼 필드 값은
문자열 계약을 따르고 다국어 제목은 명세의 `ko`, `en` 필드를 받습니다. 잘못된 구조,
초기화 요청, 제한을 초과한 요청, 필수 값 검증 실패는 레코드를 변경하지 않고 거부합니다.

13:47 UTC 브라우저 보고서는 보고서 72개와 시나리오 결과 1,368개를 포함합니다.
PHP·Go·Rust 모두 수정 원본과 현재 런타임이 React·Vue·Svelte의 폼·JSON 전송에서
각각 19/19를 통과했습니다. 상호작용 검사 324개와 로드 전 마운트 검사 36개도
모두 통과했고 브라우저 페이지 오류는 없었습니다. 수정 전 원본 키 진단은 17/19,
배열 진단은 15/19를 유지하며 전체 실행기는 유지한 진단 실패 108개로 종료 코드 1을
반환했습니다. 공유 HTTP 검사 180개, 타이핑 검사 36개, 두 언어의 UI 선택 54개,
JavaScript·PHP 변환 검사, PHP 저장소 검사, Go 정적 검사, Rust Clippy와
`make docs-check`가 통과했습니다. 이전 실패 보고서는 보존했습니다.

배포: PHP 8.4.24, Go 1.27.0, Rust 1.98.0, Node 26.8.1을 사용하는
`localhost:4317`의 로컬 Apple container. 패키지 게시와 원격 배포는 수행하지 않았습니다.

## 2026-09-07 — 원본 컨트롤러 타이핑

원본 예제 컨트롤러가 이전 렌더링 값으로 새 입력을 덮어쓰고, 프레임워크의 input
교체 시 일시적으로 포커스를 잃는 문제가 있었습니다. 새 입력으로 대체된 입력
렌더링을 취소하고 React·Vue·Svelte의 DOM 갱신 직후 값과 포커스를 복원하도록
수정했습니다. 고정된 두 프레임 지연을 제거했습니다.

13:41 UTC 검증: 네 비교 예제와 세 프레임워크에서 문자당 0/10/50 ms 간격의
실제 키보드 검사 36개가 모두 통과했습니다. 즉시 값, 렌더링 후 값, 포커스와 커서
검사가 통과했고 브라우저 페이지 오류는 없었습니다. 라이브러리 소스 스냅샷은
변경하지 않았습니다. 배포는 `localhost:4317`의 로컬 Apple container이며 패키지
게시와 원격 배포는 수행하지 않았습니다.

## 2026-09-07 — 폼 비교 명칭과 소스 참조

경로, 소스, 문서, 컨테이너 명령과 Git 이력에 CRUDUI 예제 명칭을 일관되게
적용했습니다. 커밋 재작성 후 과거 소스 참조도 갱신했습니다. 커밋 166개와 Git 객체
5,854개의 명칭 검사가 통과했습니다. 비교용 라이브러리와 테스트 파일의 내용은
동일합니다. 이전 데이터, 보고서와 소스 아카이브는 작업 디렉터리 밖에 보존했습니다.

12:21 UTC 검증: 수정한 원본과 현재 런타임이 React·Vue·Svelte의 폼·JSON 전송에서
각각 19/19를 통과했습니다. 실제 상호작용 검사 108개, 로드 전 마운트 검사 12개,
JavaScript·PHP 변환 검사, 두 저장소 검사와 `make docs-check`가 통과했습니다.
브라우저 페이지 오류는 없었습니다. 수정 전 원본 키 진단은 17/19, 배열 진단은
15/19이며 전체 실행기는 해당 실패를 기록하고 종료 코드 1을 반환합니다.
배포: `localhost:4317`의 로컬 Apple container. 패키지 게시와 원격 배포는 수행하지
않았습니다.

## 2026-09-07 — 폼과 순서 유지 JSON 전송

각 폼에서 네이티브 multipart 또는 JSON 전송을 선택합니다. 두 형식은 같은 기존
JavaScript·PHP 검증과 저장소 저장을 실행합니다. JSON 경로는 요청·응답과 저장
파일에 ordered-json `deb1b354`를 사용합니다. 별도의 전송 모듈이 처리기의 값을
폼 데이터로 변환하며 13자리 키, 문서 순서, 빈 컬렉션 자료형을 유지합니다.
컨테이너 빌드는 고정한 소스를 포함하고 아카이브 해시를 표시합니다.

두 전송 방식의 전체 처리 과정, 같은 데이터의 저장 비교, 잘못된 JSON 거부
검사를 추가했습니다. 실제 브라우저 요청에서 선택한 Content-Type과 JSON 형태를
확인합니다. 잘못된 브라우저 값은 두 방식 모두 전송을 중단하며 잘못된 직접 요청은
저장 레코드를 유지합니다. 필수·선택 항목과 표시 규칙은 계속 기존 검증기를 사용합니다.

11:35 UTC 검증: 수정한 원본과 현재 런타임이 React·Vue·Svelte의 두 전송 방식에서
각각 19/19를 통과했습니다. 실제 상호작용 검사 108개, 로드 전 마운트 검사 12개,
JavaScript·PHP 변환 검사, 두 저장소 검사가 모두 통과했습니다. JavaScript, PHP,
Go, Rust 검증 적합성과 `make docs-check`도 통과했습니다. 브라우저 페이지 오류는
없었습니다. 수정 전 원본 키 진단은 두 방식 모두 17/19, 배열 진단은 15/19이며
기존 실패를 그대로 기록하므로 전체 실행기는 종료 코드 1을 반환합니다.
배포: `localhost:4317`의 로컬 Apple container. 패키지 게시와 원격 배포는 수행하지
않았습니다. 비교 소스와 이전 보고서는 계속 제공합니다.

## 2026-09-07 — JSON 처리기 계약 검증

ordered-json `deb1b354`의 문서 멤버 순서, 중첩된 13자리 행 데이터, 빈 컬렉션
자료형을 재현 가능한 검사로 추가했습니다. 다섯 구현에서 전송 고정 데이터 10개와
처리기의 공용 사례 115개가 모두 통과했습니다. 고정 데이터는 JSON 표현을 검사하며,
브라우저 동작과 런타임 JSON 연동은 변경하지 않았습니다. 로컬 비교 환경은 계속
제공합니다.

## 2026-09-07 — 빈 컬렉션 수정과 브라우저 검증

- 수정한 원본 소스 `78723bb`와 현재 런타임 `b516226`을 주 비교로 추가했습니다.
  수정 전 원본 키 예제와 배열 진단은 실제 실패 결과와 함께 계속 선택할 수 있습니다.
- 사용자 제출 전에 기존 JavaScript 검증기를 연결했습니다. 잘못된 값은 전송을
  중단하고 필드 오류를 표시하며 재로드는 이전 오류를 제거합니다. PHP는 같은
  규칙을 독립적으로 검증합니다. 검증 규칙은 변경하지 않았습니다.
- 선택 항목인 빈 부서명 저장, 숨겨진 필수 필드 실패, 빈 컬렉션 표시, 중첩 및
  전체 삭제, 재추가, 네이티브/JSON 저장, 형제 행 ID와 부모 관계를 검증했습니다.
- 실제 타이핑, 잘못된/올바른 요청 수, 빈 컬렉션의 키보드 포커스 검사를 추가했습니다.
  포커스 간섭을 방지하기 위해 프레임 사례를 순차 실행합니다. 실행기는 새 결과를
  작성하기 전에 이전 보고서와 스크린샷을 보존합니다.

10:15 UTC 검증: 두 주 비교 구현은 React, Vue, Svelte에서 각각 17/17을 통과했습니다.
상호작용 54개, 데이터 로드 전 마운트 12개, 두 PHP 저장소 검사가 모두 통과했고
브라우저 페이지 오류는 없었습니다. 수정 전 원본 키 진단은 15/17, 배열 진단은
13/17을 유지하므로 전체 실행기는 종료 코드 1을 반환합니다. 기존 공용 검증 사례는
TypeScript, PHP, Go, Rust에서 통과했습니다. `make docs-check`도 통과했습니다.
배포: `localhost:4317`의 로컬 Apple container이며 패키지는 게시하지 않았습니다.
비교 소스와 이전 보고서는 검토를 위해 유지합니다.

## 2026-09-07 — 실제 타이핑 중 포커스

값이 변경되지 않은 input/change 이벤트는 포커스를 저장하기 전에 제외합니다.
Vue와 Svelte에서 input 교체 중 발생한 change 이벤트가 복원할 포커스 정보를
초기화하여 첫 글자 뒤에 입력을 계속할 수 없었습니다.

검증: 전체 Chrome 검사에서 React, Vue, Svelte의 전체 입력값과 입력 포커스를
유지했습니다. 공통 마운트 DOM 검사와 코어 타입 검사도 통과했습니다.
배포: 로컬 비교 환경이며 패키지는 게시하지 않았습니다.

## 2026-09-07 — 빈 컬렉션에 추가한 후 포커스

브라우저 바인딩은 빈 컬렉션의 추가 버튼을 해당 wrapper로 식별합니다. 첫 행 생성으로
버튼이 교체되면 같은 컬렉션의 추가 버튼으로 `preventScroll`을 사용해 포커스를 복원합니다.

검증: 공통 마운트 DOM 사례와 실제 Chrome의 빈 컬렉션 키보드 검사가 React,
Vue, Svelte에서 통과했고 코어 타입 검사도 통과했습니다.
배포: 로컬 비교 환경이며 패키지는 게시하지 않았습니다.

## 2026-09-07 — 행 연산의 포커스 유지

포인터로 행 버튼을 실행할 때 입력 포커스를 유지합니다. DOM 동기화는 `preventScroll`로
텍스트 선택과 상위 요소의 스크롤 위치를 복원합니다. 키보드 실행은 기존 버튼의 포커스를
유지합니다. 생성기 빌드와 React, Vue, Svelte의 마운트 DOM 검사가 통과했습니다.
세 프레임워크의 실제 브라우저 포인터와 키보드 검사가 통과했습니다.
배포: 로컬 폼 비교 예제에서 실행 중이며 패키지는 게시하지 않았습니다.

## 2026-09-07 — 브라우저 비교와 PHP 영속 저장

- 정확한 원본과 현재 Git 소스를 사용하는 React, Vue, Svelte, PHP의
  Apple container 환경을 `localhost:4317`에 추가했습니다.
- 동일한 13자리 키 데이터의 기본 비교를 추가했습니다. 원본 공개 함수에는 예제 행
  컨트롤러와 캐시 바인딩을 연결하며 현재 런타임은 라이브러리 세션을 사용합니다.
  원본 라이브러리 소스는 수정하지 않았습니다.
- 원본 공개 함수 `composeProperties`의 캐시 준비, 직렬화한 구조 복원, `buildField`
  바인딩을 추가했습니다. 두 키 어댑터는 합성 참조를 한 번 읽으며 준비 후 추가
  로드를 거부합니다.
- 네이티브 PHP 파싱, 버전별 검증, 원자적 JSON 영속 저장, 부모 관계, 경로별 저장 키
  적용, 삭제, 독립적인 재로드를 추가했습니다. 잘못되거나 잘린 요청은 저장 레코드를
  변경하지 않습니다.
- ID 순서 `[5, 7, 1]`, ID 8로 삽입, ID 9로 하위 구조 복사를 추가했습니다.
  키 JSON은 별도 순서나 식별자 필드 없이 문서 멤버 순서를 사용합니다.
  문서 순서를 편집하면 저장 순서와 화면 순서가 변경됩니다.
- 전체 하위 행이 있는 연산 픽스처와 명시적인 빈 컬렉션 검사를 분리했습니다.
  비교 예제는 생성된 행을 제거하지 않고 빈 컬렉션 출력 실패를 유지합니다.
- 최초 PHP 데이터 요청 전에 각 폼을 마운트합니다. 브라우저 요청 검사는 요청을
  계속하기 전에 중첩 input이 있는지 확인합니다.
- 이전 숨김 필드 배열 진단을 선택 가능한 예제로 유지합니다. 해당 숨김 필드와
  캐시 바인딩 미구현은 예제 구성의 선택입니다.
- 포인터, 키보드, 체크박스 검사, 수동 제어, 데이터 확인, 결과 다운로드, 오류 원문,
  내용이 일치하는 영어·한국어 문서를 추가했습니다. 실패 설명은 예제 구성과 원본
  렌더러 동작을 구분합니다.
- 브라우저 실행기는 검사 실패, 결과 누락, 브라우저 오류가 있으면 종료 코드 1을
  반환합니다. 기록된 진단 실패는 실패로 유지합니다.

검증: 각 프레임워크에서 현재 런타임은 17/17개, 원본 키 바인딩은 15/17개,
유지한 배열 진단은 13/17개 시나리오를 통과했습니다. 원본 키 실패 두 항목은 모두
명시적인 빈 컬렉션 출력에 관한 것입니다. 두 키 예제의 캐시 바인딩은 통과했습니다.
상호작용 검사 27개, 로드 전 마운트 검사 아홉 개, 두 버전의 PHP 저장소 검사가
모두 통과했습니다. 브라우저 페이지 오류는 없었으며 비교 실행기는 기록된 실패로
종료 코드 1을 반환했습니다.
[기능 상태](docs/features.ko.md)에 현재 코드의 결과를 기록합니다.
배포: 로컬 Apple container이며 패키지 게시와 원격 배포는 수행하지 않았습니다.
비교 자료와 이전 결과는 검토할 수 있도록 유지합니다.

## 2026-09-07 — 컴파일된 폼과 13자리 행 키

- 변경 불가능한 JSON 캐시용 폼 템플릿과 별도 데이터 바인딩을 추가했습니다.
- 지연 데이터 주입과 경로별 중첩 행 추가, 복사, 제거, 정렬, 저장된 seq 키 변경을
  지원하는 편집 세션을 추가했습니다. 신규 행 키는 13자리 16진수이며 저장된 seq 키는
  13자리로 채운 10진수입니다.
- React, Vue, Svelte의 기본 입력과 행 버튼을 연결했습니다. 체크박스 데이터 표시,
  명시적 빈 값의 기본값 처리, 날짜 형식 동기화, React FormBuilder의 데이터 속성 교체를
  수정했습니다.
- 4개 언어에서 키가 있는 스칼라와 그룹 컬렉션 검증을 확장하고 오류 경로, 중복,
  최소 개수에 대한 공유 사례 5개를 추가했습니다.
- 합성과 바인딩을 함께 처리하던 `buildForm`과 불필요한 렌더링 별칭을 제거했습니다.
  SSR 소스 함수는 컴파일된 템플릿을 입력받습니다.
- 폼 계약과 사용 문서를 영어와 한국어로 갱신했습니다. 링크, 번역, 상태 검사를 추가하고
  기존 API 문서 검사에 generator-core를 포함했습니다. 현재 계약을 `docs/spec/`로
  정리한 후 오래된 폼 키와 스키마 문서를 제거했습니다.
- 개발자 체크아웃 경로를 저장소 상대 경로나 필수 외부 입력 경로로 변경했습니다.
  픽스처 재생성이 기존 사례를 갱신하도록 수정했습니다.

검증: 코어 19개, React 689개, Vue 342개, Svelte SSR/단위 345개와 마운트한 DOM 1개,
TypeScript 검증기 1,579개, PHP 적합성 61개, Go와 Rust 공유 검증이 통과했습니다.
이 실행에는 CRUDUI 공유 검증 사례 43개가 포함됩니다. 콘솔 SSR 32개, CLI 35개, 린트, 타입 검사, `make docs-check`가 통과했습니다.
API 생성, 스키마 생성, 문서 사이트 빌드가 통과했습니다. 배포: 미배포.

## 2026-09-07 — 스키마 생성

스키마 생성기에 포함된 TypeScript 컴파일러가 거부하는 불필요한
`ignoreDeprecations: "6.0"` 설정을 제거했습니다. TypeScript 타입 검사, 예제 3개를
검사하는 스키마 생성, 문서 사이트 빌드가 통과했습니다. 배포: 미배포.
