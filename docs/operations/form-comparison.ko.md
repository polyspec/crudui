# 폼 비교 실행

[English](form-comparison.md). [계약](../spec/form-comparison.ko.md)과
[현재 결과](../features.ko.md)를 확인합니다.

## 시작과 검토

Apple container가 실행 중인 Apple silicon Mac을 사용합니다. 이 저장소 루트에서
다음 명령을 실행합니다. Linux 컨테이너는 Node 26.8.1과 PHP 8.4를 사용합니다.
Go 1.27.0과 Rust 1.98.0으로 검증기 소스 리비전별 독립 서버 실행 파일을 빌드합니다.

```sh
container system status
node examples/form-comparison/run.mjs start
```

[http://localhost:4317](http://localhost:4317)을 열고 PHP, Go, Rust를 선택한 후
React, Vue, Svelte를 선택합니다. 두 폼은 선택한 서버를 사용합니다.
왼쪽 폼은 원본 소스 `1e8702a`에 빈 컬렉션 수정 `78723bb`를 적용하고 예제 행
컨트롤러와 원본 공개 함수의 캐시 바인딩을 사용합니다.
오른쪽 폼은 13자리 세션 구현을 사용합니다. 두 폼은 숨김 seq 필드 없이 동일한 키
데이터를 사용합니다. 비교 대상 선택에서 수정 전 원본 키 렌더러와 이전 배열 진단도 제공합니다. 생성된 행 버튼은
추가, 복사, 정렬, 제거를 수행합니다. 상단 제어 버튼은
해당 프레임의 데이터 로드, 저장, 검증, 초기화를 수행합니다. 데이터 영역을 펼쳐
input 이름, 현재 값, 서버 파싱, 저장 레코드, 로드된 계층을 확인합니다.
“5 → 7 → 1” 버튼은 비연속 ID 픽스처를 불러와 직접 삽입, 복사, 정렬, 저장할 수
있도록 합니다.

각 프레임의 **전송 방식**에서 **네이티브 폼** 또는 **JSON**을 선택합니다.
저장은 기존 JavaScript 검증기를 실행하고 통과한 경우에만 선택한 표현을 해당 서버에
제출합니다. 두 방식은 해당 서버의 기존 검증기와 저장소를 사용합니다. JSON 요청은 `form`
아래의 키 구조를 유지하며 브라우저 직렬화, 서버 파싱, 응답 직렬화와 브라우저
파싱에 ordered-json을 사용합니다. 각 서버는 저장한 JSON 파일에도 같은 처리기를
사용합니다. 의존성은 `deb1b354`로 고정하며 준비 단계에서 소스를 프로젝트 캐시에
다운로드하고 아카이브 해시를 소스 정보에 기록합니다. 디자인에 의해 숨겨진 필수 필드를 포함해 필드 오류를
표시합니다. 선택한 서버는 해당 소스 버전으로 검증하고
회사, 스토어, 부서 행을 JSON 파일에 저장합니다. 재로드는 새로운 GET 요청을 수행하고
저장된 부모 ID로 중첩 데이터를 생성합니다. 키 예제는 응답받은 키 변경을 하위 행부터
부모 순서로 적용합니다. 유지한 배열 예제는 숨김 seq 필드를 선언하고 복사할 때
초기화합니다. 원본 예제들은 렌더링 인터페이스로 마운트된 폼을 갱신하고 입력 속성과
조건 표시를 동기화합니다. 배열 진단의 숨김 seq 필드는 승인된 식별자 계약을
충족하지 않으며 확인을 위해 유지합니다. 현재 결과는 기능 상태에 기록합니다.

JSON 검사는 기존 키 구조를 사용하며 문서 멤버 순서를 행 순서로 처리합니다.
문서 순서를 유지하는 경우와 편집하는 경우의 저장과 재로드를 검사합니다.
순서 필드나 다른 행 키 형식을 제출하지 않습니다. 별도의 키 기반 입력 사례는
숨김 식별자 필드 없이 원본 렌더러와 해당 서버 검증기를 확인합니다.

서버, 비교 예제와 프레임워크마다 `.form-comparison/data/`에
`<server>-<variant>-<framework>.json` 파일을 사용합니다. API 경로는
`/api/<server>/<action>/<variant>/<framework>`이며 예를 들면
`/api/go/save/keyed/react`입니다. Node 프로세스는 요청 바이트를 그대로 전달하며
PHP, Go, Rust가 각각 파싱, 검증, 저장과 재로드를 수행합니다.
저장은 해당 파일의 전체 계층을 교체합니다. 초기화와 자동 검사는 최초 레코드를
복원합니다. 컨테이너를 제거해도 호스트 파일은 유지합니다. 이 환경은 로컬 개발용이며
패키지를 게시하지 않습니다.

## 검증

화면의 “모든 서버와 프레임워크 검사”는 세 서버와 세 프레임워크에서 빈 컬렉션을 수정한 원본, 수정 전
키 예제, 현재 키 런타임, 유지한 배열 진단에 전송 방식별로 동일한 19개 검사를
실행하여 보고서 72개와 시나리오 결과 1,368개를 생성합니다. 표는 선택한 서버와
프레임워크의 결과를 표시합니다. 각
시나리오의 결과를 PASS 또는 FAIL로 표시합니다. 다운로드는 이 결과를 내보냅니다.
헤드리스 실행기는 36개 서버·예제·프레임워크 조합과 두 전송 방식에 실제 포인터, 키보드, 체크박스,
제출 검증 상호작용 검사 288개도 실행합니다. 주 비교의 두 구현에서는 빈 컬렉션
추가의 키보드 검사 36개를 추가로 실행합니다. 검증 검사는 실제 HTTP Content-Type과
JSON 본문을 확인합니다. 동등성 사례는 같은 편집·복사 데이터를 두 방식으로
저장하고 ID, 부모 관계, 위치, 재로드 값을 비교합니다. 잘못된 JSON 검사는
저장 레코드를 변경하지 않고 요청을 거부해야 합니다.
행 연산 검사는 하위 행이 있는 레코드를 사용하며 exact와
empty 검사는 빈 부서를 사용합니다. empty 검사는 선택 항목의 빈 값, 표시 여부,
중첩 및 전체 삭제, 삭제 후 추가, 네이티브와 JSON 저장·재로드, 형제 행 ID 유지도
확인합니다.
캐시 검사는 참조 읽기 1회를 확인하고 준비 이후의 로드를 거부합니다.
헤드리스 실행기는 각 예제의 최초 서버 로드 요청을 중단하고 중첩 input 요소가 이미
있는지 확인하며 36개 서버·예제·프레임워크 조합을 모두 검사합니다.
반복 가능한 헤드리스 브라우저 검사를 위해 저장소 의존성과 Puppeteer의 Chrome을
설치한 후 실행합니다.

```sh
npm ci
npx puppeteer browsers install chrome
node examples/form-comparison/check.mjs
node examples/form-comparison/check-typing.mjs
container exec polyspec-form-comparison node /workspace/keyed/examples/form-comparison/check-servers.mjs
container exec polyspec-form-comparison node --test /workspace/keyed/examples/form-comparison/src/json.test.mjs
container exec polyspec-form-comparison php /workspace/keyed/examples/form-comparison/test-json.php
container exec polyspec-form-comparison php /workspace/keyed/examples/form-comparison/test-repository.php
make docs-check
```

브라우저 실행기는 `.form-comparison/results/`에 `report.json`, `forms.png`,
`comparison.png`를 생성합니다. 실행 전에 이전 보고서와 스크린샷을 해당 보고서의
타임스탬프가 있는 파일로 보존합니다. 검사 실패, 결과 누락, 브라우저 오류가 있으면
종료 코드 1을 반환합니다. 원본 배열 진단의 실패는 보고서와 화면에서 실패로 유지하며
[기능 상태](../features.ko.md)에 기록합니다. 브라우저 검사가 실패해도 서버 검사, PHP 검사와
문서 검사 명령은 각각 실행합니다.
타이핑 실행기는 네 예제와 세 프레임워크에 문자당 0, 10, 50 ms 간격으로 실제
키보드 입력 36개를 검사합니다. 검증 오류 이후의 즉시 값, 렌더링 후 값, 포커스와
커서 위치를 확인하며 결과를 `typing-report.json`에 보존합니다.
공유 HTTP 실행기는 PHP, Go, Rust와 네 소스 예제에 180개 검사를 실행합니다.
검사 대상은 multipart·URL-encoded·JSON 저장과 재로드, 서버 간 결과 일치,
실제 파일 내용, 경로별 저장 키, 삭제, ID 재사용 방지, 필수 값 검증 실패,
문자열 필드 자료형, 요청 제한, 잘못된 초기 자료 이름, 물리적인 레코드 순서와
잘못된 파일 유지입니다. 검사 전 레코드를 복원하고 `.form-comparison/results/`에
`server-report.json`을 생성하며 이전 보고서는 타임스탬프로 보존합니다. 같은 저장소를
사용하므로 브라우저 검사 후 실행합니다. `check.mjs`에 `php`, `go`, `rust` 중 하나를
인수로 전달하면 해당 서버만 검사하고 별도 파일명으로 결과를 저장합니다. 중단된
브라우저 실행은 `incomplete-*.json` 보고서를 저장합니다.
PHP 저장소 검사는 새 인스턴스의 로드, 물리적 레코드
순서를 변경한 후 `position`에 따른 로드, 부모 관계, 거부한 트랜잭션의 파일 유지,
전체 삭제, 삭제된 ID의 재사용 방지도 확인합니다.

검증 중에는 모든 비교 구현, 스냅샷, 실행 환경을 유지합니다. 저장소 정리는 검증과
결과 검토 이후에 수행합니다.

## 확인, 재빌드, 종료

```sh
container logs polyspec-form-comparison
curl http://localhost:4317/api/go/load/keyed/react
curl http://localhost:4317/api/rust/load/keyed/react
curl http://localhost:4317/api/php/load/keyed/react
node examples/form-comparison/run.mjs stop
node examples/form-comparison/run.mjs start
```

재빌드 없이 종료하려면 `stop` 명령만 실행합니다. 해당 이름의 비교 컨테이너를
제거합니다. 빌드와 JSON 파일은 `.form-comparison/`에 유지하며 Git에서 제외합니다.
컨테이너를 시작하지 않고 아카이브를 준비하려면 다음 명령을 실행합니다.

```sh
node examples/form-comparison/run.mjs prepare
```

수정 커밋 `78723bb`는 `main` 이력에 포함합니다. 전체 복제를 사용하며 아카이브를
준비할 때 고정한 모든 소스 커밋이 로컬에 있어야 합니다.
화면은 전체 소스 커밋 ID와 Git 아카이브의 SHA-256 해시를 제공합니다.
소스들은 커밋된 npm 잠금 파일을 사용합니다. 잠금 파일에 네이티브 빌드 모듈의
macOS 패키지 항목만 있으므로 이미지에서 동일 버전의 Linux ARM64 모듈을 별도로
설치합니다. 소스의 프레임워크 의존성 버전은 변경하지 않습니다.
