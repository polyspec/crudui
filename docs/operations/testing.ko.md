# 테스트 실행

[English](testing.md).

저장소 루트에서 실행합니다. `npm ci --strict-allow-scripts`로 Node 의존성을
설치하고 PHP 패키지의
Composer 의존성을 설치하며 PHP·Go·Cargo를 `PATH`에서 실행할 수 있게 합니다. 비교 예제의 PHP 레코드
서버에는 `php-fpm`과 `nginx`도 필요합니다(Homebrew: `brew install php nginx`, Debian·Ubuntu:
`php8.x-fpm`과 `nginx`, 그리고 버전이 붙은 실행 파일을 가리키는 `php-fpm` 링크).
컴파일된 export를 검사하기 전에 JavaScript 패키지를 빌드합니다.

교차 검증 콘솔의 Rust 검증기 프로그램 릴리스 프로필은 `strip = "none"`을 사용합니다. 릴리스
빌드가 toolchain의 선택적 `rust-objcopy`·`libLLVM.dylib` 조합에 의존하지 않게 하며, 바이너리를
성공으로 보고한 뒤 strip 경고를 남기지 않게 합니다.
릴리스 프로필을 선언한 모든 크레이트는 `strip = "none"`을 설정하며,
`npm run test:runtimes`가 실행하는 `tests/build/rust-release-profile.test.mjs`가 이를 검사합니다.

`make ci`는 CI 워크플로의 모든 검사 명령을 워크플로 순서대로 실행하고, 적합성 증거를 모아 CI의 마지막
작업처럼 검사합니다. `tests/build/ci-local.test.mjs`는 이 목록이 `.github/workflows/ci.yml`과 다르면
실패합니다. 개별 명령은 다음과 같습니다.

```sh
composer --working-dir=packages/validator-php install
npm run build
npm test --workspace @crudui/validator
composer --working-dir=packages/validator-php test
node scripts/run-tests.mjs go --cwd packages/validator-go -- ./...
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml
npm test --workspace @crudui/cli
npm run test:forms
npm run test:packages
make docs-check
```

검증기 패키지 검사는
[사례 계약](../spec/test-fixtures.ko.md)의 공통 사례를 실행합니다. 구현 간 일치뿐
아니라 기대 검증 결과 또는 전체 실패 기록을 비교합니다. 패키지 검사는 export 파일,
선언·설치 컴파일·프로덕션 렌더링을 확인합니다.

## 린트

`npm run lint`는 저장소 전체에 ESLint를 실행합니다(`eslint . --max-warnings 0`). CI의 빌드·린트·타입
작업과 `make ci`가 이 명령을 호출합니다. `eslint.config.mjs`는 패키지, 예제, 테스트, 스크립트, 도구,
루트 설정 파일까지 모든 JavaScript, TypeScript, Vue, Svelte 소스에 하나의 규칙 집합을 적용합니다.
생성되거나 설치된 출력(`dist`, `out`, `.svelte-kit`, `node_modules`, `vendor`, `target`, 문서
문서 웹의 빌드 결과와 생성된 API 페이지, 네이티브 빌드 디렉터리)만 제외합니다. 파일별 설정은 코드가
실행되는 환경만 나타냅니다. 브라우저 코드에는 브라우저 전역, 브라우저 페이지나 DOM 환경에 함수를
넘기는 Node 프로그램에는 Node와 브라우저 전역, 루트 패키지의 `.js` 스크립트에는 CommonJS, Svelte
컴포넌트에는 Svelte 파서와 규칙을 지정합니다. 규칙은 적용되지 않는 줄에서만, 규칙 이름과 이유를 적은
비활성화 주석으로 끕니다.

`npm run test:build`가 실행하는 `tests/build/lint-coverage.test.mjs`는 Git이 추적하거나 추가할 모든
소스를 ESLint에 묻고, 소스가 `npm run lint`가 넘기는 경로 밖에 있거나 설정이 그 소스를 제외하거나
어떤 항목도 그 소스에 맞지 않으면 실패합니다.

## 테스트 실행기

모든 테스트는 `scripts/run-tests.mjs`로 실행합니다.

```sh
node scripts/run-tests.mjs <node|vitest|go|cargo|phpunit> [--timeout <seconds>] [--cwd <directory>] [--] [<arguments>]
```

실행기는 각 테스트의 시작, 실행 중임을 알리는 줄, 결과와 경과 시간을 출력합니다. 모든
테스트는 자기 제한 시간을 가지며, `--timeout`으로 지정하지 않으면 30초입니다. 패키지
스크립트, Composer 스크립트, Makefile 대상은 이 실행기를 통해서만 테스트 도구를 호출합니다.
실행기는 Go, Cargo, PHPUnit 테스트를 제한 시간에 멈추며, PHPUnit은 자체 시간 제한을 두지 않습니다.
`node --test`와 Vitest는 테스트가 기다리는 동안에만 제한 시간에 테스트를 멈추므로 동기 작업을
멈출 수 없습니다.
PHPUnit은 `--teamcity`로 실행합니다. 실행기는 TeamCity test를 하나씩 세고 test class나 data provider
method는 세지 않으며, 없는 test file에 대한 오류나 warning을 담은 요약처럼 TeamCity message가 아닌
줄을 모두 출력합니다.

실행의 모든 실패는 test 파일과 경과 시간과 함께 출력되며, 테스트 밖의 실패도 포함합니다. 실패하거나
제한 시간을 넘긴 hook과 test 파일의 오류가 그렇습니다. hook이 실패한 파일이나 suite는 그 안의 모든
테스트가 통과해도 원인과 함께 실패로 출력됩니다. `node --test`에서 파일의 실패한 hook은
`{file} › hook`으로 출력됩니다. 요약 줄은 실패한 group 수를 표시하므로, 모든 테스트가 통과하고 도구가
0이 아닌 코드로 끝난 실행은 그 코드의 원인이 된 실패를 보여 줍니다.
`tests/build/run-tests.test.mjs`는 제한 시간을 넘긴 after hook을 `node --test`와 Vitest에서
실행합니다.

## 시간과 부하

테스트는 경과 시간을 제한값이나 다른 경과 시간과 비교하지 않습니다. 기계의 부하가 경과 시간을
바꾸기 때문입니다. 연산이 선형 시간에 끝나는지 확인하는 검사는 다음 둘 중 하나를 합니다.

- 결정적인 양을 셉니다. JavaScript test runner는 동기 작업을 멈출 수 없으므로 validator의
  JavaScript 검사는 getter로 데이터 읽기를, 세는 `codePointAt`으로 텍스트 읽기를 세고, 선형 순회의
  읽기 수를 넘는 첫 읽기에서 실패합니다.
- 이차 시간이나 지수 시간 구현은 테스트 제한 시간 안에 끝나지 않고 선형 구현은 몇 초 안에 끝나는
  큰 입력을 실행합니다. PHP, Go, Rust validator 검사와 PHP extension engine fixture가 이렇게 합니다.

`npm run test:runtimes`가 실행하는 `tests/build/validator-test-clocks.test.mjs`는 validator
테스트나 PHP extension engine fixture가 시계를 읽으면 실패합니다.

`npm run test:runtimes`가 실행하는 `tests/build/test-commands.test.mjs`는 다음 경우에
실패합니다.

- 패키지 스크립트, Composer 스크립트, Makefile 대상, CI 단계가 테스트 도구를 직접 호출합니다.
- 테스트를 실행하는 CI 단계나 그 단계가 속한 작업에 `timeout-minutes`가 있거나, 그 작업에서 테스트를
  실행하지 않는 단계에 없거나, 테스트 단계가 없는 작업에 없습니다. 단계의 명령이
  `scripts/run-tests.mjs`를 호출하거나 npm script, Composer script, Makefile 대상을 거쳐 테스트 명령이나
  실행기에 닿으면 그 단계는 테스트를 실행합니다. 실행기가 각 테스트를 제한합니다.
- 테스트 명령이 시작하는 스크립트가 `scripts/test-progress/progress.mjs`로 출력하지 않습니다.
- 어떤 프로젝트 명령도 실행하지 않는 `node:test` 파일이 있습니다.
- TypeScript 패키지에 `typecheck` 스크립트가 없거나 CI가 `npm run typecheck`를 실행하지 않습니다.

## 명령 제한 시간

다른 명령을 실행하는 스크립트는 `scripts/bounded-command.mjs`로 각 명령에 제한 시간을 둡니다.
`npm run manifest:test`의 선언된 명령(`scripts/run-contract-tests.mjs`, 각 600초),
`scripts/require-current-build.mjs`의 패키지 빌드(600초), `scripts/gen-api-docs.mjs`의 각 도구
명령(600초), `tools/bench/run.js`의 각 벤치마크 드라이버(600초)가 대상입니다. 명령은 자기 프로세스
그룹에서 시작합니다. 제한 시간이 되면 그룹이 SIGTERM을 받고, 명령이 끝나는 즉시 또는 2초 뒤에
SIGKILL을 받으므로, 스크립트가 시작한 래퍼(npm, `go run`, `cargo run`, `/bin/sh`)와 그 아래의 모든
프로세스가 SIGTERM을 무시하는 것까지 멈춥니다. 그다음 스크립트는 제한 시간을 밝히며 실패합니다. 각
명령은 경과 시간을 출력합니다. 느린 기기에서는 `CRUDUI_COMMAND_LIMIT_SECONDS`가 제한 시간을
대신합니다. `npm run test:build`가 실행하는 `tests/build/bounded-commands.test.mjs`는 끝나지 않는
명령과 1초 제한으로 각 스크립트를 실행합니다.

`make conformance`는 적합성 근거를 기록하는 모든 테스트 모음을 실행하고 그 근거를 기능
계약과 대조합니다. [적합성 근거](../spec/conformance.ko.md)를 참고합니다.

## 루트 테스트 명령

루트 `npm test`는 모든 워크스페이스 패키지의 테스트 스크립트를
(`npm test --workspaces --if-present`) 각각 테스트 실행기로 실행합니다. 생성기 검사가
빌드 결과를 읽으므로 JavaScript 패키지를 먼저 빌드합니다.

```sh
npm run build
npm test
```

## 폼과 보고서

HTML 원문·DOM·스타일·입력 상태·반복 주입·브라우저 상호작용에는
[폼 검증 절차](verification.ko.md)를 사용합니다. JSON 순서와 HTTP 저장·로드
검사는 검증기 패키지 테스트와 별도입니다.

`npm run test:forms`는 호스트에서 Chromium, Firefox, WebKit의 스타일시트 배치와 스타일시트의
사용자 정의 속성(`tests/style-properties.test.mjs`)을 검사합니다.
`make test-form-styles-linux`는 CI 작업처럼 고정된 버전의 공식 Playwright 이미지에서 같은 검사를 Linux로
실행하므로, Linux에서만 드러나는 엔진 차이를 푸시 전에 찾을 수 있습니다. 이미지는 약 10GB이며, 이미지를
받은 실행은 성공 여부와 관계없이 끝날 때 이미지를 지우고, 이미 있던 이미지는 남겨 둡니다.

[기능 상태](../features.ko.md)에 리비전·명령·결과·배포 상태를 기록합니다. 테스트
결과는 실제로 실행한 코드와 입력에 적용됩니다. 검사 수만으로 범위나 배포가
증명되지는 않습니다.
