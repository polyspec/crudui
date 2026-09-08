# 기능 상태

[English](features.md). 계약은 [명세](spec/form-runtime.ko.md)에 정의합니다.
테스트와 배포를 별도로 기록합니다. `pending`은 통과 결과가 아닙니다.

| ID | 기능 | 구현 | 검증 | 배포 | 근거 |
| --- | --- | --- | --- | --- | --- |
| legacy-examples | 레거시 예제 경로와 패키지 빌드 | in-progress | pending | not-deployed | [Examples](spec/examples.ko.md) |
| form-controls | 라벨, 복수 선택 배열과 필드 컨테이너 경로 | implemented | passed | not-deployed | [공유 입력 검사](../tests/fixtures/form-session/controls.mjs) |
| package-consumer | 패키지 export, 타입 선언과 소비자 프로덕션 빌드 | implemented | passed | not-deployed | [소비자 검사](../scripts/check-packages.mjs) |
| package-install | 플랫폼 의존성 해석과 정상 설치 스크립트 | implemented | passed | not-deployed | [npm ci / test:packages](spec/package-build.ko.md) |
| package-build | 독립적인 공개 타입 선언 컴파일 | implemented | passed | not-deployed | [빌드 검사](../tests/build/README.ko.md) |
| package-api | 초기 패키지 API와 버전 메타데이터 | in-progress | pending | not-deployed | [API 계약](spec/schema.ko.md) |
| form-template | 데이터와 독립된 폼 템플릿과 JSON 캐시 | implemented | passed | not-deployed | [코어 테스트](../packages/generator-core/src/form.test.ts) |
| form-initialization | 초기 데이터·반복 주입·레코드 복원 | implemented | passed | not-deployed | [런타임 계약](spec/form-runtime.ko.md) |
| form-inspector | 파싱한 DOM·HTML 원문·CSS·상태 비교와 차이 보존 | implemented | passed | not-deployed | [검사기 테스트](../examples/form-comparison/src/form-snapshot.test.mjs) |
| form-rows | 중첩 행 작업 범위와 저장 후 seq 키 적용 | implemented | passed | not-deployed | [코어 테스트](../packages/generator-core/src/form.test.ts) |
| form-empty-rendering | 병합 런타임의 명시적인 빈 컬렉션 출력 | implemented | passed | not-deployed | [빈 컬렉션 검사](../packages/generator-core/src/empty-collections.test.ts) |
| form-browser | 세 프레임워크의 데이터 주입과 행 작업 | implemented | passed | not-deployed | [공용 DOM 사례](../tests/fixtures/form-session/scenario.mjs) |
| form-typing | input 교체 중 전체 타이핑과 포커스 유지 | implemented | passed | not-deployed | [브라우저 상호작용 검사](../examples/form-comparison/check-interaction.mjs) |
| original-typing | 원본 컨트롤러의 대기 중 렌더링에서 입력 값 유지 | implemented | passed | not-deployed | [네이티브 타이핑 검사](../examples/form-comparison/check-typing.mjs) |
| form-empty-focus | 빈 컬렉션의 첫 행 생성 후 포커스 | implemented | passed | not-deployed | [공통 DOM 사례](../tests/fixtures/form-session/scenario.mjs) |
| form-focus | 행 연산의 포커스, 선택, 스크롤 유지 | implemented | passed | not-deployed | [브라우저 상호작용 검사](../examples/form-comparison/check-interaction.mjs) |
| keyed-validation | 네 언어의 키를 유지하는 그룹·단일 값 검증 | implemented | passed | not-deployed | [공용 검증 사례](../tests/fixtures/validate/cases.json) |
| docs-check | 문서 링크·번역·상태 검사 | implemented | passed | not-deployed | [문서 관리 절차](operations/documentation.ko.md) |
| form-comparison | 원본과 13자리 브라우저 비교 | in-progress | pending | not-deployed | [브라우저 검사](../examples/form-comparison/check.mjs) |
| form-persistence | 키 기반 네이티브 제출과 JSON 문서 순서 영속 저장 | in-progress | pending | not-deployed | [영속 저장 사례](../examples/form-comparison/src/frame.mjs) |
| ordered-json-check | 언어별 JSON 문서 순서 검증 | implemented | passed | not-deployed | [처리기 검사](../examples/form-comparison/check-ordered-json.py) |
| ordered-json-runtime | 같은 검증·저장 처리를 사용하는 폼과 순서 유지 JSON 전송 | in-progress | pending | not-deployed | [전송 계약](spec/form-comparison.ko.md) |
| php-extension-server | 독립된 PHP 확장 요청과 저장 | in-progress | pending | not-deployed | [처리 모드](spec/form-comparison.ko.md#php-처리-모드) |
| form-servers | PHP, Go, Rust의 독립된 제출, 검증, 저장과 재로드 | in-progress | pending | not-deployed | [서버 계약](spec/form-comparison.ko.md) |
| form-client-validation | 사용자 제출 전 기존 JavaScript 검증 | in-progress | pending | not-deployed | [브라우저 상호작용 검사](../examples/form-comparison/check-interaction.mjs) |
| original-empty-correction | 원본 출력 수정과 빈 컬렉션 전체 처리 과정 | implemented | passed | not-deployed | [비교 계약](spec/form-comparison.ko.md) |
| original-keyed-proof | 원본 공개 함수의 키 편집, 영속 저장, 캐시 바인딩 | implemented | failed | not-deployed | [비교 계약](spec/form-comparison.ko.md) |

`5e517a2` 라이브러리 검증(2026-09-07): `npm run test:forms`, TypeScript 검증기, PHP/Go/Rust 검증 적합성,
콘솔 SSR 테스트, CLI 테스트, 린트, 타입 검사, `make docs-check`가 통과했습니다.
API 생성, 스키마 생성, 문서 사이트 빌드도 통과했습니다. 라이브러리의 배포 상태는
패키지 게시를 기준으로 하며 게시한 패키지는 없습니다. 폼 비교 예제은 Apple container의
[localhost:4317](http://localhost:4317)에 로컬 배포했습니다. 원격 배포는 실행하지
않았습니다.

PHP 확장 통합은 독립된 `crudui-extension-check` 컨테이너에서 HTTP 검사
240개를 통과했습니다. 근거는
`.form-comparison/extension-check/results/server-report.json`입니다.
두 PHP 모드와 모드 강제 검사는 `test-php-modes.mjs`를 통과했습니다.
확장 브라우저 검증과 기본 비교 컨테이너 교체는 남아 있습니다.

Go·Rust 브라우저 보고서는 각각 현재 런타임 시나리오 120개와 상호작용 검사
108개를 통과했고 페이지 오류는 없었습니다. 근거는 라이브러리 소스
`30ff267`을 사용한 `.form-comparison/results/report-go.json`과
`report-rust.json`입니다. 보존된 소스의 HTML 차이는 실패한 진단으로
유지합니다. 이 보고서는 PHP 확장 브라우저 실행의 검증 근거가 아닙니다.

## 현재 서버 검증

로컬 비교 컨테이너는 라이브러리 소스 `30ff267`을 사용합니다. 현재 PHP·Go·Rust
진입점으로 비교 대상 네 가지의 HTTP 검사 180개가 통과했습니다. 검사는
native multipart·URL-encoded·ordered JSON 요청, 저장된 레코드, 재로드,
검증 실패와 손상된 파일 보존을 포함합니다. 보고서는
`.form-comparison/results/server-report.json`입니다. 브라우저 동작 검증은
진행 중입니다. JavaScript 검증은 브라우저와 CLI에서 실행합니다. 패키지는
게시하지 않았습니다. 아래의 이전 보고서는 당시 소스 버전을 유지합니다.

## 폼 초기화 검사기

공통 DOM 바인딩은 최초 렌더링과 갱신에서 `checked` 속성 위치를 고정합니다.
HTML 전체 복원 회귀 검사는 수정 전 React와 Vue에서 실패했습니다. 현재 검사는
복원한 HTML 전체를 비교하고 체크박스 요소가 유지되는지 확인합니다. 소스 `f4ec125`를
로컬 비교 컨테이너에 적용했으며 아래 브라우저 검사를 통과했습니다.

2026-09-08 생성기 빌드와 테스트 1,405개가 통과했습니다. 코어 25개, React 690개,
Vue 343개, Svelte 345개, Svelte 클라이언트 2개입니다. 공통 마운트 테스트는
초기 데이터, 반복 주입 3회, 표시 여부 변경과 레코드 복원을 비교합니다. React
렌더러는 마지막 스타일 선언을 제거한 후 빈 `style` 속성을 제거합니다.
검사기 테스트 18개가 모두 통과했으며 속성 누락, 행 키 변경, 자식 순서와 HTML을
변경하지 않는 컨트롤 속성 차이를 포함합니다. Chrome 검사 6개는 계산된 CSS,
숨김 표시와 두 가상 요소의 의도적인 차이와 스타일 복원을 확인했습니다.
검사기는 로컬 비교 예제에서 실행 중입니다. 패키지는 게시하지 않았습니다.

현재 런타임의 초기 데이터 생성과 마운트 후 주입은 항목별 검사 2,160개가 모두
통과했습니다. 서버·프레임워크·전송 방식 18개 조합의 15단계와 8개 항목입니다.
반복 주입 검사 576개도 HTML 원문을 포함해 모두 통과했습니다. 레코드 교체와
복원을 포함한 DOM 비교 378개가 모두 통과했습니다. 체크박스를 변경한 후
복원하는 검사를 포함해 HTML 원문 비교 378개와 복원 항목별 검사 288개도 모두
통과했습니다. 이전 React·Vue 복원 차이 24개를 해결했습니다. 현재 런타임 보고서
18개는 각각 시나리오 20/20을 통과했으며 HTML, DOM, CSS, 컨트롤 상태, 필드,
데이터, 포커스와 서버 응답을 포함합니다. 검사기는 실제 속성을 재정렬하거나 내보낸
HTML에서 차이를 제거하지 않으며 공통 DOM 바인딩이 체크박스 속성 순서를 처리합니다.
Rust를 사용하는 한국어 React와 영어 Vue 브라우저 검사로 전용 버튼, 단계 자료
30개, 실행별 항목 결과 168개 전체, JSON 다운로드와 HTML 원문 다운로드를
확인했습니다. 다운로드한 최초 HTML과 복원한 HTML도 정확히 일치했습니다.

## 빈 컬렉션 병합 검증

2026-09-07 병합 코드의 생성기 빌드와 테스트 1,402개가 통과했습니다.
코어 25개(빈 컬렉션 회귀 검사 6개 포함), React 689개, Vue 342개,
Svelte 345개, Svelte 클라이언트 1개입니다. 회귀 검사는 `compileForm`과
`bindForm`을 사용합니다. 수정 커밋은 `main` 이력에 포함합니다. 패키지를
게시하지 않았으며 로컬 비교 예제는 아래의 고정 소스와 보고서를 유지합니다.
[빈 컬렉션 계약](spec/empty-collections.ko.md).

## JSON 처리기 결과

2026-09-07 JSON 처리기 검증은 ordered-json 커밋 `deb1b354`를 사용했습니다.
JavaScript, PHP, PHP 확장, Go, Rust에서 각각 처리기 사례 115개와 CRUDUI
전송 고정 데이터 10개가 통과했습니다. 호스트는 macOS arm64의 Node 26.8.1,
PHP 8.5.10, Go 1.27.0, Rust 1.98.1을 사용했습니다. 전송 사례는 순서,
13자리 키, 신규·복사·저장한 행 표현, 빈 객체와 배열의 자료형을 검사합니다.
이 처리기 검사는 폼 행 조작을 실행하지 않습니다. 런타임 연동은 아래의 브라우저·서버
결과로 별도 검증합니다.
[검증 절차와 범위](operations/ordered-json.ko.md).

## 폼 비교 예제 결과

주 비교는 원본 소스 `1e8702a`에 명시적인 빈 컬렉션 출력 수정 `78723bb`를 적용한
구현과 현재 런타임 `f4ec125`를 사용합니다. 원본 기반 예제는 캐시 바인딩과 행
컨트롤러를 추가하며 현재 런타임은 라이브러리 세션을 사용합니다. 두 구현은 동일한
13자리 키 데이터, 기존 검증기, 독립된 JSON 저장소를 사용합니다. 숨김 seq 필드를
제출하지 않습니다. [localhost:4317](http://localhost:4317)에서
[비교 절차](operations/form-comparison.ko.md)를 실행합니다. 위 표의 `form-comparison` 상태는
이 두 주 비교 구현을 기준으로 합니다.

세 서버 보고서는 2026-09-07 16:36 UTC에 생성하고 16:37 UTC에 합쳤습니다.
Chrome 149.0.7827.22, Node 26.8.1, PHP 8.4.24, Go 1.27.0, Rust 1.98.0을
사용했습니다. 표의 각 항목은 네이티브 폼과 JSON 전송을 모두 포함합니다.

| 서버 | 프레임워크 | 수정 원본 | 현재 런타임 | 수정 전 원본 키 | 유지한 배열 진단 |
| --- | --- | --- | --- | --- | --- |
| PHP, Go, Rust | React | 19/20 | 20/20 | 17/20 | 15/20 |
| PHP, Go, Rust | Vue | 19/20 | 20/20 | 17/20 | 15/20 |
| PHP, Go, Rust | Svelte | 20/20 | 20/20 | 18/20 | 15/20 |

보고서는 72개이며 시나리오 결과 1,440개 중 1,290개 통과와 150개 실패를
기록했습니다. 서버별 실행기는 종료 코드 1을 반환했습니다. 실패는 이전 진단
108개와 보존한 소스의 초기화 사례 42개를 포함합니다. 초기화 검사기는 해당 소스에서
HTML 원문 차이 168개와 DOM 차이 168개를 기록했습니다. 과거 React·Vue 렌더러와
배열 Svelte 예제는 숨긴 내용을 표시한 후 빈 `style` 속성을 유지합니다.
해당 소스와 실패를 보존합니다. 현재 런타임 검사는 모두 통과했습니다. 보존한 소스의
통과·실패 결과는 이전 보고서와 일치하며 추가 실패는 없습니다.

상호작용 검사 324개, 데이터 로드 전 마운트 검사 36개, 정적 문서 검사 36개가
모두 통과했습니다. 세 API 서버의 정적 HTML 해시도 일치했습니다. 브라우저
페이지 오류는 없었습니다. 단계별 스냅샷 2,160개를 HTML 원문, 파싱한 DOM,
컨트롤 상태와 함께 내보냈습니다. 전체 보고서는
`.form-comparison/results/report.json`이며 `initialization-summary.json`에 개수와
보고서 해시를 기록합니다. 서버별 보고서와 중단한 보고서 42개도 보존합니다.
16:26 UTC의 중간 실행도 보존했습니다. 진행 확인용 추가 연결이 화면 크기를
1680 × 1100에서 800 × 600으로 변경해 수정 원본 Svelte 사례 하나에서 CSS 차이
5개가 발생했습니다. 별도 브라우저 검사로 이 변경을 재현했습니다. 확인용 자동화를
제거하고 추가 브라우저 연결 없이 전체 검사를 다시 실행했습니다. 최종 보고서에는
CSS 불일치가 없습니다.
중단한 실행은 15분 제한의 브라우저 프로토콜 호출을 API 서버별로 나누기 전에
보존했으며 전체 검증 완료로 계산하지 않습니다.

16:38 UTC에 세 서버와 네 예제의 공유 HTTP 검사 180개가 모두 통과했습니다.
Multipart, URL-encoded, JSON 요청의 레코드, ID, 부모 관계, 위치와 로드 순서가
일치했습니다. 실제 파일 내용, 물리적인 레코드 정렬 변경, 신규·삭제 ID, 필수 값 검증
실패, 잘못된 언어 객체, 단일 필드 자료형, 요청 제한, 잘못된 초기화 요청, 손상된 파일
유지도 확인했습니다. 각 서버가 파싱, 기존 CRUDUI 검증과 원자적 저장을 직접 수행하며
Node는 바이트를 전달했습니다. 네이티브 타이핑 36개는 16:38 UTC에 다시 모두
통과했습니다. 이전 두 언어의 UI 선택 검사 54개, Go 정적 검사와 Rust Clippy
결과는 변경 기록에 유지합니다.

각 프레임에서 네이티브 multipart 또는 JSON 전송을 선택합니다. 브라우저의 JSON
요청, PHP·Go·Rust 요청·응답 처리, 저장 JSON 파일은 ordered-json `deb1b354`를 사용합니다.
처리기 아카이브 SHA-256은
`27a42f171995714509215421c009eb63768acb6c7480264a51a77b522236cd86`입니다.
두 형식은 같은 검증기와 저장소를 사용합니다. 실제 HTTP Content-Type과 JSON 본문
형태 검사가 통과했습니다. 같은 편집·복사 데이터는 두 방식에서 같은 레코드, 저장
키, 부모 ID, 위치, 로드 값을 생성했습니다. 잘못된 JSON과 지원하지 않는 Content-Type은
레코드를 변경하지 않고 거부했습니다. 컨테이너에서 JavaScript 변환 검사 3개,
PHP 변환 검사, 두 PHP 저장소 검사와 `make docs-check`가 통과했습니다.
11:35 UTC의 검증 결과도 유지합니다.
TypeScript 검증 검사 44개, 공용 검증과 목록 사례를 포함한 PHP 검사 61개,
Go·Rust 검증 적합성 검사가 통과했습니다. `make docs-check`도 통과했습니다.

예제는 사용자 제출 전에 기존 JavaScript 검증기를 실행하고 각 서버는 독립적으로
검증합니다. 라이브러리 검증 규칙은 변경하지 않았습니다. 필수 필드의 빈 값은 디자인에 의해
숨겨져 있어도 실패합니다. 선택 항목인 이름이 비어 있는 부서 행을 추가하면 검증을
통과하고 제거하거나 교체하지 않은 값을 저장합니다. 빈 컬렉션 검사는 표시 여부,
중첩 및 전체 삭제, 삭제 후 추가, 네이티브와 JSON 저장, 형제 행 ID 유지, 부모
관계, 포커스를 포함합니다.

두 주 비교 구현은 네이티브 input 이름, 현재 값 복사, 하위 행 독립 편집, 데이터
주입, 저장 키 갱신, 잘못된 부모 거부, 삭제, 문서 순서를 통과합니다. ID `[5, 7, 1]`은
식별자를 유지하며 삽입은 ID 8, 복사는 ID 9를 생성합니다. 별도 식별자나 순서 필드
없이 JSON 문서 멤버 순서를 행 순서로 사용합니다. 로드는 테이블의 물리적 순서와
무관하게 저장된 위치로 계층을 구성합니다.

원본 공개 함수 `composeProperties`, `buildField`, `makeTranslate`를 사용하는 캐시
바인딩이 통과합니다. 데이터 바인딩 전에 구조를 직렬화하고 복원하며 합성 참조는
한 번 읽습니다. 이후 데이터 주입은 참조를 다시 읽거나 캐시한 구조를 변경하지
않습니다. 이 결과는 문서화한 소스 수정과 예제 바인딩을 적용한 원본 기반의 동작을
확인하며 배열 위치가 저장된 행 식별자를 대체한다는 근거는 아닙니다.

수정 전 원본 키 진단은 생성한 `[0]` 행 키가 HTTP 400으로 거부되어 `exact`에 실패하고,
명시적인 빈 컬렉션에 행을 출력하여 `empty`에 실패합니다. 식별자와 렌더링의 결과이며
`required` 실패가 아닙니다. 배열 진단은 예제 구성 때문에 숨김 필드 제외와 캐시
바인딩에도 실패합니다. 두 진단은 승인된 구현으로 사용하지 않으며 소스와 보고서는
검토를 위해 유지합니다.

유지한 라이브러리 소스의 10:15 UTC 검증: 수정한 원본 코어 검사 21개,
원본 소스의 React 273개·Vue 273개·Svelte
363개 SSR 적합성 검사, 현재 런타임의 세 프레임워크 마운트 DOM 검사, 코어 타입 검사,
`make docs-check`가 통과했습니다. 기존 검증 사례 43개는 TypeScript, PHP, Go,
Rust에서 통과했습니다. TypeScript는 픽스처 실행 범위 검사도 통과했습니다. PHP 검증은
컨테이너에서도 확인했습니다.

예제는 Apple container에서 로컬 실행합니다. 패키지 게시와 원격 배포는 수행하지
않았습니다. 모든 비교 구현을 계속 선택할 수 있습니다. SQL 드라이버와 외부 편집기 위젯은
이번 비교의 검증 범위에 포함하지 않습니다.

## 원본 컨트롤러 타이핑 결과

2026-09-07 13:41 UTC 검증: 수정 원본, 수정 전 원본 키, 유지한 배열, 현재 런타임
예제에서 React·Vue·Svelte의 실제 키보드 검사 36개가 모두 통과했습니다. 문자당
0, 10, 50 ms 간격으로 입력했습니다. 즉시 값, 렌더링 후 값, 포커스와 커서 위치가
유지되었고 브라우저 페이지 오류는 없었습니다. 원본 예제 컨트롤러는 새 입력으로
대체된 입력 렌더링을 취소하고 프레임워크의 DOM 갱신 후 포커스를 복원합니다.
라이브러리 소스 스냅샷은 변경하지 않았습니다. 수정은 로컬 비교 컨테이너에
배포했으며 패키지를 게시하지 않았습니다.

현재 작업 트리 검증(2026-09-08): 폼 검사 1,409개, JavaScript 검증기 검사
1,579개, PHP 검사 1,392개, Go·Rust 검사, 콘솔 검사 42개, 검사기 검사 18개가
통과했습니다. Svelte 타입 검사는 오류와 경고가 없었습니다. 패키지 소비자는
export 파일 검사, TypeScript 컴파일, 세 프레임워크 프로덕션 빌드를 통과했습니다.
이 결과는 컨테이너 배포나 전체 브라우저·서버 전송 조합의 검증을 의미하지 않습니다.

2026-09-09 비교 환경: 라이브러리 `a5b4491`, HTTP 대상 네 가지의 검사
240/240개와 PHP 처리 모드 검사가 통과했습니다. 로컬 컨테이너는 정상 의존성
설치를 사용합니다. 이 소스의 브라우저 검증은 진행 중이며 이전 브라우저
보고서는 이 의존성 그래프의 검증 근거가 아닙니다.
