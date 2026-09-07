# 기능 상태

[English](features.md)가 정본입니다. 계약은 [명세](spec/form-runtime.ko.md)에 정의합니다.
테스트와 배포를 별도로 기록합니다. `pending`은 통과 결과가 아닙니다.

| ID | 기능 | 구현 | 검증 | 배포 | 근거 |
| --- | --- | --- | --- | --- | --- |
| form-template | 데이터와 독립된 폼 템플릿과 JSON 캐시 | implemented | passed | not-deployed | [코어 테스트](../packages/generator-core/src/form.test.ts) |
| form-rows | 중첩 행 작업 범위와 저장 후 seq 키 적용 | implemented | passed | not-deployed | [코어 테스트](../packages/generator-core/src/form.test.ts) |
| form-browser | 세 프레임워크의 데이터 주입과 행 작업 | implemented | passed | not-deployed | [공용 DOM 사례](../tests/fixtures/form-session/scenario.mjs) |
| form-typing | input 교체 중 전체 타이핑과 포커스 유지 | implemented | passed | deployed | [브라우저 상호작용 검사](../examples/form-comparison/check-interaction.mjs) |
| form-empty-focus | 빈 컬렉션의 첫 행 생성 후 포커스 | implemented | passed | deployed | [공통 DOM 사례](../tests/fixtures/form-session/scenario.mjs) |
| form-focus | 행 연산의 포커스, 선택, 스크롤 유지 | implemented | passed | not-deployed | [브라우저 상호작용 검사](../examples/form-comparison/check-interaction.mjs) |
| keyed-validation | 네 언어의 키를 유지하는 그룹·단일 값 검증 | implemented | passed | not-deployed | [공용 검증 사례](../tests/fixtures/validate/cases.json) |
| docs-check | 문서 링크·번역·상태 검사 | implemented | passed | not-deployed | [문서 관리 절차](operations/documentation.ko.md) |
| form-comparison | 원본과 13자리 브라우저 비교 | implemented | passed | deployed | [브라우저 검사](../examples/form-comparison/check.mjs) |
| form-persistence | 키 기반 네이티브 제출과 JSON 문서 순서 영속 저장 | implemented | passed | deployed | [영속 저장 사례](../examples/form-comparison/src/frame.mjs) |
| ordered-json-check | 언어별 JSON 문서 순서 검증 | implemented | passed | not-deployed | [처리기 검사](../examples/form-comparison/check-ordered-json.py) |
| form-client-validation | 사용자 제출 전 기존 JavaScript 검증 | implemented | passed | deployed | [브라우저 상호작용 검사](../examples/form-comparison/check-interaction.mjs) |
| original-empty-correction | 원본 출력 수정과 빈 컬렉션 전체 처리 과정 | implemented | passed | deployed | [비교 계약](spec/form-comparison.ko.md) |
| original-keyed-proof | 원본 공개 함수의 키 편집, 영속 저장, 캐시 바인딩 | implemented | failed | deployed | [비교 계약](spec/form-comparison.ko.md) |

`5e517a2` 라이브러리 검증(2026-09-07): `npm run test:forms`, TypeScript 검증기, PHP/Go/Rust 검증 적합성,
콘솔 SSR 테스트, CLI 테스트, 린트, 타입 검사, `make docs-check`가 통과했습니다.
API 생성, 스키마 생성, 문서 사이트 빌드도 통과했습니다. 라이브러리의 배포 상태는
패키지 게시를 기준으로 하며 게시한 패키지는 없습니다. 폼 비교 예제은 Apple container의
[localhost:4317](http://localhost:4317)에 로컬 배포했습니다. 원격 배포는 실행하지
않았습니다.

## JSON 처리기 결과

2026-09-07 JSON 처리기 검증은 ordered-json 커밋 `deb1b354`를 사용했습니다.
JavaScript, PHP, PHP 확장, Go, Rust에서 각각 처리기 사례 115개와 Polyspec
전송 고정 데이터 10개가 통과했습니다. 호스트는 macOS arm64의 Node 26.8.1,
PHP 8.5.10, Go 1.27.0, Rust 1.98.1을 사용했습니다. 전송 사례는 순서,
13자리 키, 신규·복사·저장한 행 표현, 빈 객체와 배열의 자료형을 검사합니다.
폼 행 조작을 실행하는 검사는 아닙니다. 런타임 연동은 변경하지 않았으며 로컬
실험 환경은 표준 JSON 함수를 사용합니다.
[검증 절차와 범위](operations/ordered-json.ko.md).

## 폼 비교 예제 결과

주 비교는 원본 소스 `1e8702a`에 명시적인 빈 컬렉션 출력 수정 `78723bb`를 적용한
구현과 현재 런타임 `b516226`을 사용합니다. 원본 기반 예제는 캐시 바인딩과 행
컨트롤러를 추가하며 현재 런타임은 라이브러리 세션을 사용합니다. 두 구현은 동일한
13자리 키 데이터, 기존 검증기, 독립된 JSON 저장소를 사용합니다. 숨김 seq 필드를
제출하지 않습니다. [localhost:4317](http://localhost:4317)에서
[비교 절차](operations/form-comparison.ko.md)를 실행합니다. 위 표의 `form-comparison` 상태는
이 두 주 비교 구현을 기준으로 합니다.

2026-09-07 10:15 UTC에 Chrome 149.0.7827.22, Node 26.8.1, Apple container의
PHP 8.4.24로 검증했습니다.

| 프레임워크 | 수정한 원본 | 현재 런타임 | 수정 전 원본 키 예제 | 유지한 배열 진단 |
| --- | --- | --- | --- | --- |
| React | 17개 통과 | 17개 통과 | 15개 통과, 2개 실패 | 13개 통과, 4개 실패 |
| Vue | 17개 통과 | 17개 통과 | 15개 통과, 2개 실패 | 13개 통과, 4개 실패 |
| Svelte | 17개 통과 | 17개 통과 | 15개 통과, 2개 실패 | 13개 통과, 4개 실패 |

실제 상호작용 검사 54개와 PHP 로드 전 마운트 검사 12개가 모두 통과했습니다.
상호작용 검사는 전체 타이핑, 포인터와 키보드 포커스, 선택, 스크롤, 조건 표시,
잘못된 제출 중단, 값을 수정한 후 제출 성공, 재로드 후 오류 제거를 포함합니다.
이 중 6개는 주 비교 구현의 빈 컬렉션에 키보드로 추가하는 동작을 확인합니다.
두 PHP 저장소 검사도 통과했습니다. 브라우저 페이지 오류는 없었습니다. 전체
실행기는 유지한 진단의 실패를 실패로 처리하므로 종료 코드 1을 반환했습니다.

예제는 사용자 제출 전에 기존 JavaScript 검증기를 실행하고 PHP는 독립적으로
검증합니다. 검증 규칙은 변경하지 않았습니다. 필수 필드의 빈 값은 디자인에 의해
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

추가 검증: 수정한 원본 코어 검사 21개, 원본 소스의 React 273개·Vue 273개·Svelte
363개 SSR 적합성 검사, 현재 런타임의 세 프레임워크 마운트 DOM 검사, 코어 타입 검사,
`make docs-check`가 통과했습니다. 기존 검증 사례 43개는 TypeScript, PHP, Go,
Rust에서 통과했습니다. TypeScript는 픽스처 실행 범위 검사도 통과했습니다. PHP 검증은
컨테이너에서도 확인했습니다.

예제는 Apple container에서 로컬 실행합니다. 패키지 게시와 원격 배포는 수행하지
않았습니다. 저장소 정리는 시작하지 않았습니다. SQL 드라이버와 외부 편집기 위젯은
이번 비교의 검증 범위에 포함하지 않습니다.
