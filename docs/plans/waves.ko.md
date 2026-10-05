# Wave 배경

[English](waves.md).

각 section은 [execution checklist](execution-checklist.ko.md)의 wave 하나의 의존과 배경을 적으며, checklist의 wave 제목이 이 section을 link한다.

## Wave 1

의존: 없음. `@crudui/generator-core/crudui.css`는 CRUDUI block의 유일한 stylesheet이고, 좁은 viewport를 위한 rule이 없다. form, list, detail을 phone 폭으로 여는 test도 없다. Tailwind CSS로 꾸미는 page는 CRUDUI style을 그 Tailwind build와 theme으로 build할 수 없다. CRUDUI는 고유 stylesheet와 Tailwind 버전을 함께 내고, 설치하는 쪽이 둘 중 하나를 고른다.

## Wave 2

의존: 없음. AGENTS의 rule은 feature가 끝날 때마다 full suite를 실행하게 했고, 긴 작업은 step log로 timeout을 대신하게 했다. suite를 실행하는 CI job은 모든 test 위에 10~30분의 job timeout을 둔다. benchmark driver test는 Go와 Rust driver를 test 안에서 600초 한도로 compile한다. tree verification의 build readiness 대기는 state file을 1초마다 읽고, 그 test는 wall-clock 시간을 한도와 비교한다. `scripts/run-tests.mjs`의 PHPUnit mode는 class와 data provider suite를 통과한 test로 세고, TeamCity message가 아닌 줄을 모두 버린다.

## Wave 3

의존: 없음. 다른 checkout의 실행이 같은 resource를 쓴다: `/tmp` 아래의 고정 directory, Linux style check의 Playwright image, comparison deployment, 그리고 package build가 비우고 다른 repository가 pack하는 `dist` directory. 한 실행이 다른 실행이 쓰는 resource를 바꾸거나 초기화할 수 있다. 한 실행이 소유할 수 있는 resource는 그 실행의 directory나 이름을 받고, 하나뿐인 resource는 holder lock을 받는다: 한 번에 한 holder, holder의 checkout, pid, process 시작 시각을 밝히는 거부, holder에 의한 해제.

## Wave 4

의존: 없음. checklist가 사용법의 범례와 C2.1-2의 문장에 작업 상태 표시를 적었으므로, file의 표시를 세는 도구가 존재하지 않는 진행 중 작업을 셌다. 작업 상태 밖의 checklist를 읽는 검사가 없었다.

## Wave 5

의존: 없음. CI는 2026-09-25부터 모든 push에서 실패했고, 같은 tree에서 local `make ci`는 통과했다. local full run은 이전 실행의 build 결과물이 있는 working tree에서 시작하고 macOS의 Apple clang으로 C를 compile한다. CI는 각 job을 새 checkout에서 시작하고 Linux의 GCC로 compile한다. 실패한 step은 그 job의 이후 검사를 건너뛰게 했고, `make test-native`의 실패한 prerequisite는 native suite를 건너뛰게 했으므로, CI 실행 한 번이 모든 실패를 보여 주지 않았고 conformance 검사는 그것을 써야 했던 suite 없이 빠진 evidence를 보고했다.

## Wave 6

의존: 없음. AGENTS와 testing 안내는 모든 진행 중 작업이 끝났을 때만 push한다고 정하지만, 이를 강제하는 것이 없었다. 진행 중 작업이 있는 push가 GitHub에 도달했고, GitHub의 CI는 push된 tree에서 full suite를 실행한다. Git은 hook을 version 관리하지 않고 `core.hooksPath`는 clone마다의 설정이므로, hook은 그것을 설치한 clone에서만 동작하며 `git push --no-verify`나 다른 clone은 hook 없이 push한다. GitHub은 file의 내용으로 push를 거부할 수 없고, workflow는 push가 받아들여진 뒤에 실패한다.

## Wave 7

의존: 없음. 날짜, machine, 실행 순서에 따라 달라지는 결과가 있었다. GNU Make 3.81과 4에서 출력이 다른 make dry run, 정확한 toolchain version 대신 release channel, test case나 명령 없이 통과하는 실행, 처음 실패한 suite에서 멈추는 연결, 다른 명령이 남긴 출력을 읽는 검사, 다른 실행이 읽는 동안 제자리에 쓰는 출력, 사용 전에 확인한 port, machine npm을 바꾸는 설치, 명령, 경로, 한도가 없는 실패, 변경의 소유 검사를 기계적으로 고르지 않는 것, 죽이지만 기다리지 않는 process tree다. 이런 종류의 결함은 모든 repository에서 class로 고치고, AGENTS에 class마다 규칙 하나를 둔다.
