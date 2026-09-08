# 기능 상태

[English](features.md). 계약은 [명세](spec/form-runtime.ko.md)에 정의합니다.
테스트와 배포를 별도로 기록합니다. `pending`은 통과 결과가 아닙니다.

| ID | 기능 | 구현 | 검증 | 배포 | 근거 |
| --- | --- | --- | --- | --- | --- |
| legacy-examples | 레거시 예제 경로와 패키지 빌드 | implemented | passed | not-deployed | [Examples](spec/examples.ko.md) |
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

## 현재 검증

패키지 검사는 `a5b4491`에 커밋된 의존성 그래프를 사용합니다.
`npm ci`, 공개 선언과 export 검사 5개, 반복 빌드 출력 검사 1개, 별도 소비자
타입·프로덕션·세 프레임워크 브라우저 검사가 통과했습니다. 폼 검사는 코어
26개, React 691개, Vue 344개, Svelte 345개와 마운트 검사 3개, 정규화 검사
6개가 통과했습니다. JavaScript 검증 1,579개와 PHP 1,392개가 통과했습니다.
Go와 Rust 패키지 테스트도 통과했습니다.

`multiple.min`을 포함한 후 스키마 고정 사례 56개가 통과했습니다. 이후 스키마
설명 변경은 파싱한 검증 규칙을 유지했습니다. 현재 문서의 문서 검사도
통과합니다. 이 검사는 패키지 게시나 릴리스 완료를 증명하지 않습니다.

## 폼 비교 결과

[localhost:4317](http://localhost:4317)의 로컬 환경은 라이브러리 `a5b4491`을
사용하며 PHP·PHP 확장·Go·Rust를 독립적인 HTTP 대상으로 실행합니다.
HTTP 검사 240개와 PHP 처리 모드 검사가 모두 통과했습니다.

| 현재 구현 | 시나리오 | 상호작용 | 페이지 오류 |
| --- | --- | --- | --- |
| PHP | 120/120 통과 | 30/30 통과 | 0 |
| PHP 확장 | 120/120 통과 | 30/30 통과 | 0 |
| Go | 120/120 통과 | 30/30 통과 | 0 |
| Rust | 120/120 통과 | 30/30 통과 | 0 |

각 대상은 React·Vue·Svelte의 폼 전송과 ordered JSON 전송을 검사합니다.
보고서는 초기 데이터, 나중 주입, 반복 주입, 레코드 복원, HTML 원문, DOM,
CSS, 입력 상태와 행 연산을 포함합니다. 근거는
`.form-comparison/results/report-<server>.json`에 저장하며 보고서 메타데이터는
소스 리비전을 기록합니다. 상호작용 검사 전체 108개는 비교 모드 네 가지의
합계이며 그중 30개가 현재 구현에 해당합니다.

보존된 비교 구현에는 진단 실패가 있습니다. 실패는 보고서에 유지되며 전체
비교 실행기는 0이 아닌 상태로 종료합니다. 현재 구현의 통과가 보존된 구현의
통과를 의미하지 않습니다. 이전 보고서는 현재 의존성 그래프를 검증하지 않습니다.

## 예제와 배포

레거시 예제는 `examples/legacy`를 사용합니다. 로컬 프론트엔드 빌드, Go 테스트,
Rust 컴파일, PHP API 테스트와 Node HTTP 테스트가 통과했습니다. 프론트엔드
예제 세 가지와 Node·PHP·Go·Rust의 Linux 이미지가 빌드됐습니다. 서버 이미지
네 가지의 HTTP 유효·무효 사례가 통과했습니다. PHP PSR-4 자동 로딩 생성은
애플리케이션 클래스 제외 없이 통과했습니다. 데모·Playground와 Bootstrap의 폼 페이지에서 브라우저 렌더링·입력 검사가
통과했습니다. Bootstrap 상품 페이지는 중첩 데이터도 확인했습니다.

라이브러리 배포는 패키지 게시를 의미하며 게시된 패키지는 없습니다.
비교 애플리케이션은 로컬에서 사용할 수 있으며 현재 구현의 전체 브라우저 조합
검사가 완료됐습니다. 보존된 비교 구현의 실패는 보고서에 유지합니다.
릴리스 검증과 저장소 정리는 진행 중입니다.

문서 전체 생성과 정적 사이트 빌드가 통과했습니다. API 문서와 스키마를
연속 두 번 생성한 결과가 같았습니다. 콘솔 검사 81개와 폼 원문 검사기
18개가 통과했습니다.
