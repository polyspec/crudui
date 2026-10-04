# Execution checklist

[English](execution-checklist.md).

이 문서는 CRUDUI의 계획된 작업과 각 작업의 verification command, 상태를 담는다. contract는 [specification](../spec/form-markup.ko.md)에, feature별 상태는 [feature status](../features.ko.md)에, 실제 변경은 [changelog](../../CHANGELOG.ko.md)에 있다.

## 사용법

- Task ID 형식은 `C<wave>.<number>`다. branch는 `{type}/{shortname}-C<wave>.<number>`, worktree는 `crudui-{shortname}-C<wave>.<number>`다(AGENTS).
- 모든 작업 행의 마지막 열은 상태다(AGENTS). `[ ]` 대기, `[~]` 진행 중, `[o]` 완료, `[!]` 원인과 재시도 조건을 적은 일시 우회. 커밋된 tree에서 verification이 통과한 뒤에만 `[o]`로 바꾼다.
- 작업은 specification을 먼저 바꾸고, failing test를 더하고, 그다음 implementation을 바꾼다.
- wave는 의존으로 적은 wave가 끝나면 시작한다.

## Wave 1 — 좁은 viewport를 위한 stylesheet와 stylesheet의 Tailwind 버전

의존: 없음. `@crudui/generator-core/crudui.css`는 CRUDUI block의 유일한 stylesheet이고, 좁은 viewport를 위한 rule이 없다. form, list, detail을 phone 폭으로 여는 test도 없다. Tailwind CSS로 꾸미는 page는 CRUDUI style을 그 Tailwind build와 theme으로 build할 수 없다. CRUDUI는 고유 stylesheet와 Tailwind 버전을 함께 내고, 설치하는 쪽이 둘 중 하나를 고른다.

| ID | 작업 | Verification | 상태 |
|---|---|---|---|
| C1.1 | 좁은 viewport를 명세한다. 공유 fixture의 모든 block은 viewport 폭 360 CSS pixel과 1280 pixel에서 page의 가로 overflow 없이 렌더되고, 모든 control과 action은 viewport 안에 있다 | `make docs-check` | [o] |
| C1.2 | 공유 fixture에 대한 좁은 viewport browser case를 더하고, `crudui.css`가 overflow하는 곳에서 실패하는지 확인한 뒤 `crudui.css`를 고친다 | browser case, `make docs-check` | [o] |
| C1.3 | Tailwind 버전을 명세한다. `@crudui/generator-core/crudui.tailwind.css`는 `crudui.css`의 rule을 Tailwind CSS 4의 cascade layer `components`에 담고, `crudui.css`에서 생성되며 그것과 대조된다. 그래서 이 file은 `tailwindcss` 뒤에 import되고, Tailwind utility가 CRUDUI rule보다 우선한다. markup은 바뀌지 않고, 최신 stable Tailwind CSS의 theme과 utility로 compile한 결과는 두 폭에서 공유 fixture의 모든 element에 `crudui.css`와 같은 computed style을 준다. 2026-10-04 수정: 처음 문장은 `@apply`로 쓴 두 번째 stylesheet를 요구했는데, 약 900개 rule을 손으로 두 벌 쓰면 둘이 어긋날 수 있다 | `make docs-check` | [o] |
| C1.4 | 커밋된 file도 검사하는 script로 `crudui.tailwind.css`를 생성한다. 최신 stable Tailwind CSS로 compile해 세 engine에서 두 폭으로 computed style을 `crudui.css`와 비교하는 case를 더한다. file이 없을 때 둘 다 실패하는지 확인한다 | 생성 검사, 비교 case | [o] |
| C1.4-1 | viewport test, Tailwind test, 생성 script가 저장소 검사를 통과하게 한다. `make ci`는 `npm run lint`에서 실패했다. 두 test가 browser global을 쓰는 함수를 page에 넘기면서 Node와 browser file 목록에 없었고 `console.log`로 썼기 때문이다. `npm run test:runtimes`에서도 실패했다. `test:forms`가 실행하는 script가 `scripts/test-progress/progress.mjs`로 출력하지 않았기 때문이다. test를 목록에 넣고, `t.diagnostic`으로 보고하고, progress line으로 출력한다 | `make ci` | [o] |
| C1.5 | package export, feature status, operations 문서, changelog, full test suite | full test suite, `make docs-check` | [o] |

## Wave 2 — test별로 제한되고 관측되는 test 실행

의존: 없음. AGENTS의 rule은 feature가 끝날 때마다 full suite를 실행하게 했고, 긴 작업은 step log로 timeout을 대신하게 했다. suite를 실행하는 CI job은 모든 test 위에 10~30분의 job timeout을 둔다. benchmark driver test는 Go와 Rust driver를 test 안에서 600초 한도로 compile한다. tree verification의 build readiness 대기는 state file을 1초마다 읽고, 그 test는 wall-clock 시간을 한도와 비교한다. `scripts/run-tests.mjs`의 PHPUnit mode는 class와 data provider suite를 통과한 test로 세고, TeamCity message가 아닌 줄을 모두 버린다.

| ID | 작업 | Verification | 상태 |
|---|---|---|---|
| C2.1 | AGENTS에 test rule을 적는다. 작업 중에는 바뀐 것을 소유한 Red와 Green test만 실행한다. full suite는 활성 작업이 모두 끝났을 때 정확히 한 번 실행한다. 긴 작업은 자기 timeout에 더해 step log를 출력한다. `make docs-check`는 문서나 공개 API 문서가 바뀌었을 때만 실행한다. Verification 열에는 소유 명령을 적는다. Cause: AGENTS는 feature가 끝날 때마다 full suite를 실행하게 했고 step log가 timeout을 대신하게 했다. Red: AGENTS.md와 AGENTS.ko.md에 그 문장이 있다. Green: 새 rule이 있다 | `node scripts/check-documents.mjs`, `node scripts/run-tests.mjs node --timeout 10 -- tests/docs/changelog.test.mjs tests/docs/repository-writing.test.mjs` | [o] |
| C2.2 | suite를 실행하는 모든 CI job에서 job timeout을 없애고 setup step마다 짧은 자기 timeout을 둔다. `tests/build/test-commands.test.mjs`는 suite step이나 suite step을 가진 job에 `timeout-minutes`가 있거나 그 job의 setup step에 없으면 실패한다. `test:form-comparison:pipeline`은 build를 제한하는 `scripts/require-current-build.mjs`로 build하고, 그 Go와 Cargo test는 `scripts/run-tests.mjs`로 실행한다. Cause: test 검사가 모든 job에 `timeout-minutes`를 요구해서 13개 job이 test 위에 10~30분 한도를 두었다. Red: 새 case가 test를 실행하면서 `timeout-minutes`를 가진 13개 job과 timeout이 없는 그 setup step을 나열했다. Green: 바뀐 workflow에서 같은 case가 통과한다 | `node scripts/run-tests.mjs node -- tests/build/test-commands.test.mjs tests/build/form-comparison-ci.test.mjs` | [o] |
| C2.3 | Go와 Rust benchmark driver를 step log와 build 한도를 가진 별도 단계에서 build하고, `tests/build/bench-drivers.test.mjs`는 build된 driver를 초 단위 timeout으로 실행한다. 600초나 590초 한도를 가진 case는 없다. Cause: accepted case가 `go run`과 `cargo run --release`를 실행해서 600초 timeout과 590초 deadline을 가진 test 안에서 driver를 compile했고, Rust의 rejected case마다 Cargo를 다시 실행했다. Red: `tests/build/test-commands.test.mjs`의 새 case가 `node scripts/run-tests.mjs node --timeout 600 -- tests/build/bench-drivers.test.mjs`에서 실패했다. 그 실행은 Cargo target이 준비된 상태에서 Rust accepted case에 8.1초, Rust rejected case에 10.6초가 걸렸다. Green: 같은 case가 통과한다. `npm run test:bench`는 package를 build한 뒤 Go driver를 1.0초, Rust driver를 0.6초에 build하며 각각 시작, 결과, 경과 시간을 출력하고, driver test의 모든 test는 30초 timeout 아래에서 1.9초 안에 끝난다. `tests/build/bounded-commands.test.mjs`는 끝나지 않는 driver build를 한도에서 멈춘다 | `node scripts/run-tests.mjs node -- tests/build/test-commands.test.mjs tests/build/bounded-commands.test.mjs`, `npm run test:bench` | [o] |
| C2.4 | build readiness를 state file의 변경(`fs.watch`)과 주입 가능한 clock으로 기다린다. readiness test는 명시적인 event와 fake clock으로 상태를 바꾸고 wall-clock 시간을 비교하지 않는다 | `node scripts/run-tests.mjs node -- examples/form-comparison/check-verification.test.mjs` | [ ] |
| C2.6 | CI test step이 닿는 test 아닌 명령을 모두 제한한다. cross-check console `pretest`의 Go와 Rust validator build, `test:form-comparison:source`의 package build, `make test-native-suites`의 `composer reinstall`, `make docs-check`의 문서 build에는 자기 한도가 없다. Cause: C2.2가 이들을 제한하던 job 한도를 없앴다 | 작업에서 정할 소유 검사 | [ ] |
| C2.5 | `scripts/run-tests.mjs`의 PHPUnit mode에서 class나 data provider suite가 아니라 PHPUnit test만 세고, TeamCity message가 아닌 PHPUnit 줄을 출력한다. Cause: `testSuiteFinished` message에는 location이 없어서 class나 data provider method의 끝이 통과한 test로 세어졌고, TeamCity message가 아닌 줄은 모두 버려졌다. Red: TeamCity case가 1개인 통과 test를 3개로 셌고 PHPUnit banner와 `Test file "/missing.php" not found` 줄을 잃었다. validator-php 실행은 PHPUnit의 763개에 대해 804 passed를 보고했다. Green: 같은 case가 1 passed, 1 failed를 세고 두 줄을 출력한다. validator-php 실행은 763 passed를 보고한다 | `node scripts/run-tests.mjs node -- tests/build/run-tests.test.mjs` | [o] |
