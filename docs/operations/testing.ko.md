# 테스트 실행
<!-- doc-id: docs-operations-testing -->
<!-- source-sha256: a9bc9ec1505a289739a9e90eff3dde7931f03f1b478428caecacb8009415ff24 -->

[English](testing.md).

저장소 루트에서 실행합니다. 모든 도구는 checkout이 기록한 release로 실행됩니다(`docs/spec/package-build.ko.md`,
"런타임과 의존성 버전"). `make install`은 기록한 npm, npm과 Composer 의존성, `rust-toolchain.toml`의 Rust toolchain, comparison의 OrderedJSON checkout과
모든 Cargo.lock의 crate(`make install-crates`),
`scripts/install-phpdocumentor.sh`가 SHA-256으로 검사하는 phpDocumentor release를 설치하고, `make toolchain-check`는 다른 release로 실행되는 모든 도구를 기대한 release와 함께 밝힙니다.
`make install-tools`(`scripts/kit/install-tools.mjs`)로 checkout이 선언한 npm과 Go release와 cargo-audit를
checkout에 설치하며, 이 명령은 machine의 도구를 바꾸지 않습니다. make는 `var/tools/bin`의 명령을
`PATH`의 맨 앞에 두고, npm을 직접 실행하는 shell은 `export PATH="$PWD/var/tools/bin:$PATH"`로 그렇게
합니다. `npm ci --strict-allow-scripts`로 Node 의존성을
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

개발하는 동안에는 바뀐 것을 소유한 unit test, 곧 그 Red와 Green case만 실행합니다. end-to-end 검사(browser,
container, form comparison, native와 cross-check suite, 전체 build), `make owner-check`, 전체 실행 `make ci`는 pull request의
CI에서 실행하며, push나 commit 전에 local 검사를 요구하는 규칙은 없습니다. pre-push hook은 checklist 작업이 `[~]`인
동안 push를 거부할 뿐입니다(아래). `make ci`와 `make owner-check`는 요청할 때 실행할 수 있습니다.

workflow의 모든 step은 make 대상을 실행합니다. 설치(`make install-tools`, `make install-node-modules`,
`make install-composer`, `make install-rust`, `make install-crates`, `make install-browsers BROWSERS="..."`), 도구 검사
(`make toolchain-check TOOLS="..."`), 각 검사(`make test-runtimes`, `make lint`, `make test-forms`와 `CI_COMMANDS`의 나머지)가
그렇습니다. 그래서 recipe는 모든 도구를 offline 설정, `$(NPM)`, checkout의 toolchain으로 시작합니다.
`tests/build/ci-local.test.mjs`는 make 없이 node, npm, npx, cargo, go, php, composer, rustup, python3, sh를 시작하는 step에서
실패합니다.

`make ci`는 `conformance-reset`을 실행한 뒤 `CI_TARGETS`의 모든 대상을 워크플로 순서대로 실행하고, 적합성 증거를 모아
CI의 마지막 작업처럼 검사합니다. `tests/build/ci-local.test.mjs`는 이 목록이 `.github/workflows/ci.yml`과 다르면
실패합니다.

실패는 이후 검사를 멈추지 않으므로 한 번의 실행이 모든 실패를 보고합니다. 각 CI job은 검사를 한 step,
`make ci-targets TARGETS="..."`로 실행하고 이것은 모든 대상을 끝까지 실행하며, 그 step은 `if: ${{ !cancelled() }}`를
가지므로 실패한 준비 단계가 그 job의 검사를 건너뛰게 하지 않습니다. `tests/build/ci-local.test.mjs`는 그것이 없는
검사 단계마다 작업과 단계를 적고 실패합니다. make는 처음 실패한
prerequisite에서 멈추므로 Makefile 대상은 테스트를 실행하는 대상을 prerequisite로 두지 않습니다.
`make test-native`와 `make docs-check`처럼 여러 테스트 대상을 실행하는 대상은 각각을
`$(MAKE) <target> || status=1`로 실행하고 모은 상태로 끝납니다. make는 처음 실패한 recipe 줄에서도 멈추므로,
대상의 첫 검사를 실행하는 recipe 줄은 그 대상의 마지막 줄이며 `make docs-check-documents`와 `make format-check`처럼
각 검사를 `|| status=1`로 실행하고 `exit $$status`로 끝납니다. build나 install 같은 그 앞의 준비 줄은 여전히 대상을
멈추며, `make docs-verify-idempotent`처럼 뒤 단계가 앞 단계의 결과를 읽는 `&&` 연결은 하나의 검사입니다.
package script와 CI step도 같은 규칙을 따릅니다. 독립된 여러 검사는 `status=0; <check> || status=1; ...; exit $status`로
실행하며, `npm run test:forms`와 `npm run test:form-comparison:pipeline`은 `node scripts/require-current-build.mjs || exit 1`
뒤에 그렇게 합니다. `&&` 연결은 검사 뒤에 단계를 두지 않습니다.
`scripts/run-contract-tests.mjs`는 앞의 명령이 실패한 뒤에도 선언된 모든 명령을 실행하고 마지막 명령 뒤에 실패합니다.

`make ci`는 `docs/plans/execution-checklist.md`의 작업 중 `[~]`인 것이 없을 때, 커밋된 tree마다 한 번 실행됩니다. 어떤 대상보다
먼저 `scripts/kit/full-run.mjs`를 시작하며, 이 guard는 판단을 이유와 함께 출력하고 다음의 경우 status 1로 거부합니다. checklist의
작업 행이 `[~]`이면 활성 ID를 작업과 함께 나열하며 거부합니다. checklist를 읽을 수 없으면 거부합니다. pre-push hook이
설치되지 않았으면(`make hooks-check`, 아래) 거부합니다. 추적 파일에 커밋되지 않은 변경이 있거나 무시되지 않는 새 file이 있으면
거부합니다. 전체 실행은 그 둘을 담지 않는 커밋된 tree를 검증하기 때문입니다. `var/full-run.json`이 현재 tree(`git rev-parse HEAD^{tree}`)의
전체 실행을 기록하고 있으면 그 실행을 commit, 시작 시각, 결과와 함께 밝히며 거부합니다. `incomplete` record의 process가 아직 실행 중이면
거부합니다. guard는 첫 읽기부터 마지막 쓰기까지 lock `var/full-run.lock`을 잡습니다.

대상은 커밋된 commit의 working tree에서 실행됩니다. 전체 실행은 이전 실행의 적합성 증거를 지우는 `conformance-reset`을 실행한 뒤,
`CI_TARGETS`의 각 대상을 `make -k <target>`으로 끝까지, 대상이 실패한 뒤에도 계속 실행합니다. 각 대상의 시작과 결과를 경과 시간과 함께
출력하고 각 대상의 출력을 `var/report/full-run/targets/<target>.log`에 씁니다. 어떤 대상에도 시간 제한이 없습니다. 각 대상의 앞뒤에
`var/full-run.json`을 씁니다. 이 record는 tree, commit, process와 그 시작 시각, 시작과 끝 시각, 결과(마지막 대상이 끝날 때까지
`incomplete`, 그다음 `passed` 또는 `failed`), 그리고 각 대상의 상태(`pending`, `running`, `passed`, `failed`), 시각, 실패한 대상의 마지막 출력
줄을 담습니다. 따라서 멈춘 실행은 실행 중이던 대상과 함께 `incomplete`로 기록되어 남습니다. `var/`는 Git이 무시하므로 checkout과
worktree마다 자기 record를 가집니다. tree를 바꾸는 commit은 `[~]` 작업이 없을 때 새 전체 실행을 허용합니다.

`make rerun-failed`는 현재 tree에서 통과하지 못한 대상, 즉 실패한 대상과 `incomplete` 실행이 끝내지 못한 대상만 다시 실행합니다. `node
scripts/check-conformance.mjs`가 읽는, 통과한 대상의 적합성 증거는 유지합니다. 진행 중인 작업, 커밋되지 않은 변경, 실행 중인 process에 대해서는
`make ci`와 같이 거부되고, record가 없을 때, record가 다른 tree의 것일 때, 그 tree의 전체 실행이 통과했을 때도 거부됩니다. 각 재실행을
record의 `reruns`에 쓰고, 모든 대상이 통과하면 그 tree의 결과는 `passed`가 됩니다.

CI workflow는 pull request, merge group, 수동 실행(`workflow_dispatch`)마다 같은 대상을 job에서 실행하고 `make ci`는 실행하지 않으므로 guard는 CI 실행을 판단하지 않습니다.
CI처럼 새 checkout에는 record가 없으므로, 그곳에서 `make ci`는 `[~]` 작업이 없고 tree가 깨끗하면 실행됩니다.

native suite는 세 CI job에서 실행되므로 어떤 job도 다른 runtime이 필요한 suite를 기다리지 않습니다.
`php-engine`은 Node.js와 C compiler로 `make test-php-engine`을 한 번, `native-generators`는
`make test-native-generators`와 `make test-bench`를 한 번 실행하고, `php-api`는 matrix의 PHP release마다
`make test-php-api`를 실행합니다. `make test-native`는 세 대상을 한 명령으로 실행합니다
(`docs/operations/native-generators.ko.md`).

npm package를 설치하는 모든 job은 npm을 설치하기 전에 `actions/cache`로 `~/.npm`을 key
`npm-<system>-<architecture>-<package-lock.json의 hash>`로 복원하고 저장하며, `setup-node`는 아무것도 cache하지
않습니다. 그 cache는 먼저 끝난 job의 npm 디렉터리를, npm package를 설치하지 않는 job의 것도 저장했으므로 이후 모든
job이 700 byte를 복원했습니다. 실행은 자기 ref와 `main`의 cache를 읽으므로 `.github/workflows/pages.yml`이 `main`에서
같은 key로 저장한 cache를 모든 pull request와 merge group이 씁니다. `Swatinem/rust-cache`의 Cargo cache는 job, Rust
toolchain, workspace의 Cargo lock으로 된 key를 가지며, job id마다 그런 key가 하나입니다.

요청하면 `make owner-check`는 바뀐 경로를 소유한 검사를 실행합니다. 경로는 commit되지 않은 변경과 새 file,
`PATHS`의 경로, 또는 `BASE` 뒤에 바뀐 경로입니다. `scripts/owner-checks.json`은 경로 glob마다 그것을 소유한 make 대상,
root npm script, workspace와 package directory의 test script, node test file을, 검사마다 그것이 읽는 경로(`inputs`)를
밝힙니다. `scripts/owner-check.mjs`는 어떤 규칙도 소유하지 않는 경로, 경로가 없는 glob, full suite 대상, 알 수 없는
script나 test, 그리고 경로의 규칙이 그 검사를 고르지 않는데 검사가 읽는 경로에 대해 어떤 검사보다 먼저 실패합니다. 고른
모든 검사를 하나가 실패한 뒤에도 실행하며 full suite는 실행하지 않습니다. `tests/build/owner-check.test.mjs`는 선택,
거부, repository의 선언을 확인합니다.

Makefile 대상의 명령을 읽는 test는 `tests/build/make-dry-run.mjs`의 `makeDryRun`을 실행합니다. 이것은 `MAKEFLAGS=w`를 설정하고
상위 make의 `MAKELEVEL`, `GNUMAKEFLAGS`, `MAKEFILES`, `MFLAGS`를 지운 채 `make --no-print-directory -n <target>`을 실행하므로,
GNU Make 3.81과 GNU Make 4는 다른 make 안에서도 명령만 출력합니다. `tests/build/make-dry-run.test.mjs`는 그 밖의 make dry run에 대해
실패합니다.

push는 checklist에 `[~]` 작업이 없을 때만 합니다. 추적되는 pre-push hook `.githooks/pre-push`는 Git이 push하는 ref와 함께
`node scripts/kit/push-gate.mjs hook`을 실행합니다. 이 검사는 push되는 모든 commit의 checklist(`git show <sha>:docs/plans/execution-checklist.md`)와
working tree의 checklist를 읽고, 그중 하나에 진행 중인 작업이 있으면 status 1로 push를 거부합니다. 이 검사는 그런 작업마다 file, ID, 제목을 push되는
ref와 commit 또는 `working tree`와 함께 출력하고, push를 막는 상태(`[~]`)와 막지 않는 상태(`[ ]`, `[o]`, `[!]`)를 밝힙니다. 작업을 완료하거나, 그 원인과
재시도 조건과 함께 `[!]`로 표시합니다. checklist가 없는 push commit, 잘못된 hook 입력 줄, 읽을 수 없는 checklist, Git 오류도 그 원인을 적으며 push를
거부합니다. 삭제되는 ref는 commit을 push하지 않으므로 working tree만으로 검사합니다.

Git은 hook을 version 관리하지 않습니다. make 실행은 checkout이 `.githooks/pre-push`를 추적하면 `core.hooksPath`를 `.githooks`로 설정하므로(`scripts/kit/kit.mk`),
어떤 make target이든 실행한 checkout에는 hook이 있습니다. `make hooks`(`node scripts/kit/git-hooks.mjs install`)는 `core.hooksPath`를 설정하고 hook을 쓰고 실행 가능하게
하며, `make hooks-check`는 `core.hooksPath`가 `.githooks`가 아니거나 `.githooks/pre-push`가 없거나 실행 가능한 file이 아니거나 도구의 hook과 다른 내용이면
실패하고 해결 방법을 적습니다. `make ci`의 guard도 같은 이유로 거부합니다.

hook이 없는 clone이나 hook을 건너뛴 push도 GitHub에 도달합니다. `.github/workflows/push-gate.yml`의 job `push-gate`는 merge queue의 branch를 뺀 모든 branch로의
push, 모든 pull request, 모든 merge group에서 실행되어, push된 commit(pull request의 head commit, merge group의 commit)을 checkout하고
`node scripts/kit/push-gate.mjs commit HEAD`를 실행합니다. 이 job은 그 commit의 checklist에 진행 중인 작업이 있을 때, commit에 checklist가 없을 때, commit이
`.githooks/pre-push`를 실행 가능한 file(mode `100755`)로 추적하지 않을 때 실패하며, 거부 내용을 progress line으로, 각 줄을 error
annotation으로, 그리고 job summary에 출력합니다. 같은 step은 `make records-check`도 실행합니다. `make documents-check`
(`scripts/kit/check-documents.mjs`, `config/documents.json`)와 link, changelog, 문장, example과 fixture README test로, Node.js만 필요하고 network와 이력을 읽지 않습니다. 그래서
문서나 checklist 규칙을 어긴 commit은 ruleset `main`이 요구하는 check에 실패합니다([저장소 설정](repository.ko.md#main-게시)).
`make docs-check-documents`는 나머지 문서 검사와 함께 `make records-check`를 실행합니다.

개별 명령은 다음과 같습니다.

```sh
composer install
npm run build
npm test --workspace @polyspec/crudui-validator
composer --working-dir=packages/validator-php test
node scripts/kit/run-tests.mjs go --cwd packages/validator-go -- ./...
node scripts/kit/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml
npm test --workspace @polyspec/crudui-cli
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

모든 테스트는 `scripts/kit/run-tests.mjs`로 실행합니다.

```sh
node scripts/kit/run-tests.mjs <node|vitest|go|cargo|phpunit> [--timeout <seconds>] [--cwd <directory>] [--] [<arguments>]
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

- 실행기는 모든 test 파일의 process에 `scripts/kit/test-load-check.mjs`를 preload합니다. module의
  evaluation이 top-level `await`까지 끝나기 전에 끝나는 process는 파일을
  `the process ended before the module finished loading; tests registered later did not run`으로 실패시킵니다.
- 통과, 실패, skip 중 어떤 case도 보고하지 않은 파일은 `the file ran no test case`로 실패합니다.
  `--test-name-pattern`이 그 파일의 test를 하나도 고르지 않을 때가 그렇습니다.
- `scripts/lint/node-test-rules.mjs`의 lint rule `crudui/no-await-after-test-registration`은 module에서 첫
  `node:test` 등록 뒤의 top-level `await`를 거부합니다. 그래서 모든 case는 module이 처음 기다리기 전에 등록되고,
  첫 검사는 앞 case의 소요 시간에 의존하지 않습니다.

`tests/kit/run-tests.test.mjs`는 앞의 두 검사를 파일로 실행하고, `tests/build/test-commands.test.mjs`는 lint
rule을 fixture로 실행합니다.

실행의 모든 실패는 test 파일과 경과 시간과 함께 출력되며, 테스트 밖의 실패도 포함합니다. 실패하거나
제한 시간을 넘긴 hook과 test 파일의 오류가 그렇습니다. hook이 실패한 파일이나 suite는 그 안의 모든
테스트가 통과해도 실패로 출력됩니다. 요약 줄은 실패한 group 수를 표시하므로, 모든 테스트가 통과하고 도구가
0이 아닌 코드로 끝난 실행은 그 코드의 원인이 된 실패를 보여 줍니다.
`tests/kit/run-tests.test.mjs`가 이 경우들을 실행합니다.

setup(browser launch, server start, stylesheet compile, build)과 teardown(browser close, server stop,
directory 삭제)은 test case가 아니라 장기 작업입니다. `node:test` 파일은 `scripts/kit/test-hooks.mjs`의
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
  `scripts/kit/run-tests.mjs`를 호출하거나 npm script, Composer script, Makefile 대상을 거쳐 테스트 명령이나
  실행기에 닿으면 그 단계는 테스트를 실행합니다.
- 테스트 명령이 시작하는 스크립트가 `scripts/kit/test-progress.mjs`로 출력하지 않습니다.
- 어떤 프로젝트 명령도 실행하지 않는 `node:test` 파일이 있습니다.
- TypeScript 패키지에 `typecheck` 스크립트가 없거나 CI가 `npm run typecheck`를 실행하지 않습니다.
- Makefile 대상이 테스트를 실행하는 대상을 prerequisite로 둡니다.
- 대상의 첫 검사를 실행하는 줄 뒤에 recipe 줄이 있거나, 검사가 `|| exit`로 recipe를 끝내거나, 그 줄의 검사가 다음
  검사 전에 `status=1`을 설정하지 않습니다.
- package script나 CI step이 `&&` 연결에서 검사 뒤에 단계를 두거나, 여러 검사 중 하나가 모은 상태로 끝나기 전에
  `status=1`을 설정하지 않습니다.

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

`npm run test:inspector`는 폼 스냅샷과 브라우저 검사기 테스트를 실행하며, 검사하는 폼을 바꾸지 않고
HTML 원문, 파싱한 DOM, 계산된 스타일, 실제 입력 상태를 비교합니다.
`npm run test:form-comparison:pipeline`은 이 트리에서 다섯 레코드 서버(`.form-comparison/sources/ordered-json`의
OrderedJSON 체크아웃, 두 PHP 확장, Go 바이너리, Rust 바이너리)를 빌드하고, 각 서버를 127.0.0.1의 빈 포트에서
로컬 프로세스로 시작하고, 다섯 서버 모두에 레코드 저장소 HTTP 계약을 실행하고, Go·Rust 서버 테스트를 실행한
뒤, 그 로컬 구성에서 서버·클라이언트·초기화 방식 40개 조합의 정본 List → Detail → Form → Save → List
refresh 검사를 실행합니다. `php-config`가 있는 PHP, Composer, Go, Rust, Chrome이 필요합니다.
`npm run test:form-comparison:checks`(`make test-form-comparison-checks`)는 같은 로컬 구성을 시작하고, 그
구성에 PHP 처리 모드, 생성·저장·정본 흐름 검사, 네이티브 서버 네 개의 브라우저 검사와 상호작용 검사,
브라우저 집계, 입력 검사를 실행하고, 근거를 확인한 뒤 서버를 멈춥니다
([로컬 검증](../spec/form-comparison.ko.md#로컬-검증)). `make test-form-comparison-browser`(`FORM_SERVERS`
서버의 브라우저 검사, 보고서는 `FORM_BROWSER_REPORTS`)와 `make test-form-comparison-summary`(그 보고서를 쓰는
나머지 검사)는 같은 검사를 CI가 실행하는 두 부분으로 실행하며, 앞의 것은 서버마다 CI 작업 하나에서 실행합니다.
[폼 비교](../spec/form-comparison.ko.md)가 레코드 리소스, 페이지와 그 검사들을 정의합니다. JSON 순서와 HTTP
저장·로드 검사는 검증기 패키지 테스트와 별도입니다.

`npm run test:forms`는 호스트에서 Chromium, Firefox, WebKit의 스타일시트 배치와 스타일시트의
사용자 정의 속성(`tests/style-properties.test.mjs`)을 검사합니다.
CI job `form-runtime`은 같은 검사를 Linux runner `ubuntu-24.04`에서 `make install-browsers`가 설치한,
Puppeteer가 고정한 Chromium·Firefox build와 Playwright가 고정한 WebKit build로 실행합니다. Linux에서만
드러나는 엔진 차이는 그 job에서 보입니다.

[기능 상태](../features.ko.md)에 리비전·명령·결과·배포 상태를 기록합니다. 테스트
결과는 실제로 실행한 코드와 입력에 적용됩니다. 검사 수만으로 범위나 배포가
증명되지는 않습니다.

## 보고서

모든 CI job은 각 실패의 이유를 남깁니다. `make ci-targets TARGETS="..."`(`scripts/kit/ci-targets.mjs`)는 각 대상을
`make -k <target>`로 끝까지, 앞의 대상이 실패한 뒤에도 실행하고, 그 출력을 출력하며
`var/report/ci-targets/targets/<target>.log`에 씁니다. `summary.md`는 각 대상을 결과와 시간과 함께, 실패한 대상마다 그
첫 실패 줄과 log를 밝히며(`scripts/kit/target-report.mjs`), 같은 글이 GitHub Actions의 job summary로 갑니다. 실행은 lock
`var/report/ci-targets.lock`을 잡으므로 두 실행이 한 보고서를 쓰지 않고, 대상이 실패하면 status 1로 끝납니다. 각 job은
`var/report/ci-targets`를 artifact `report-<job>`(matrix job은 PHP minor를 붙임)으로 `if: ${{ !cancelled() }}`와
`if-no-files-found: error`로 올립니다. `tests/build/ci-local.test.mjs`는 `make ci-targets` 밖에서 검사를 실행하거나
보고서를 올리지 않는 job에서 실패하고, `tests/kit/ci.test.mjs`는 실패하는 probe 대상과 통과하는 probe
대상을 실행해 두 log, summary의 실패 줄, job summary를 확인합니다.

## 함께 쓰는 resource

다른 checkout의 실행이 한 기기에서 동시에 실행됩니다. 한 실행이 소유할 수 있는 resource는 그
실행을 위해 만듭니다: `mktemp -d`나 `mkdtemp`의 임시 directory, operating system이 정하는 port, 실행의
식별자를 담은 이름입니다. 기기나 checkout에 하나뿐인 resource는 `scripts/kit/holder-lock.mjs`의 holder lock
아래에서 씁니다.

- 한 번에 한 실행만 lock을 잡습니다. lock file은 holder의 record를 담습니다: lock을 잡은 code의
  checkout, pid, 그 process의 시작 시각, lock을 잡은 시각, command, random token입니다. record는 전용
  file에 모두 쓴 뒤 lock path로 link하고, lock이 있으면 link가 실패하므로, lock은 atomic하게 잡히고
  읽는 쪽은 일부만 쓰인 record를 보지 않습니다.
- lock이 잡혀 있으면 실행은 holder의 record와 함께 실패합니다.
- holder process가 더 이상 실행되지 않거나 그 pid가 시작 시각이 다른 process의 것이 된 lock은 record와
  함께 보고하고 남겨 둡니다. `node scripts/kit/holder-lock.mjs clear <lock file>`로 명시적으로
  지우며, 이 command는 실행 중인 holder를 거부합니다.
- holder만 lock을 해제합니다. 해제는 먼저 record의 token을 확인합니다.
- `node scripts/kit/holder-lock.mjs run <lock file> -- <command>`는 lock을 잡은 채 command를 실행하고,
  SIGINT, SIGTERM, SIGHUP을 전달하며, command가 끝나면 lock을 해제하고 그 status로 끝납니다. 획득과
  해제를 출력합니다.

한 checkout의 resource lock은 그 checkout의 `var/locks/<name>.lock`이며, lock file은 절대 경로로 줍니다.
`tests/kit/holder-lock.test.mjs`는 record, 거부, 동시 실행, holder가 더 이상 실행되지 않는 lock의 제거, 해제를 확인합니다.

| Resource | 한 실행의 사용 |
|---|---|
| `make docs-verify-idempotent`의 snapshot | `mktemp -d`의 directory, 실행이 끝날 때 지움 |
| build되는 각 package의 `dist` | checkout lock `dist-<package folder>`, package build 전체와 모든 pack이 잡음; build는 `dist.next`에 쓰고 그것으로 `dist`를 바꿈 |
| build stamp, PHP module과 그 build 기록, OrderedJSON checkout | 실행의 경로에 쓴 뒤 제자리로 rename(`tests/build/atomic-publish.test.mjs`) |

build되는 모든 package의 build script는 `node ../../scripts/package-dist.mjs build '<command>'`이고,
package `dist` lock 아래에서 build command를 실행합니다. command는 `CRUDUI_DIST`가 가리키는 `dist.next`에 쓰고,
완료된 build는 rename 두 번으로 `dist`를 바꾸므로, build 중에 `dist`를 읽는 test나 program은 이전 output이나 새
output을 보며 비워진 directory는 보지 않습니다. 실패한 build는 `dist`를 그대로 둡니다. `node scripts/package-dist.mjs pack
<package directory> <destination directory>`는 같은 lock 아래에서 `dist`에 output이 있는지 확인하고
`npm pack`을 실행하며, 그 JSON report를 standard output에 출력합니다. package install check와 CRUDUI
archive를 설치하는 repository는 이것으로 pack하므로, build가 비운 `dist`를 읽는 pack은 없습니다.
Linux에서 lock은 process 시작 시각을 `/proc`에서 읽습니다. 최소 container image에는 `ps`가 없기
때문입니다.

`npm run test:runtimes`가 실행하는 `tests/build/shared-resources.test.mjs`는 documentation,
`dist` 행을 확인합니다. `dist` lock은 임시 checkout에서 build하는 fixture package로 확인하므로 저장소의 build
결과물을 읽지 않고 `npm run build`보다 먼저 실행됩니다.
