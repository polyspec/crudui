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
