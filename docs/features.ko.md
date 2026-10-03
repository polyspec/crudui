# 기능 상태

[English](features.md). 계약은 [명세](spec/form-runtime.ko.md)에 정의합니다.
테스트와 배포를 별도로 기록합니다. `pending`은 통과 결과가 아닙니다.

| ID | 기능 | 구현 | 검증 | 배포 | 근거 |
| --- | --- | --- | --- | --- | --- |
| control-attributes | 필드 컨트롤과 노드에 선언한 `attributes`를 여덟 렌더러가 속성으로 쓰며, 이름은 `data-*`와 `aria-*`로 제한한다 | in-progress | pending | not-deployed | [명세](spec/schema.ko.md#선언한-속성), [폼 마크업](spec/form-markup.ko.md#선언한-속성); `@crudui/generator-core`([모델과 검사 사례](../packages/generator-core/src/declared-attributes.test.ts)), `@crudui/generator-html`([바이트 사례](../packages/generator-html/src/declared-attributes.test.ts)), JSON Schema에 구현됨; React, Vue, Svelte는 체크박스와 [스위치](spec/form-markup.ko.md#스위치) input에만 씀; 다른 컨트롤과 노드의 React, Vue, Svelte, 그리고 PHP, PHP 확장, Go, Rust가 남아 있으며 공유 폼 사례는 모든 렌더러를 구현할 때 추가 |
| switch-control | `switcher` 필드를 여덟 렌더러가 체크 상자와 다른 스위치(`role="switch"`)로 렌더링한다 | in-progress | pending | not-deployed | [폼 마크업](spec/form-markup.ko.md#스위치); `@crudui/generator-core`([모델 사례](../packages/generator-core/src/switch-control.test.ts)), `@crudui/generator-html`([바이트 사례](../packages/generator-html/src/switch-control.test.ts)), React([바이트 사례](../packages/generator-react/src/__tests__/switch-control.test.ts)), Vue([사례](../packages/generator-vue/test/switch-control.test.mjs)), Svelte([사례](../packages/generator-svelte/test/switch-control.test.mjs)), 스타일시트([브라우저 검사](../tests/form-styles.test.mjs))에 구현됨; 공유 폼 사례 `switcher-bare`가 스위치를 기대하며 PHP, PHP 확장, Go, Rust는 구현될 때까지 이 사례에 실패함 |
| range-control | `range` 필드를 여덟 렌더러가 범위, 단계, 현재 값을 가진 슬라이더로 렌더링하고 검증기 다섯 개가 검증한다 | in-progress | pending | not-deployed | [명세](spec/schema.ko.md#범위-필드), [폼 마크업](spec/form-markup.ko.md#범위-필드); `@crudui/generator-core`([모델과 검사 사례](../packages/generator-core/src/range-control.test.ts)), `@crudui/generator-html`([바이트 사례](../packages/generator-html/src/range-control.test.ts)), 스타일시트, JSON Schema에 구현됨; 기존 `range`와 `step` 규칙이 값을 검증함([TypeScript 사례](../packages/validator-ts/src/range-field.test.ts)); React, Vue, Svelte, PHP, PHP 확장, Go, Rust 렌더러가 남아 있으며 공유 폼 사례는 모든 렌더러를 구현할 때 추가 |
| button-control | `button` 필드를 여덟 렌더러가 내용과 속성을 가진 `button` 요소로, 스크립트 없이 렌더링한다 | in-progress | pending | not-deployed | [폼 마크업](spec/form-markup.ko.md#버튼-필드); `@crudui/generator-core`([모델 사례](../packages/generator-core/src/button-control.test.ts)), `@crudui/generator-html`([바이트 사례](../packages/generator-html/src/button-control.test.ts)), React([바이트 사례](../packages/generator-react/src/__tests__/button-control.test.ts), [스크립트 검사](../tests/widget-scripts.test.mjs)), Vue([사례](../packages/generator-vue/test/button-control.test.mjs)), Svelte([사례](../packages/generator-svelte/test/button-control.test.mjs)), 스타일시트([브라우저 배치 검사](../tests/form-styles.test.mjs))에 구현됨; 공유 폼 사례 `button-empty`, `action-alias`, `button-behavior-onclick`이 button 요소를 기대하며, 아직 스크립트, 숨은 input, input 버튼과 위젯 멤버 `buttonText`를 쓰는 PHP, PHP 확장, Go, Rust는 구현될 때까지 이 사례에 실패함 |
| choice-appearance | 선택 필드의 선택지마다 class와 style을 여덟 렌더러가 적용하여, 선택 필드를 견본 격자로 렌더링할 수 있다 | in-progress | pending | not-deployed | [명세](spec/schema.ko.md#선택지-외형), [폼 마크업](spec/form-markup.ko.md#선택지-외형); `@crudui/generator-core`([모델과 검사 사례](../packages/generator-core/src/choice-appearance.test.ts)), `@crudui/generator-html`([바이트 사례](../packages/generator-html/src/choice-appearance.test.ts)), JSON Schema에 구현됨; React, Vue, Svelte, PHP, PHP 확장, Go, Rust가 남아 있으며 공유 폼 사례는 모든 렌더러를 구현할 때 추가 |
| inline-layout | 각 필드의 레이블과 컨트롤을 한 줄에 두는 폼 배치를 여덟 렌더러가 제공한다 | in-progress | pending | not-deployed | [명세](spec/schema.ko.md#배치), [폼 마크업](spec/form-markup.ko.md#배치); `@crudui/generator-core`([모델과 검사 사례](../packages/generator-core/src/inline-layout.test.ts)), `@crudui/generator-html`([바이트 사례](../packages/generator-html/src/inline-layout.test.ts)), 스타일시트([브라우저 배치 검사](../tests/form-styles.test.mjs)), JSON Schema에 구현됨; inline 배치의 헤더에 쓰는 체크박스와 스위처 필드의 레이블은 노드 모델과 React([서버와 컴포넌트 사례](../packages/generator-react/src/__tests__/inline-layout.test.tsx)), Vue([사례](../packages/generator-vue/test/inline-layout.test.mjs)), Svelte([사례](../packages/generator-svelte/test/inline-layout.test.mjs))에 구현됨; PHP, PHP 확장, Go, Rust는 이 레이블을 포함해 남아 있으며 공유 폼 사례는 모든 렌더러를 구현할 때 추가 |
| collection-controls | 행 컨트롤의 선언된 글과 속성, 마지막 행 뒤의 추가 컨트롤을 여덟 렌더러가 렌더링한다 | not-started | pending | not-deployed | [폼 마크업](spec/form-markup.ko.md#행) |
| validator-responses | 검증기 프로세스 상태와 완전한 응답 검사 | implemented | passed | not-deployed | [응답 검사](../examples/cross-check-console/server/validate-response.test.mjs), [검증기 프로세스 사례](../examples/cross-check-console/validators/README.ko.md) |
| php-api | 동일한 메서드를 제공하는 PHP와 확장의 공통 클래스 | implemented | passed | not-deployed | [PHP API 계약](spec/php-extension.ko.md) |
| generator-php | PHP 폼 생성과 SSR | implemented | passed | not-deployed | [런타임 계약](spec/runtime-packages.ko.md) |
| generator-go | Go 폼 생성과 SSR | implemented | passed | not-deployed | [런타임 계약](spec/runtime-packages.ko.md) |
| generator-rust | Rust 폼 생성과 SSR | implemented | passed | not-deployed | [런타임 계약](spec/runtime-packages.ko.md) |
| generator-html | 프레임워크 독립 폼·목록 HTML 렌더링 | implemented | passed | not-deployed | [기능 계약](spec/feature-contracts.ko.md) |
| php-extension | PHP 네이티브 폼 생성과 검증 | implemented | passed | not-deployed | [확장 계약](spec/php-extension.ko.md) |
| server-template-browser | 서버에서 컴파일한 직렬화 템플릿으로 현재 keyed 브라우저 인스턴스 생성 | implemented | passed | not-deployed | [폼 검증 절차](operations/verification.ko.md) |
| native-generation-integration | 현재 네 서버의 생성·SSR·전송·저장·브라우저 통합 | implemented | passed | not-deployed | [폼 검증 절차](operations/verification.ko.md) |
| comparison-deployment | 마운트한 저장소 트리의 로컬 비교 배포, 데이터 보존과 동일 설정 재적용 | implemented | passed | deployed | [폼 검증 절차](operations/verification.ko.md) |
| expressions | 공통 표현식 문법과 불리언 변환 | implemented | passed | not-deployed | [표현식 계약](spec/expressions.ko.md) |
| cli | 목록·정적 검사·스펙 설명 | implemented | passed | not-deployed | [CLI 절차](operations/cli.ko.md) |
| unique-json-members | 명세 JSON 텍스트에서 반복된 디코딩 객체 멤버 이름 거부 | implemented | passed | not-deployed | [입력 텍스트 계약](spec/input-text.ko.md), [파서 테스트](../packages/validator-ts/src/text/json.test.ts) |
| json-text-values | Rust 검증에서 JSON 객체 멤버 이름, 값과 순서 유지 | implemented | passed | not-deployed | [입력 텍스트 계약](spec/input-text.ko.md), [Rust 텍스트 사례](../packages/validator-rust/tests/text_validity_conformance.rs) |
| complete-form | 여덟 문자열 렌더러에서 폼 요소, 숨은 input, 폼·노드 오류를 가진 완전한 폼 | implemented | passed | not-deployed | [완전한 폼](spec/form-runtime.ko.md#완전한-폼), [공유 사례](../tests/fixtures/form-complete/README.ko.md) |
| choice-lists | 값에 관계없이 작성한 순서를 유지하는 값과 라벨 쌍의 선택 목록. 여덟 폼 renderer, 다섯 표시 renderer, 다섯 검증기, CLI | implemented | passed | not-deployed | [선택 목록](spec/schema.ko.md#선택-목록), [폼 사례](../tests/fixtures/form-render/written-cases.ts), [검증 사례](../tests/fixtures/validate/value-rules.ts) |
| display-descriptions-actions | 여덟 renderer에서 폼 루트와 목록의 설명, 상세 동작 | implemented | passed | not-deployed | [표시 형식](spec/display-formats.ko.md#마크업), [완전한 폼](spec/form-runtime.ko.md#완전한-폼), [목록 사례](../tests/fixtures/list-render/README.ko.md), [상세 사례](../tests/fixtures/detail-render/README.ko.md) |
| action-event-attributes | 여덟 renderer에서 목록과 상세 동작의 `behavior` 멤버를 event attribute로 한 번 씀 | implemented | passed | not-deployed | [표시 형식](spec/display-formats.ko.md#마크업), [목록 사례](../tests/fixtures/list-render/README.ko.md), [상세 사례](../tests/fixtures/detail-render/README.ko.md) |
| script-action-click | 여덟 renderer와 세 브라우저에서 목록과 상세의 스크립트 동작이 button을 누를 때 스크립트를 실행 | implemented | passed | not-deployed | [표시 형식](spec/display-formats.ko.md#마크업), [목록 사례](../tests/fixtures/list-render/README.ko.md), [상세 사례](../tests/fixtures/detail-render/README.ko.md), [브라우저 사례](../tests/widget-script-runs.test.mjs) |
| test-hook-failures | 실패하거나 제한 시간을 넘긴 hook을 포함해 `node --test`와 Vitest 실행의 모든 실패를 test 파일과 경과 시간과 함께 출력 | implemented | passed | not-deployed | [테스트 실행기](operations/testing.ko.md#테스트-실행기), [실행기 case](../tests/build/run-tests.test.mjs) |
| load-independent-checks | 시계를 읽지 않는 validator와 PHP extension engine의 선형 시간 검사 | implemented | passed | not-deployed | [시간과 부하](operations/testing.ko.md#시간과-부하), [시계 검사](../tests/build/validator-test-clocks.test.mjs) |
| single-choice-data | 다섯 검증기에서 단일 선택 필드 값인 배열이나 객체 거부 | implemented | passed | not-deployed | [검증 규칙](spec/validation-rules.ko.md#평가), [공유 사례](../tests/fixtures/validate/value-rules.ts) |
| empty-membership | 다섯 검증기에서 어떤 값과도 일치하지 않는 빈 `in` 목록·맵 | implemented | passed | not-deployed | [검증 규칙](spec/validation-rules.ko.md#값), [공유 사례](../tests/fixtures/validate/value-rules.ts) |
| declared-form-data | 모든 그룹 단계에서 선언되지 않은 제출 필드 거부 | implemented | passed | not-deployed | [검증 계약](operations/validation.ko.md), [공유 사례](../tests/fixtures/validate/cases.json) |
| form-controls | 라벨, 복수 선택 배열과 필드 컨테이너 경로 | implemented | passed | not-deployed | [공유 입력 검사](../tests/fixtures/form-session/controls.mjs) |
| package-exports | 패키지 export, 분리된 React 컴포넌트·서버 진입점, 타입 선언과 설치 프로덕션 빌드 | implemented | passed | not-deployed | [설치 검사](../scripts/check-packages.mjs), [React 진입점 검사](../packages/generator-react/src/__tests__/entry-boundary.test.ts) |
| package-install | 플랫폼 의존성 해석과 정상 설치 스크립트 | implemented | passed | not-deployed | [npm ci / test:packages](spec/package-build.ko.md) |
| package-build | 독립적인 공개 타입 선언 컴파일 | implemented | passed | not-deployed | [빌드 검사](../tests/build/README.ko.md) |
| package-api | 초기 패키지 API와 버전 메타데이터 | implemented | passed | not-deployed | [API 계약](spec/schema.ko.md) |
| form-template | 데이터와 독립된 폼 템플릿과 JSON 캐시 | implemented | passed | not-deployed | [코어 테스트](../packages/generator-core/src/form.test.ts) |
| form-initialization | 초기 데이터·반복 주입·레코드 복원 | implemented | passed | not-deployed | [런타임 계약](spec/form-runtime.ko.md) |
| form-inspector | 파싱한 DOM·HTML 원문·CSS·상태 비교와 차이 보존 | implemented | passed | not-deployed | [검사기 테스트](../tests/form-inspector/form-snapshot.test.mjs) |
| form-rows | 중첩 행 작업 범위와 저장 후 seq 키 적용 | implemented | passed | not-deployed | [코어 테스트](../packages/generator-core/src/form.test.ts) |
| form-empty-rendering | 병합 런타임의 명시적인 빈 컬렉션 출력 | implemented | passed | not-deployed | [빈 컬렉션 검사](../packages/generator-core/src/empty-collections.test.ts) |
| form-browser | 세 프레임워크의 데이터 주입과 행 작업 | implemented | passed | not-deployed | [공용 DOM 사례](../tests/fixtures/form-session/scenario.mjs) |
| form-typing | 안정적인 편집 컨트롤의 기본 입력 갱신, 포커스와 렌더러 완료 | implemented | passed | not-deployed | [브라우저 상호작용 검사](operations/verification.ko.md) |
| form-empty-focus | 빈 컬렉션의 첫 행 생성 후 포커스 | implemented | passed | not-deployed | [공통 DOM 사례](../tests/fixtures/form-session/scenario.mjs) |
| form-focus | 행 작업 후 대상 행으로 포커스 이동 | implemented | passed | not-deployed | [브라우저 상호작용 검사](operations/verification.ko.md) |
| form-markup | 다섯 구현의 재귀 폼 노드, 목록·상세 표시 블록, 행 카드, 인터페이스 문구 | implemented | passed | not-deployed | [폼 마크업](spec/form-markup.ko.md), [표시 형식](spec/display-formats.ko.md) |
| crudui-details | 읽기 전용 상세 명세, 모델, 프레임워크 독립 HTML 렌더링과 구조 검증 | implemented | passed | not-deployed | [명세](spec/schema.ko.md), [표시 형식](spec/display-formats.ko.md), [기능 계약](spec/feature-contracts.ko.md), [공용 상세 고정 데이터](../tests/fixtures/detail-render/README.ko.md), [네이티브 비교](../tests/native-generators/README.ko.md), [상세 검증 사례](../tests/fixtures/detail-validity/cases.json) |
| form-view-state | 레코드 데이터와 분리된 행 접기, 병합 실행취소·실행복귀 이력 | implemented | passed | not-deployed | [노드 테스트](../packages/generator-core/src/node.test.ts) |
| display-declarations | JavaScript, HTML 렌더러, PHP, PHP 확장, Go, Rust의 렌더링 시 목록·상세 선언 검사 | implemented | passed | not-deployed | [표시 형식 선언](spec/display-formats.ko.md#선언), [공용 목록 고정 데이터](../tests/fixtures/list-render/README.ko.md), [공용 상세 고정 데이터](../tests/fixtures/detail-render/README.ko.md), [네이티브 비교](../tests/native-generators/README.ko.md), [렌더 유효성 검사](../packages/generator-core/src/display-validity.test.ts) |
| form-outline | 구조 맵과 현재 데이터 보기 | implemented | passed | not-deployed | [폼 마크업](spec/form-markup.ko.md) |
| form-initialization-comparison | 데이터와 함께 생성한 폼과 마운트 후 주입한 폼의 단계별 좌우 비교 | implemented | passed | not-deployed | [폼 비교](spec/form-comparison.ko.md) |
| keyed-validation | 네 언어의 키를 유지하는 그룹·단일 값 검증 | implemented | passed | not-deployed | [공용 검증 사례](../tests/fixtures/validate/cases.json) |
| docs-check | 문서 검사와 이벤트 기반 개발 빌드 | implemented | passed | not-deployed | [문서 관리 절차](operations/documentation.ko.md) |
| docs-pages | 영어·한국어·API 페이지를 제공하는 정적 문서 | implemented | passed | deployed | [페이지 검사](../tests/docs/web-build.test.mjs), [게시 절차](operations/documentation.ko.md), [게시 웹](https://polyspec.github.io/crudui/) |
| ordered-json-check | 언어별 JSON 문서 순서 검증 | implemented | passed | not-deployed | [처리기 검사](../tests/ordered-json/check.py) |

## 현재 비교 배포 검증

2026-09-19에 비교 배포 검증이 5분 20초 만에 실패 0건으로 끝났습니다.
현재 `main` 트리가 비교 배포에서 제공되고 있습니다. PHP, PHP 확장, Go, Rust가 생성 450개, 저장
120개, 브라우저 7,008개 검사를 통과했고, 정본 흐름은 서버 다섯 개, 클라이언트 네 개, 두 초기화의 40개
조합을 모두 통과했으며 실패는 없었습니다. 검증은 기본값이 아닌 레코드를 담은 저장소에서 시작했으므로 모든
초기화 열은 자기가 초기화한 레코드를 불러왔습니다. 모든 브라우저 보고서와 단계는 각자의 제한 안에 완료했고
검증 후 컨테이너의 좀비 프로세스 수는 0개였습니다. 공개 루트는 목록, 상세, 폼, 저장, 갱신된 목록으로
이어지는 정본 페이지이며 별도 벤치마크 화면은 `/benchmark-console/`입니다. 정본 목록은 45개 레코드를
20·20·5개 세 페이지로 제공합니다. 페이지 수준 SSR에는 선택한 서버의 목록, 상세 또는 폼 마크업이 포함되고
CSR에는 선택한 클라이언트가 채우는 단계 셸만 포함됩니다. 초기화 비교는 프레임워크가 소유한 컨테이너 표시를
보존하고 렌더링된 컨테이너 내용만 비교합니다. Vue의 `data-v-app`도 제거하지 않습니다.

## 표시 선언 검증

2026-09-24에 표시 선언 변경의 작업 트리가 macOS arm64, PHP 8.5.10, Node.js 26.8.1, Go 1.27.0,
Rust 1.98.0에서 다음 검사를 통과했습니다.

- 네이티브 생성기 검사는 JavaScript, HTML 렌더러, PHP, Go, Rust, 네이티브 PHP 각각에서 목록 사례 142개와
  상세 사례 44개를 포함한 596개 검사를 통과했습니다(합계 3,576개, 실패 0개).
- 폼 패키지는 core 247, HTML 406, React 794, Vue 597, Svelte 590개와 마운트한 Svelte 14개 검사를
  통과했고, node 폼 검사는 57개와 24개를 통과했습니다. 생성기 패키지는 PHP 249, Go 116, Rust 36개 검사를, PHP 확장 검사는 46개
  검사를 통과했습니다. 주소 새니타이저 검사는 Linux에서 실행합니다.
- 교차 검증 콘솔 1,039개, 명세 CLI 38개, 폼 비교 소스 검사 194개, 그 Go·Rust 서버 14개와 18개,
  `npm run manifest:test` 명령 21개, `npm run test:packages` 7단계, `npm run test:runtimes` 65개 검사를
  통과했습니다. `npm run spec:schema`, `npm run lint`, `npm run typecheck`, `make format-check`,
  `make docs-check`도 통과했습니다.

## 네이티브 패키지 검증

2026-09-17에 작업 트리는 PHP 8.5.10, Node.js 26.8.1, Go 1.27.0, Rust 1.98.1을 쓰는 macOS arm64에서
`make ci`를 통과했습니다. `make ci`는 CI 워크플로의 모든 검사 명령을 실행하고 적합성 증거를
`contracts/features.json`과 비교합니다.

- 검증기는 JavaScript 580개, PHP 698개, Go 587개, Rust 111개 검사를 통과했으며, 각각 공용 검증
  사례 250개 전체와 검증·생성 연산의 공용 입력 텍스트 사례 80개를 포함합니다. PHP 확장 검사는 42개를
  통과했으며 주소 새니타이저 검사는 Linux에서 실행합니다.
- 공용 생성기 보고서는 JavaScript, HTML 렌더러, PHP, Go, Rust, 네이티브 PHP에서 각각 501개 검사를
  통과했고(합계 3,006개, 실패 0개) 실행 중 입력이 바뀌지 않았습니다. 생성기 패키지는 PHP 240개, Go 115개,
  Rust 35개 검사를 통과했습니다.
- 교차 검증 콘솔은 검사 914개를 통과했으며, 공용 검증·목록·상세·입력 텍스트 사례 전체와 요청 사례를 다섯
  검증기 프로세스로 보냅니다.
- 폼 패키지는 core 216개, HTML 308개, React 502개, Vue 472개, Svelte 467개와 마운트한 Svelte 검사 12개를
  통과했고, 명세 CLI는 38개, Node 폼 검사는 Chromium·Firefox·WebKit의 스타일시트 배치를 포함해 54개를
  통과했습니다. 폼 비교 소스 검사 149개, 저장소 전체 `npm run lint`(문제 0건), 패키지 설치 검사 7단계, `make format-check`가 통과했습니다.
- Linux 툴체인 이미지에서 PHP 확장 엔진은 주소 새니타이저와 쉼표 소수점 로캘 실행을 포함해 33개 검사를
  통과했습니다. Chromium·Firefox·WebKit의 Linux 스타일시트 검사는 폼 검사를 실행하는 CI 작업에서
  실행합니다.

적합성은 증거로 검사합니다. 공용 fixture를 실행하는 모든 검사가 통과한 기능·fixture 사례·런타임을
기록하고, `make conformance`(와 CI의 마지막 작업)가 그 증거를 `contracts/features.json`과 비교합니다.
지원한다고 선언한 런타임에 선언된 사례마다 통과 기록이 없으면 실패합니다. 기준은
[적합성](spec/conformance.ko.md)에 정의되어 있습니다. 패키지, PHP 확장, 비교 서비스는 배포하지
않았습니다.

## 보존 폼 비교 결과

보존 외부 `https://crudui.test/` 환경은 이전 라이브러리 트리를 사용하며
PHP·네이티브 JSON 파싱을 사용하는 PHP·Go·Rust를 독립적인 HTTP 대상으로 실행합니다.
HTTP 검사 240개와 PHP 처리 모드 검사가 모두 통과했습니다.

두 PHP 대상은 모두 PHP 검증기를 사용합니다. 이 보존 결과는 현재 CRUDUI
네이티브 폼 생성이나 검증 통합을 증명하지 않습니다.

| 서버 | 시나리오 | 상호작용 | 페이지 오류 |
| --- | --- | --- | --- |
| PHP | 120/120 통과 | 30/30 통과 | 0 |
| 네이티브 JSON 파싱을 사용하는 PHP | 120/120 통과 | 30/30 통과 | 0 |
| Go | 120/120 통과 | 30/30 통과 | 0 |
| Rust | 120/120 통과 | 30/30 통과 | 0 |

각 대상은 React·Vue·Svelte의 폼 전송과 ordered JSON 전송을 검사합니다.
보고서는 초기 데이터, 나중 주입, 반복 주입, 레코드 복원, HTML 원문, DOM,
CSS, 입력 상태와 행 연산을 포함합니다. 근거는 외부 비교 작업 공간의
`.form-comparison/results-<revision>/report-<server>.json`에 저장합니다.
보고서 메타데이터는 소스 리비전을 기록합니다. 상호작용 검사 전체 108개는 비교 모드 네 가지의
합계이며 그중 30개가 현재 구현에 해당합니다.

라이브러리 트리와 검증한 트리 사이의 TypeScript 파일 5개는 API 주석과 사용하지 않는 타입 import만
변경했으며 실행 JavaScript는 동일합니다. 생성된 PHP 의존성과 Go 실행 파일은
Git에서 제거했습니다. 새 이미지는 같은 잠금 버전의 PHP 의존성을 설치하고
서버 실행 파일을 소스에서 빌드합니다.

현재 배포는 이미지와 마운트 계약이 일치하는 실행 중인 비교 컨테이너를 재사용합니다.
소스 동기화는 컨테이너 검사 결과·프로젝트 경로·프록시 상태·인증서·저장 파일·HTML·
상태·로드 응답을 보존합니다. 컨테이너 생성은 초기 구성 또는 이미지·마운트 계약이
명시적으로 변경된 경우로 제한합니다.

보존된 비교 구현에는 진단 실패가 있습니다. 실패는 보고서에 유지되며 전체
비교 실행기는 0이 아닌 상태로 종료합니다. 현재 구현의 통과가 보존된 구현의
통과를 의미하지 않습니다. 이전 보고서는 현재 의존성 그래프를 검증하지 않습니다.

## 배포

라이브러리 배포는 패키지 게시를 의미하며 게시된 패키지는 없습니다.
표는 서버별로 완료된 최신 검사를 기록합니다.
네 서버의 브라우저 검사가 완료되었습니다. 보존된 비교 구현의 실패는 보고서에 유지합니다.

TypeScript·Go·Rust·PHP API 생성과 엄격한 정적 웹 빌드가 통과했습니다.
전체 문서를 두 번 생성한 API 문서·네이티브 HTML 자산·스키마 출력은 동일했습니다.
생성 실패 검사 8개와 폼 원문 검사기 18개가 통과했습니다.
