# 폼 검증

[English](verification.md).

저장소 루트에서 유지하는 패키지·폼 검사를 실행합니다.

```sh
npm run test:dependencies
npm run typecheck
make test-validators
make test-native
npm run test:forms
npm run test:form-comparison
npm run test:form-comparison:pipeline
npm run test:inspector
npm run test:packages
make conformance
make docs-check
```

트리 검증 전에 같은 소스 트리에서 모든 명령이 종료 상태 0을 반환해야 합니다.
`npm run test:dependencies`는 패키지 선언과 설치 정책을 검사합니다.
`npm run typecheck`는 모든 TypeScript 패키지의 타입을 검사합니다. `make test-validators`는
TypeScript, PHP, Go, Rust 검증기 테스트 모음을 실행합니다. `make test-native`는 PHP 확장을
빌드하고 엔진·빌더·API 테스트(`make test-php-extension`)를 실행한 뒤 PHP, Go, Rust, 공통
프로토콜, 생성기 검사와 Chromium 위젯·시간대 검사를 실행합니다.
`npm run test:form-comparison:pipeline`은 이 트리에서 다섯 레코드 서버(`.form-comparison/sources/ordered-json`의
OrderedJSON 체크아웃, 두 PHP 확장, Go 바이너리, Rust 바이너리)를 빌드하고, 다섯 서버 모두에
레코드 저장소 HTTP 계약을 실행하고, Go·Rust 서버 테스트를 실행한 뒤, 로컬 구성에서 서버·
클라이언트·초기화 방식 40개 조합의 정본 List → Detail → Form → Save → List refresh 검사를
실행합니다. `php-config`가 있는 PHP, Composer, Go, Rust, Chrome이 필요합니다.
`npm run test:inspector`는
폼 스냅샷과 브라우저 검사기 테스트를 실행합니다. `make conformance`는 근거를 기록하며
테스트 모음을 다시 실행하고 그 근거를 검사합니다([적합성 근거](../spec/conformance.ko.md)).
모든 테스트는 [테스트 실행기](testing.ko.md#테스트-실행기)로 실행합니다. 아래 트리 검증은
HTTP와 브라우저 통합을 검사합니다. 저장소 검사 성공은 트리 검증을 대체하지 않으며 트리 검증
성공도 저장소 검사를 대체하지 않습니다.

폼 검사기는 검사 대상 폼을 변경하지 않고 HTML 원문, 파싱한 DOM, 계산된
스타일, 현재 입력 상태를 비교합니다. 프레임워크 초기화 테스트는 초기 데이터와
생성 후 주입·레코드 복원을 비교합니다.
[JSON 순서 검사](ordered-json.ko.md)는 전송 표현을 별도로 검증합니다.

HTTP·브라우저 검증기는 이 저장소에서 관리합니다. 검증기는 커밋 여부와 관계없이 현재 저장소
트리를 대상으로 `https://crudui.test`의 장기 실행 비교 컨테이너 안에서 실행합니다. 배포를
적용한 뒤 그 컨테이너가 실행하는 트리를 검증합니다.

```sh
make deploy
make deploy-verify
```

`make deploy`는 `examples/form-comparison/comparison-deployment.mjs`를, `make deploy-verify`는
`examples/form-comparison/verification.mjs`를 실행합니다. deployment는 user account에 하나뿐입니다:
Compose project `crudui` 하나와 그 container, volume입니다. 그래서 두 program은 다른 step보다 먼저 user
범위 holder lock `form-comparison-deployment`를 잡고 끝날 때 해제합니다. lock을 잡은 다른 checkout의
실행이 있으면 그 checkout, pid, process 시작 시각과 함께 거부됩니다
([함께 쓰는 resource](testing.ko.md#함께-쓰는-resource)).

배포 명령은 `examples/form-comparison/Containerfile`이 바뀌었을 때만 툴체인 이미지를
빌드합니다. 저장소를 읽기 전용으로 마운트하고 빌드 산출물은 `crudui-comparison-build`와
`crudui-comparison-cache` 볼륨에 둡니다. 예상 컨테이너가 예상 이미지로 실행 중이고 containerctl이
`crudui.test`를 그 컨테이너로 route하면 기존
컨테이너를 통해 소스만 동기화하며 컨테이너를 재생성하거나 서비스를 재시작하거나 볼륨을
다시 연결하지 않습니다. 컨테이너가 없거나 중지되었거나 이미지가 다르거나 route가 적용되지 않았을 때만 containerctl로 정의를 적용합니다.
명령은 실행 중인 서비스의 데이터를 보존하고 사용하지 않는 비교 이미지와 더 이상 쓰지 않는
커밋별 디렉터리를 제거합니다.

두 명령 모두 조용히 기다리지 않고, 장기 작업에 시간 한도를 두지 않습니다. 모든 단계는 시작, 실행
중 15초마다 경과 시간, 완료 시 소요 시간을 출력하고, 끝까지 실행하며 종료 상태로 판정합니다.
브라우저 보고서나 정본 흐름 조합처럼 검사 안의 단위만 자기 제한 시간을 가집니다. 정의에는
healthcheck가 없으므로 containerctl은 컨테이너가 실행되면 돌아옵니다. 배포 명령은 실행 중인
supervisor 빌드 대상을 출력한 뒤, 모든 빌드 단계를 출력하며 시간 한도 없이 이 체크아웃의 빌드를
기다립니다.

소스 변경은 소스 감시기가 게시합니다. 서비스가 working tree를 따르는 동안 호스트의 터미널에서
실행합니다.

```sh
make deploy-watch
```

감시기는 모든 파일 이벤트와 supervisor에 전달하는 모든 신호를 출력하고, 시간 한도가 없으며, 실패한
감시나 전달의 오류로 끝나고, Ctrl-C(`SIGINT`)나 `SIGTERM`에서 전달한 신호 수를 적은 줄과 함께 멈춥니다.
`make deploy`는 빌드를 기다리기 전에 스스로 supervisor에 한 번 신호합니다. 감시기가 없으면 서비스는 마지막으로 비교한 트리를 유지합니다. 신호마다
supervisor가 변경 파일을 빌드 트리에 복사하고 영향받는
대상만 다시 빌드하며 영향받는 서버만 다시 시작합니다. PHP 소스 변경은 다음 요청에 적용됩니다.
supervisor 모듈 변경은 기존 컨테이너 안에서 supervisor 프로세스를 다시 로드해 적용하며,
모든 볼륨을 유지합니다.

컨테이너는 빌드 트리에서 JavaScript 레코드 서버를 겸하는 공개 서버, PHP, PHP 확장, Go,
Rust 프로세스를 각각 하나씩 실행합니다. PHP는 Composer 클래스를 사용하고 PHP 확장 프로세스는 `ordered_json.so`와
`crudui.so`를 함께 로드합니다.

검증 명령은 컨테이너 안에서 Chromium 샌드박스를 활성화하고 비특권 사용자로 실행합니다.
현재 빌드 주기를 제한 시간 없이 기다리며 새 빌드 단계와 15초마다의 경과 시간을 출력하고 ready를
요구한 뒤 배포한 서비스의 검사를 실행합니다. 이 컨테이너가 빌드한 확장을 로드하는 처리 모드
검사, 실행 중인 네이티브 서버 네 개를 대상으로 하는 생성·저장 검사, 배포한 페이지의 40개 조합
정본 흐름 검사입니다.
위 명령이 이미 이 호스트에서 실행했고 컨테이너의 빌드 산출물을 읽지 않는 소스 스위트,
Go·Rust 서버 테스트, ordered JSON 테스트는 되풀이하지 않습니다.

전체 생성 검사는 결과 450개, 요청 899개와 서버·렌더링 경로·프레임워크 필수 조합
32개를 요구합니다. compile, 유지한 직렬화 템플릿 render, 빌드된 프레임 문서, SSR 폼 HTML
원문과 레코드 페이로드, 영어·한국어 출력, 잘못된 SSR 요청 거부, 잘못된 데이터 거부와
저장 레코드 불변을 검사합니다. 저장 검사는
네 서버·두 렌더링 경로의 결과 120개를 요구합니다.

이후 PHP, PHP 확장, Go, Rust 브라우저 검사를 동시에 실행하고 집계 보고서를 생성합니다. 각
검사는 자기 브라우저 프로세스를 사용하므로 측정한 포커스·선택 범위·스크롤은 그 검사에만
속하고, 각 서버는 자기 저장 레코드를 사용합니다. 컨테이너에는 이를 위한 프로세서 여덟 개가
있으며 검사 하나가 약 하나를 사용합니다.

정본 흐름 검사는 각 조합을 자기 제한 시간을 가진 단위 하나로 실행하고 시작, 15초마다 경과
시간, 소요 시간을 포함한 결과를 출력합니다. 40개 조합과 저장소 초기화 5개가 모두 통과해야
합니다.

집계는 시나리오 1,216개, 초기화 비교 5,376개, 상호작용 320개, 마운트 32개, 일치하는 프레임
문서 64개의 통과를 요구합니다. 어떤 실행도 소요 시간 예산이나 전체 제한 시간을 가지지
않습니다. 단위마다 가장 느린 측정값의 세 배인 자기 제한 시간을 가지며(32초로 측정한 초기화
보고서는 100,000밀리초, 2초로 측정한 시나리오 보고서는 10,000밀리초), 브라우저 검사는 단위가
실패하거나 제한 시간에 도달할 때만 실패합니다. 실패·누락·잘못된
형식·시간 초과 결과가 있으면 종료 상태 1을 반환합니다. 실행 중에 소스가 바뀌면 종료 상태 1을 반환합니다. 어떤 보고서가 다른 소스 식별자를
명시하거나 근거의 식별자가 체크아웃의 식별자와 다를 때도 종료 상태 1을 반환합니다. 명령은
요청을 재시도하거나 sleep 간격을 사용하지 않습니다.

보고서, 스크린샷, 소스 식별자·빌드 주기·검사·합계를 기록한 `verification.json`은 다음
검증 전까지 `.form-comparison/deployment/results/`에 유지합니다. 기록된 검증은 그 기록이
명시한 식별자에 대해서만 근거가 됩니다. 저장소에 더 이상 없는 커밋을 포함해 다른 커밋이나 다른
커밋하지 않은 변경을 명시한 기록은 체크아웃을 검증하지 않으며 `make deploy-verify`를 다시
실행해야 합니다.

패키지 게시는 별도 작업입니다. 검증은 게시 상태를 변경하지 않습니다.
소스 변경을 적용하기 전에 기존 컨테이너와 정확한 마운트를 검사합니다. 재사용 조건을 만족하면
컨테이너와 모든 볼륨을 실행 상태로 유지하고 supervisor가 읽기 전용 source 마운트를 동기화하게
합니다. 빌드나 상태 검사 실패의 복구 수단으로 `down`을 사용하지 않으며, 진단을 위해 상태를
보존하고 실패한 빌드나 프로세스 작업만 다시 시도합니다.
