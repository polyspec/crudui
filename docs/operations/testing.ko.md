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
실패합니다.

실패는 이후 검사를 멈추지 않으므로 한 번의 실행이 모든 실패를 보고합니다. 검사 명령을 실행하는 워크플로
단계는 모두 `if: ${{ !cancelled() }}`를 가지므로 실패한 단계가 그 작업의 이후 검사를 건너뛰게 하지 않습니다.
`tests/build/ci-local.test.mjs`는 그것이 없는 검사 단계마다 작업과 단계를 적고 실패합니다. make는 처음 실패한
prerequisite에서 멈추므로 Makefile 대상은 테스트를 실행하는 대상을 prerequisite로 두지 않습니다.
`make test-native`와 `make docs-check`처럼 여러 테스트 대상을 실행하는 대상은 각각을
`$(MAKE) <target> || status=1`로 실행하고 모은 상태로 끝납니다.

`make ci`는 `docs/plans/execution-checklist.md`의 작업 중 `[~]`인 것이 없을 때, 커밋된 tree마다 한 번 실행됩니다. 어떤 명령보다
먼저 `scripts/full-run.mjs`를 시작하며, 이 guard는 판단을 이유와 함께 출력하고(`[full-run] run: ...` 또는 `[full-run]
refuse: ...`) 다음의 경우 status 1로 거부합니다. checklist의 작업 행이 `[~]`이면 활성 ID를 작업과 함께 나열하며 거부합니다. pre-push hook이
설치되지 않았으면(`node scripts/push-gate.mjs hooks-check`, 아래) 거부합니다. 추적 파일에 커밋되지
않은 변경이 있으면(`git status --porcelain --untracked-files=no`) 거부합니다. 전체 실행은 커밋된 tree를 검증하기 때문입니다.
`var/full-run.json`이 현재 tree(`git rev-parse HEAD^{tree}`)의 전체 실행을 기록하고 있으면 그 실행을 commit, 시작 시각, 결과와
함께 밝히며 거부합니다. `incomplete` record의 process가 아직 실행 중이면 거부합니다.

guard의 target은 `CI_COMMANDS`의 명령 하나이며 그 text로 이름을 붙입니다. 전체 실행은 이전 실행의 적합성 증거를 지우고, 각 명령을 `sh -c`로
끝까지 실행하며, 명령이 실패한 뒤에도 계속하고, `[full-run] start <command> (<n>/<total>)`와 `[full-run] <command>
passed|failed in <seconds> s`를 출력합니다. 어떤 명령에도 시간 제한이 없습니다. 각 명령의 앞뒤에 `var/full-run.json`을 씁니다. 이
record는 tree, commit, process, 시작과 끝 시각, 결과(마지막 명령이 끝날 때까지 `incomplete`, 그다음 `passed` 또는 `failed`),
실패한 명령, 그리고 각 명령의 상태(`pending`, `running`, `passed`, `failed`), 시각, 경과 millisecond를 담습니다. 따라서 멈춘 실행은
실행 중이던 명령과 함께 `incomplete`로 기록되어 남습니다. `var/`는 Git이 무시하므로 checkout과 worktree마다 자기 record를 가집니다.
tree를 바꾸는 commit은 `[~]` 작업이 없을 때 새 전체 실행을 허용합니다.

`make rerun-failed`는 현재 tree에서 통과하지 못한 명령, 즉 실패한 명령과 `incomplete` 실행이 끝내지 못한 명령만 다시 실행합니다. `node
scripts/check-conformance.mjs`가 읽는, 통과한 명령의 적합성 증거는 유지합니다. 진행 중인 작업, 커밋되지 않은 변경, 실행 중인 process에 대해서는
`make ci`와 같이 거부되고, record가 없을 때, record가 다른 tree의 것일 때, 그 tree의 전체 실행이 통과했을 때도 거부됩니다. 각 재실행을
record의 `reruns`에 쓰고, 모든 명령이 통과하면 그 tree의 결과는 `passed`가 됩니다.

CI workflow는 `main`으로의 push마다 같은 명령을 job에서 실행하고 `make ci`는 실행하지 않으므로 guard는 CI 실행을 판단하지 않습니다.
CI처럼 새 checkout에는 record가 없으므로, 그곳에서 `make ci`는 `[~]` 작업이 없고 tree가 깨끗하면 실행됩니다.

push는 checklist에 `[~]` 작업이 없을 때만 합니다. 추적되는 pre-push hook `.githooks/pre-push`는 Git이 push하는 ref와 함께
`node scripts/push-gate.mjs hook`을 실행합니다. 이 검사는 push되는 모든 commit의 checklist(`git show <sha>:docs/plans/execution-checklist.md`)와
working tree의 checklist를 guard의 `activeItems`로 읽고, 그중 하나에 진행 중인 작업이 있으면 status 1로 push를 거부합니다. 이 검사는 `push
refused: checklist tasks are in progress`, 작업마다 push되는 ref와 commit 또는 `working tree`, 그 ID와 제목을 적은 줄, 이유, 해결 방법을
출력합니다. 해결 방법은 작업을 완료하거나, 그 원인과 재시도 조건과 함께 `[!]`로 표시하는 것입니다. checklist가 없는 push commit, Git 오류,
검사 자체의 오류도 그 원인을 적으며 push를 거부합니다. 삭제되는 ref는 commit을 push하지 않으므로 working tree만으로 검사합니다.

Git은 hook을 version 관리하지 않습니다. 모든 `make` 실행은 Makefile을 읽을 때 설정이 다르면 `core.hooksPath`를 `.githooks`로 설정하므로,
어떤 make target이든 실행한 checkout에는 hook이 있습니다. `make hooks`는 hook을 설치하고 `node scripts/push-gate.mjs hooks-check`를
실행하며, `make hooks-check`도 이것을 실행합니다. 이 검사는 `core.hooksPath`가 `.githooks`가 아니거나 `.githooks/pre-push`가 실행
가능한 file이 아니면 실패하고 해결 방법을 적습니다. `make ci`의 guard도 같은 이유로 거부합니다.

hook이 없는 clone이나 hook을 건너뛴 push도 GitHub에 도달합니다. `.github/workflows/push-gate.yml`의 job `push-gate`는 모든 branch로의
push와 모든 pull request에서 실행되어, push된 commit(pull request의 head commit)을 checkout하고
`node scripts/push-gate.mjs commit HEAD`를 실행합니다. 이 job은 그 commit의 checklist에 진행 중인 작업이 있을 때, commit에 checklist가 없을 때, commit이
`.githooks/pre-push`를 실행 가능한 file(mode `100755`)로 추적하지 않을 때 실패하며, 거부 내용을 progress line으로, 각 줄을 error
annotation으로, 그리고 job summary에 출력합니다.

개별 명령은 다음과 같습니다.

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

`node:test` 파일에 등록된 모든 case는 실행되거나 파일이 실패합니다. `node --test`는 알려진 test가 끝나면
파일의 process를 끝내는 `--test-force-exit`로 실행되므로, handle을 열어 둔 test가 실행을 붙잡지 못합니다.
대신 module이 그 끝 뒤에 등록하는 test는 실행되지 않습니다. 세 검사가 그 틈을 막습니다.

- 실행기는 모든 test 파일의 process에 `scripts/test-progress/load-check.mjs`를 preload합니다. module의
  evaluation이 top-level `await`까지 끝나기 전에 끝나는 process는 파일을
  `the process ended before the module finished loading; tests registered later did not run`으로 실패시킵니다.
- 통과, 실패, skip 중 어떤 case도 보고하지 않은 파일은 `the file ran no test case`로 실패합니다.
  `--test-name-pattern`이 그 파일의 test를 하나도 고르지 않을 때가 그렇습니다.
- `scripts/lint/node-test-rules.mjs`의 lint rule `crudui/no-await-after-test-registration`은 module에서 첫
  `node:test` 등록 뒤의 top-level `await`를 거부합니다. 그래서 모든 case는 module이 처음 기다리기 전에 등록되고,
  첫 검사는 앞 case의 소요 시간에 의존하지 않습니다.

`tests/build/run-tests.test.mjs`는 앞의 두 검사를 파일로 실행하고, `tests/build/test-commands.test.mjs`는 lint
rule을 fixture로 실행합니다.

실행의 모든 실패는 test 파일과 경과 시간과 함께 출력되며, 테스트 밖의 실패도 포함합니다. 실패하거나
제한 시간을 넘긴 hook과 test 파일의 오류가 그렇습니다. hook이 실패한 파일이나 suite는 그 안의 모든
테스트가 통과해도 원인과 함께 실패로 출력됩니다. `node --test`에서 파일의 실패한 hook은
`{file} › hook`으로 출력됩니다. 요약 줄은 실패한 group 수를 표시하므로, 모든 테스트가 통과하고 도구가
0이 아닌 코드로 끝난 실행은 그 코드의 원인이 된 실패를 보여 줍니다.
`tests/build/run-tests.test.mjs`는 제한 시간을 넘긴 after hook을 `node --test`와 Vitest에서
실행합니다.

setup(browser launch, server start, stylesheet compile, build)과 teardown(browser close, server stop,
directory 삭제)은 test case가 아니라 장기 작업입니다. `node:test` 파일은 `scripts/test-progress/hooks.mjs`의
`setup`과 `teardown`으로 이를 등록하며, 이는 timeout이 `Infinity`인 파일, suite, test 하나(`{ context: t }`)의
`before`나 `after` hook입니다. 각각은 작업이 끝나면(browser가 launch되고, server가 listen하고, close가
resolve되고, process가 종료되면) 끝나고, 그 오류는 파일을 실패시키며, 시작, 실행 중 5초마다의 줄, 경과
시간과 함께 끝을 출력합니다. Vitest setup이나 teardown은 timeout이 `Infinity`인 `beforeAll`이나 `afterAll`
hook입니다. test는 browser를 launch하지 않고 setup이 launch한 browser의 page를 엽니다.
`tests/build/hooks.test.mjs`는 setup이나 teardown이 1.5초 걸리는 파일을 1초 test timeout으로 실행합니다.

## 시간과 부하

테스트는 경과 시간을 제한값이나 다른 경과 시간과 비교하지 않습니다. 기계의 부하가 경과 시간을
바꾸기 때문입니다. 대신 원인을 확인합니다. event, 예상한 경로만 만드는 결과, 또는 시험 대상 code가
멈추지 않으면 끝나지 않는 작업을 test 자신의 timeout 아래에서 확인합니다.
`tests/build/test-commands.test.mjs`는 경과 시간에 한도를 두는 assertion에서 실패합니다. 연산이 선형 시간에 끝나는지 확인하는 검사는 다음 둘 중 하나를 합니다.

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
- CI 작업이나 단계에 `timeout-minutes`가 있습니다. 단계는 테스트나 장기 작업(checkout, toolchain
  setup, install, build, lint나 type check, upload, deployment)을 실행합니다. 실행기가 테스트 단계의
  각 test case를 제한하고, 장기 작업은 log를 출력하며 시간 한도를 두지 않습니다. 단계의 명령이
  `scripts/run-tests.mjs`를 호출하거나 npm script, Composer script, Makefile 대상을 거쳐 테스트 명령이나
  실행기에 닿으면 그 단계는 테스트를 실행합니다.
- 테스트 명령이 시작하는 스크립트가 `scripts/test-progress/progress.mjs`로 출력하지 않습니다.
- 어떤 프로젝트 명령도 실행하지 않는 `node:test` 파일이 있습니다.
- TypeScript 패키지에 `typecheck` 스크립트가 없거나 CI가 `npm run typecheck`를 실행하지 않습니다.
- Makefile 대상이 테스트를 실행하는 대상을 prerequisite로 둡니다.

## 장기 작업의 명령

다른 명령을 실행하는 스크립트는 `scripts/run-command.mjs`로 각 명령을 끝까지 실행합니다.
`npm run manifest:test`의 선언된 명령(`scripts/run-contract-tests.mjs`), `scripts/require-current-build.mjs`의
패키지 빌드, `scripts/gen-api-docs.mjs`의 각 도구 명령, `tools/bench/run.js`의 각 벤치마크 드라이버,
`tools/bench/build-drivers.mjs`의 각 드라이버 빌드가 대상입니다. 명령에는 시간 한도가 없습니다. 명령의
종료가 명령을 끝내고 종료 상태가 결과를 정하며, 스크립트는 명령과 경과 시간을 출력합니다. 명령은 자기
프로세스 그룹에서 시작하고, 명령이 끝나면 그룹에 남긴 프로세스를 멈추므로 출력 pipe를 열어 둔
프로세스가 스크립트를 붙잡지 못합니다. 중단된 스크립트는 실행 중인 명령을 멈춥니다.
`npm run test:build`가 실행하는 `tests/build/run-command.test.mjs`는 1.2초 뒤에 끝나는 명령으로 각
스크립트를 실행하고, 명령이 남긴 자식이 멈췄는지를 스크립트 출력의 close로 확인합니다.

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
실행하므로, Linux에서만 드러나는 엔진 차이를 푸시 전에 찾을 수 있습니다. 이미지는 약 10GB이고 user
account의 모든 checkout이 같은 이미지를 쓰므로 실행은 이미지를 남겨 두며, container는 이미지의 user 범위
holder lock 아래에서 실행됩니다([함께 쓰는 resource](#함께-쓰는-resource) 참고).
`make remove-form-styles-image`는 같은 lock 아래에서 이미지를 지우고, check가 실행되는 동안에는
거부됩니다.

[기능 상태](../features.ko.md)에 리비전·명령·결과·배포 상태를 기록합니다. 테스트
결과는 실제로 실행한 코드와 입력에 적용됩니다. 검사 수만으로 범위나 배포가
증명되지는 않습니다.

## 함께 쓰는 resource

다른 checkout의 실행이 한 기기에서 동시에 실행됩니다. 한 실행이 소유할 수 있는 resource는 그
실행을 위해 만듭니다: `mktemp -d`나 `mkdtemp`의 임시 directory, operating system이 정하는 port, 실행의
식별자를 담은 이름입니다. 기기나 checkout에 하나뿐인 resource는 `scripts/holder-lock.mjs`의 holder lock
아래에서 씁니다.

- 한 번에 한 실행만 lock을 잡습니다. lock file은 holder의 record를 담습니다: lock을 잡은 code의
  checkout, pid, 그 process의 시작 시각, lock을 잡은 시각, command, random token입니다. record는 전용
  file에 모두 쓴 뒤 lock path로 link하고, lock이 있으면 link가 실패하므로, lock은 atomic하게 잡히고
  읽는 쪽은 일부만 쓰인 record를 보지 않습니다.
- lock이 잡혀 있으면 실행은 holder의 record와 함께 실패합니다.
- holder process가 더 이상 실행되지 않거나 그 pid가 시작 시각이 다른 process의 것이 된 lock은 record와
  함께 보고하고 남겨 둡니다. `node scripts/holder-lock.mjs remove-dead <lock file>`로 명시적으로
  지우며, 이 command는 실행 중인 holder를 거부합니다.
- holder만 lock을 해제합니다. 해제는 먼저 record의 token을 확인합니다.
- `node scripts/holder-lock.mjs hold <lock file> -- <command>`는 lock을 잡은 채 command를 실행하고,
  SIGINT, SIGTERM, SIGHUP을 전달하며, command가 끝나면 lock을 해제하고 그 status로 끝납니다. 획득과
  해제를 출력합니다.

한 checkout의 resource lock은 그 checkout의 `var/locks/<name>.lock`이고, user account의 모든 checkout이
함께 쓰는 resource의 lock은 `~/.local/state/crudui/locks/<name>.lock`입니다.
`npm run test:runtimes`가 실행하는 `tests/build/holder-lock.test.mjs`는 record, 거부, 동시 실행,
holder가 더 이상 실행되지 않는 lock의 보고와 제거, 해제를 확인합니다.

| Resource | 한 실행의 사용 |
|---|---|
| `make docs-verify-idempotent`의 snapshot | `mktemp -d`의 directory, 실행이 끝날 때 지움 |
| `make test-form-styles-linux`의 Playwright image | user 범위 lock `playwright-v<version>-noble`; 실행은 image를 남기고, `make remove-form-styles-image`가 lock 아래에서 지움 |
| `make deploy`와 `make deploy-verify`의 comparison deployment | user 범위 lock `form-comparison-deployment`, 다른 step보다 먼저 잡음 |
| build되는 각 package의 `dist` | checkout lock `dist-<package folder>`, package build 전체와 모든 pack이 잡음 |

build되는 모든 package의 build script는 `node ../../scripts/package-dist.mjs build '<command>'`이고,
package `dist` lock 아래에서 build command를 실행합니다. `node scripts/package-dist.mjs pack
<package directory> <destination directory>`는 같은 lock 아래에서 `dist`에 output이 있는지 확인하고
`npm pack`을 실행하며, 그 JSON report를 standard output에 출력합니다. package install check와 CRUDUI
archive를 설치하는 repository는 이것으로 pack하므로, build가 비운 `dist`를 읽는 pack은 없습니다.
Linux에서 lock은 process 시작 시각을 `/proc`에서 읽습니다. comparison의 toolchain image 같은 최소
container image에는 `ps`가 없기 때문입니다.

`npm run test:runtimes`가 실행하는 `tests/build/shared-resources.test.mjs`는 documentation, image,
`dist` 행을 확인합니다. `dist` lock은 임시 checkout에서 build하는 fixture package로 확인하므로 저장소의 build
결과물을 읽지 않고 `npm run build`보다 먼저 실행됩니다.
`npm run test:form-comparison:source`가 실행하는 `examples/form-comparison/check-deployment-lock.test.mjs`는
deployment를 확인합니다.
