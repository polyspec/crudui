# 기능 상태

[English](features.md)가 정본입니다. 계약은 [명세](spec/form-runtime.ko.md)에 정의합니다.
테스트와 배포를 별도로 기록합니다. `pending`은 통과 결과가 아닙니다.

| ID | 기능 | 구현 | 검증 | 배포 | 근거 |
| --- | --- | --- | --- | --- | --- |
| form-template | 데이터와 독립된 폼 템플릿과 JSON 캐시 | implemented | passed | not-deployed | [코어 테스트](../packages/generator-core/src/form.test.ts) |
| form-rows | 중첩 행 작업 범위와 저장 후 seq 키 적용 | implemented | passed | not-deployed | [코어 테스트](../packages/generator-core/src/form.test.ts) |
| form-browser | 세 프레임워크의 데이터 주입과 행 작업 | implemented | passed | not-deployed | [공용 DOM 사례](../tests/fixtures/form-session/scenario.mjs) |
| form-typing | input 교체 중 전체 타이핑과 포커스 유지 | implemented | passed | not-deployed | [브라우저 상호작용 검사](../examples/form-comparison/check-interaction.mjs) |
| form-empty-focus | 빈 컬렉션의 첫 행 생성 후 포커스 | implemented | passed | not-deployed | [공통 DOM 사례](../tests/fixtures/form-session/scenario.mjs) |
| form-focus | 행 연산의 포커스, 선택, 스크롤 유지 | implemented | passed | not-deployed | [브라우저 상호작용 검사](../examples/form-comparison/check-interaction.mjs) |
| keyed-validation | 네 언어의 키를 유지하는 그룹·단일 값 검증 | implemented | passed | not-deployed | [공용 검증 사례](../tests/fixtures/validate/cases.json) |
| docs-check | 문서 링크·번역·상태 검사 | implemented | passed | not-deployed | [문서 관리 절차](operations/documentation.ko.md) |
| form-comparison | 원본과 13자리 브라우저 비교 | implemented | failed | deployed | [브라우저 검사](../examples/form-comparison/check.mjs) |
| form-persistence | 키 기반 네이티브 제출과 JSON 문서 순서 영속 저장 | implemented | passed | deployed | [영속 저장 사례](../examples/form-comparison/src/frame.mjs) |
| original-keyed-proof | 원본 공개 함수의 키 편집, 영속 저장, 캐시 바인딩 | implemented | failed | deployed | [비교 계약](spec/form-comparison.ko.md) |

`5e517a2` 라이브러리 검증(2026-09-07): `npm run test:forms`, TypeScript 검증기, PHP/Go/Rust 검증 적합성,
콘솔 SSR 테스트, CLI 테스트, 린트, 타입 검사, `make docs-check`가 통과했습니다.
API 생성, 스키마 생성, 문서 사이트 빌드도 통과했습니다. 라이브러리의 배포 상태는
패키지 게시를 기준으로 하며 게시한 패키지는 없습니다. 폼 비교 예제은 Apple container의
[localhost:4317](http://localhost:4317)에 로컬 배포했습니다. 원격 배포는 실행하지
않았습니다.

## 폼 비교 예제 결과

기본 비교는 원본 `1e8702a` 공개 함수와 현재 런타임 `a96f8c3`에 동일한 13자리 키
데이터를 제공합니다. 원본 소스는 수정하지 않습니다. 원본 예제는 컨트롤러와 캐시
바인딩을 추가하며 현재 예제는 라이브러리 세션을 사용합니다. 두 예제는 네이티브 필드와
키 JSON을 각 버전의 PHP 검증기와 독립된 JSON 저장소에 제출합니다.
[localhost:4317](http://localhost:4317)에서 [검사 절차](operations/form-comparison.ko.md)를
실행합니다.

2026-09-07 09:18 UTC에 Chrome 149.0.7827.22, Node 26.8.1, Apple container의
PHP 8.4.24로 현재 비교 코드를 검증했습니다.

| 프레임워크 | 원본 키 예제 | 현재 키 런타임 | 유지한 배열 진단 |
| --- | --- | --- | --- |
| React | 15개 통과, 2개 실패 | 17개 통과 | 13개 통과, 4개 실패 |
| Vue | 15개 통과, 2개 실패 | 17개 통과 | 13개 통과, 4개 실패 |
| Svelte | 15개 통과, 2개 실패 | 17개 통과 | 13개 통과, 4개 실패 |

실제 포인터, 키보드, 체크박스 검사 27개가 모두 통과했습니다. 최초 요청 검사 아홉
개는 PHP 데이터 로드 전에 중첩 input이 있음을 확인했습니다. 물리적인 테이블 순서
변경 후 위치에 따른 재구성을 포함해 두 버전의 PHP 저장소 검사가 통과했습니다.
브라우저 페이지 오류는 없었습니다. 비교 실행기는 원본 예제의 기록된 실패를
실패로 유지하므로 종료 코드 1을 반환했습니다.

원본 키 예제는 숨김 필드 제외, 중첩 input 이름, 추가, 현재 값 복사, 하위 행 독립
편집, 정렬, 데이터 주입, PHP 검증, 영속 저장, 저장 키 갱신, 부모 관계, 삭제,
JSON 문서 순서를 통과합니다. ID `[5, 7, 1]`은 식별자를 유지하며 삽입은 ID 8,
복사는 ID 9를 생성하고 저장 순서는 seq 크기와 독립적입니다. 이 결과는 원본의
기반이 중첩 키 데이터를 지원함을 확인합니다. 모든 연산이 이미 구현되었거나 배열
위치가 행 식별자를 대체할 수 있었다는 근거는 아닙니다.

원본 공개 함수 `composeProperties`, `buildField`, `makeTranslate`를 사용하는 캐시
바인딩이 통과합니다. 예제는 데이터 바인딩 전에 구조를 준비하고 직렬화한 후 JSON
캐시를 복원하여 다른 레코드에 재사용합니다. 합성 참조를 한 번 읽으며 이후 로더
호출은 실패합니다. 두 키 어댑터는 같은 캐시 동작 검사를 통과합니다. 유지한 배열
어댑터의 캐시 실패는 반복된 `buildForm` 호출을 나타내며 원본 공개 함수가 캐시
바인딩을 지원할 수 없다는 근거는 아닙니다.

원본 키 예제는 원본 렌더러가 명시적인 빈 컬렉션에 숫자 인덱스 행 하나를 생성하여
`exact`와 `empty`에 실패합니다. 이 행은 화면에 표시되며 네이티브 제출 시 숫자 키가
거부됩니다. 두 검사는 같은 렌더러 결함을 확인합니다. 현재 런타임은 명시적인 빈
컬렉션에 행을 출력하지 않아 두 검사를 통과합니다. 비교 예제는 결과를 바꾸기 위해
생성된 행을 제거하거나 명시적인 빈 값을 채우지 않습니다.

두 키 구현의 행 연산 사례는 같은 전체 하위 행 픽스처를 사용합니다. 별도 `exact`와
`empty` 사례는 빈 부서 픽스처를 유지합니다. 행 편집과 영속 저장을 빈 컬렉션
출력과 독립적으로 검사할 수 있습니다.

JSON 처리는 별도 순서나 식별자 필드 없이 문서 멤버 순서를 행 순서로 사용합니다.
순서를 유지하면 저장 순서도 유지하며 문서 멤버 순서를 편집하면 저장 순서와 화면
순서도 변경됩니다. 네이티브 제출은 컨트롤 순서를 사용합니다. PHP 저장소 로드는
테이블의 물리적인 레코드 순서와 무관하게 저장된 위치로 두 폼을 재구성합니다.

이전 배열 진단도 선택할 수 있습니다. 실패 네 개의 원인은 예제가 추가한 숨김 seq
필드(`identity`), 렌더러의 빈 행 생성(`exact`, `empty`), 예제의 캐시 바인딩
미구현(`cache`)입니다. 승인된 대체 구현은 아닙니다. 별도의 키 기반 입력 사례도
원본 렌더러와 원본 PHP 검증기에서 통과합니다.

비교 구현, 소스 스냅샷, 이전 검사 결과를 유지하며 저장소 정리는 시작하지 않았습니다.
브라우저 실행기는 실패한 시나리오가 있으면 종료 코드 1을 반환하며 진단 실패를
통과로 변경하지 않습니다. SQL 데이터베이스 드라이버와 외부 편집기 위젯은 이 환경의
검사 범위에 포함하지 않습니다.
