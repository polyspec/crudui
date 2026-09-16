# 기능 상태

[English](features.md). 계약은 [명세](spec/form-runtime.ko.md)에 정의합니다.
테스트와 배포를 별도로 기록합니다. `pending`은 통과 결과가 아닙니다.

| ID | 기능 | 구현 | 검증 | 배포 | 근거 |
| --- | --- | --- | --- | --- | --- |
| validator-responses | 검증기 프로세스 상태와 완전한 응답 검사 | implemented | passed | not-deployed | [응답 검사](../examples/cross-check-console/server/validate-response.test.mjs), [명령행 요청 사례](../tests/fixtures/validator-cli/README.ko.md) |
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
| legacy-comparison | 구형 실행·사례 기대값·네 언어 일치 | implemented | passed | not-deployed | [테스트 절차](operations/testing.ko.md) |
| legacy-examples | 레거시 예제 경로와 패키지 빌드 | implemented | passed | not-deployed | [Examples](spec/examples.ko.md) |
| form-controls | 라벨, 복수 선택 배열과 필드 컨테이너 경로 | implemented | passed | not-deployed | [공유 입력 검사](../tests/fixtures/form-session/controls.mjs) |
| package-consumer | 패키지 export, 타입 선언과 소비자 프로덕션 빌드 | implemented | passed | not-deployed | [소비자 검사](../scripts/check-packages.mjs) |
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
| form-view-state | 레코드 데이터와 분리된 행 접기, 병합 되돌리기 이력 | implemented | passed | not-deployed | [노드 테스트](../packages/generator-core/src/node.test.ts) |
| form-outline | 구조 맵과 현재 데이터 보기 | implemented | passed | not-deployed | [폼 마크업](spec/form-markup.ko.md) |
| form-initialization-comparison | 데이터와 함께 생성한 폼과 마운트 후 주입한 폼의 단계별 좌우 비교 | implemented | passed | not-deployed | [폼 비교](spec/form-comparison.ko.md) |
| keyed-validation | 네 언어의 키를 유지하는 그룹·단일 값 검증 | implemented | passed | not-deployed | [공용 검증 사례](../tests/fixtures/validate/cases.json) |
| docs-check | 문서 검사와 이벤트 기반 개발 빌드 | implemented | passed | not-deployed | [문서 관리 절차](operations/documentation.ko.md) |
| docs-pages | 영어·한국어·API 페이지를 제공하는 정적 문서 | implemented | passed | deployed | [페이지 검사](../tests/docs/site-build.test.mjs), [게시 절차](operations/documentation.ko.md), [게시 사이트](https://polyspec.github.io/crudui/) |
| ordered-json-check | 언어별 JSON 문서 순서 검증 | implemented | passed | not-deployed | [처리기 검사](../tests/ordered-json/check.py) |

## 현재 비교 배포 검증

현재 `main` 트리가 비교 배포에서 제공되고 있습니다. PHP, PHP 확장, Go, Rust가 생성
450개, 저장 120개, 브라우저 7,008개 검사를 실패 없이 통과했습니다. 각 브라우저 서버는
900,000밀리초 제한 안에 완료했고 검증 후 컨테이너의 좀비 프로세스 수는 0개였습니다.
현재 공개 계약은 루트 파이프라인 예제이며 별도 벤치마크 화면은 `/benchmark-console/`입니다.
정본 목록은 45개 레코드를 20·20·5개 세 페이지로 제공합니다. 페이지 수준 SSR에는 선택한
CRUDUI 목록 또는 상세 마크업이 포함되고 CSR에는 단계 셸만 포함됩니다. 초기화 비교는
프레임워크가 소유한 컨테이너 표시를 보존하고 렌더링된 컨테이너 내용만 비교합니다. Vue의
`data-v-app`도 제거하지 않습니다.

## 네이티브 패키지 검증

현재 OrderedJSON 모노레포 리비전과 다섯 구현 패키지에서 공식 처리기 사례
575개와 CRUDUI JSON 사례 50개가 모두 통과했습니다. 파싱·직렬화·재구성을
검사합니다. 후보 런타임은 PHP 처리기 모드 검사와 네 서버 전송 검사도
통과했습니다.

PHP·Go·Rust 생성기와 독립 C PHP 확장을 구현했습니다. 공통 생성기 보고서는
JavaScript·PHP·Go·Rust·네이티브 PHP에서 각각 153개와 입력 불변 검사 1개를
통과하여 총 766개 통과, 실패 0개입니다. 보고서는 입력 640개를 기록하고
실행 중 변경되지 않았음을 확인했습니다. PHP API는 세 구성에서 각각 352개,
검증은 두 PHP 구현에서 각각 94개를 통과했습니다.

현재 직접 C 소스 리비전은 PHP 8.5.10, Node.js 26.8.1, Go 1.27.0, Rust
1.98.1을 사용하는 macOS arm64에서 `make test-native`를 통과했습니다. C 확장을
빌드하고 로드한 뒤 패키지 검사, 프로토콜 검사 19개, 생성기 보고서 766/766개와
위젯·시간대 검사를 완료했으며 종료 상태는 0이었습니다. 이 결과는 검증한 코드에
해당하며 확장과 비교 서비스는 계속 배포하지 않은 상태입니다.

폼 검사는 코어 86개, React 701개, Vue 344개, Svelte 345개, Svelte 마운트
검사 10개와 HTML 정규화 검사 6개가 통과했습니다. 패키지 exports, 소비자 타입,
프로덕션 빌드와 세 프레임워크 소비자 브라우저 검사도 통과했습니다.
Chromium 위젯·시간대 검사 3개와 `make docs-check`가 통과했습니다.
깨끗한 소스 아카이브에서 폼 비교 소스 검사 136개, 생성기 구성 검사 10개, 폼 비교
Chromium 검사 3개, 공개 패키지 검사 9개, 반복 빌드 검사 1개, 폼 검사기 검사
18개와 폼 검사기 브라우저 CSS 검사 6개가 통과했습니다. 교차 검사 렌더링 33개도
통과했습니다.

커밋 `e2e1af01`로 만든 일반 사용자 Linux arm64 이미지에서 전체
`make test-native` 명령이 통과했습니다. 확장을 다시 빌드하고 로드한 뒤
PHP·Go·Rust 패키지 검사, PHP API·검증 검사, 프로토콜 검사 19개, Chromium
위젯·시간대 검사 3개를 실행했고 생성기 보고서도 766/766으로 완료했습니다.
이미지 index digest는
`sha256:0612f157880aa4bd9ff05a64dc6044969d0736117164cafec466e45d53c64c02`,
보고서와 실행 로그 SHA-256은 각각
`3f8a91ccbbdaf72c116f2749aa4b6f5cee0975567f6edcbe1372e602cdcf7442`,
`378f4e3a63a88823b3a15b88859237332c27d36f43ee89bd62f9ad03cd38b0b1`입니다.

저장소 루트 빌드·검사 진입점은 직접 import하는 모든 외부 패키지를 루트
매니페스트에 선언합니다. 의존성 검사는 `make test-native`가 실행하는 Node.js
진입점을 검사하며 직접 import한 패키지가 선언되지 않으면 실패합니다. 커밋
`757f144b9c4b5e2dd5f5dfd91c09362b3edbcedd`에서 의존성 검사 6/6이
통과했습니다. macOS arm64에서 PHP 8.5.10, Node.js 26.8.1, Go 1.27.0, Rust
1.98.1로 실행한 전체 `make test-native`도 종료 상태 0을 반환했습니다. PHP 검사
160개, Rust 검사 20개, 모든 Go 패키지 검사, 프로토콜 검사 19개, 생성기 보고서
766/766과 Chromium 위젯·시간대 검사 3개가 통과했습니다.

후보 `e1bb6f2055532b46301285e20758d073d1cbb432`는 커밋한 소스 아카이브
하나를 사용하며 압축 해제 전에 커밋과 SHA-256 digest를 검증합니다. 소스 아카이브의
SHA-256은
`34ac7c5ee13b311001920cd3ac7a86d86076122db6c5b96438439e25872c40a6`입니다. 이미지
`localhost/crudui-form-comparison:e1bb6f205553`의 index digest는
`sha256:e0fa7f38083e002b7abd1e989ac743843cab3a474d7dd732925ccf54d8289b5b`입니다.
이미지 구성에서 소스 검사 152개와 라이브러리 검사 10개가 통과했습니다. 이미지는
애플리케이션 사용자로 Chromium 프로세스 검사를 통과했고 같은 아카이브에서 PHP,
PHP 확장, Go, Rust 서버를 각각 하나씩 시작했습니다.

생성·SSR 검사 450개는 HTTP 요청 899개에서 모두 통과했습니다. 여기에는 빌드된 프레임
문서, 레코드 페이로드가 있는 SSR 폼 HTML, 모든 서버의 잘못된 SSR 요청 거부가 포함됩니다.
저장·검증 검사 120개도 모두 통과했고 PHP 두 모드는 각각 생성 검사 62개를 통과했습니다.
브라우저 집계는 시나리오 1,216개, 초기화 비교 5,376개, 상호작용 320개,
로드 전 마운트 32개, 프레임 문서 64개를 실패 없이 통과했습니다. PHP는
340,871밀리초, PHP 확장은 306,669밀리초, Go는 276,126밀리초, Rust는
265,581밀리초에 완료했습니다. 모든 서버는 900,000밀리초 제한 이내에
완료했습니다. 집계는 `complete: true`, `passed: true`, `failedChecks: 0`,
`performancePassed: true`를 기록합니다. 브라우저 집계, 생성 보고서, 서버 보고서의
SHA-256은 각각
`58d68d091d647a2160c1dffd93288b8c3e8ac5eb507f5f18cc190779be681c08`,
`8d26bb7b8b5ff4731e71718425cd4f57ad716ef56ae6c5010fd25c7d4716c295`,
`7898bbb381f265ae885c6eb413ada7f4c54ebd72ea186f9038549977225fed40`입니다.
후보 이미지는 로컬에 있으며 패키지와 비교 서비스는 배포하지 않았습니다.

## 이전 검증기와 패키지 검증

프로세스 응답 검사 35개와 실제 JavaScript·PHP·Go·Rust CLI 실행을 포함한
비교 콘솔 검사 116개가 모두 통과했습니다. 최초 회귀 사례 8개는 응답 파서
수정 전에 실패했습니다. 필드 누락, 잘못된 타입, 모순된 결과, 프로세스
실패는 이제 비교 실패로 처리합니다. 이 결과는 콘솔 파서와 현재 CLI를
검증하며 이후 구현한 네이티브 생성기는 검증하지 않습니다.

구형 스펙 변환의 내부 식별자를 수정한 뒤 validator 패키지 빌드와 검사
1,606개가 모두 통과했습니다.

validator 출력을 제거하고 다시 빌드한 뒤 CLI 검사 37개가 모두 통과했습니다.
문서의 명령 네 가지와 실패 종료 코드 검사 두 가지도 통과했습니다. CLI CI는
테스트 전에 validator를 빌드합니다. 이 로컬 결과는 패키지 게시를 의미하지
않습니다.

패키지 검사는 `a5b4491`에 커밋된 의존성 그래프를 사용합니다.
`npm ci`, 공개 선언과 export 검사 5개, 반복 빌드 출력 검사 1개, 별도 소비자
타입·프로덕션·세 프레임워크 브라우저 검사가 통과했습니다. 폼 검사는 코어
29개, React 692개, Vue 344개, Svelte 345개와 마운트 검사 3개, 정규화 검사
6개가 통과했습니다. JavaScript 검증 1,606개와 PHP 1,418개가 통과했습니다.
Go와 Rust 패키지 테스트도 통과했습니다.

새 Composer 설치는 PHP 의존성 26개의 버전·소스 참조를 모두 재현했습니다.
설치한 의존성으로 PHP 테스트·네 언어 구형 비교·공용 검증 콘솔이 통과했습니다.
PHP CI 작업은 잠금 파일로 설치하며 생성된 의존성과 컴파일한 Go 실행 파일은
Git에서 제외합니다.

`multiple.min`을 포함한 후 스키마 고정 사례 56개가 통과했습니다. 이후 스키마
설명 변경은 파싱한 검증 규칙을 유지했습니다. 현재 문서의 문서 검사도
통과합니다. 이 검사는 패키지 게시나 릴리스 완료를 증명하지 않습니다.

## 보존 폼 비교 결과

보존 외부 `https://crudui.test/` 환경은 라이브러리 `dfe70a6`을 사용하며
PHP·네이티브 JSON 파싱을 사용하는 PHP·Go·Rust를 독립적인 HTTP 대상으로 실행합니다.
HTTP 검사 240개와 PHP 처리 모드 검사가 모두 통과했습니다.

두 PHP 대상은 모두 PHP 검증기를 사용합니다. 이 보존 결과는 현재 CRUDUI
네이티브 폼 생성이나 검증 통합을 증명하지 않습니다.

| 서버 | 검증 리비전 | 시나리오 | 상호작용 | 페이지 오류 |
| --- | --- | --- | --- | --- |
| PHP | `83181c2` | 120/120 통과 | 30/30 통과 | 0 |
| 네이티브 JSON 파싱을 사용하는 PHP | `83181c2` | 120/120 통과 | 30/30 통과 | 0 |
| Go | `83181c2` | 120/120 통과 | 30/30 통과 | 0 |
| Rust | `83181c2` | 120/120 통과 | 30/30 통과 | 0 |

각 대상은 React·Vue·Svelte의 폼 전송과 ordered JSON 전송을 검사합니다.
보고서는 초기 데이터, 나중 주입, 반복 주입, 레코드 복원, HTML 원문, DOM,
CSS, 입력 상태와 행 연산을 포함합니다. 근거는 외부 비교 작업 공간의
`.form-comparison/results-83181c2/report-<server>.json`에 저장합니다.
보고서 메타데이터는 소스 리비전을 기록합니다. 상호작용 검사 전체 108개는 비교 모드 네 가지의
합계이며 그중 30개가 현재 구현에 해당합니다.

두 리비전 사이의 TypeScript 파일 5개는 API 주석과 사용하지 않는 타입 import만
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

## 예제와 배포

레거시 예제는 `examples/legacy`를 사용합니다. 로컬 프론트엔드 빌드, Go 테스트,
Rust 컴파일, PHP API 테스트와 Node HTTP 테스트가 통과했습니다. 프론트엔드
예제 세 가지와 Node·PHP·Go·Rust의 Linux 이미지가 빌드됐습니다. 서버 이미지
네 가지의 HTTP 유효·무효 사례가 통과했습니다. PHP PSR-4 자동 로딩 생성은
애플리케이션 클래스 제외 없이 통과했습니다. 데모·Playground와 Bootstrap의 폼 페이지에서 브라우저 렌더링·입력 검사가
통과했습니다. Bootstrap 상품 페이지는 중첩 데이터도 확인했습니다.

라이브러리 배포는 패키지 게시를 의미하며 게시된 패키지는 없습니다.
비교 애플리케이션은 독립된 외부 작업 공간에 보존하며 표는 서버별로 완료된 최신 검사를 기록합니다.
네 서버의 `83181c2` 브라우저 검사가 완료되었습니다. 보존된 비교 구현의 실패는 보고서에 유지합니다.

TypeScript·Go·Rust·PHP API 생성과 엄격한 정적 사이트 빌드가 통과했습니다.
전체 문서를 두 번 생성한 API 문서·네이티브 HTML 자산·스키마 출력은 동일했습니다.
생성 실패 검사 8개와 폼 원문 검사기 18개가 통과했습니다.
