# 적합성 검사 매트릭스

[English](conformance-matrix.md).

`contracts/conformance-matrix.json`은 언어 간·렌더러 간 적합성 검사의 실행 가능한 목록입니다.
수동 점검 뒤에 작성하는 보고서가 아닙니다. 각 대상 그룹, 공용 fixture 묶음, 기대 fixture 수,
검사 진입점을 선언합니다.

매트릭스는 네 개의 독립적인 대상 그룹을 둡니다.

- 검증 gateway: JavaScript·PHP·Go·Rust가 폼·목록 구조·상세 구조 fixture 전체를 각 언어로 실행합니다.
- 검증 확장: PHP 확장이 같은 검증 fixture 묶음을 실행합니다.
- 렌더 gateway: HTML·React·Svelte·Vue가 폼·목록·상세 렌더 fixture 전체를 실행합니다.
- native generator: JavaScript·HTML·PHP·Go·Rust·PHP 확장이 native 폼·목록·상세 검사를 전체 실행합니다.

브라우저 세션 대상은 native CLI 연산이 아니므로 별도 기록합니다. 기능이 `pass`를 선언하려면
해당 대상이 알맞은 매트릭스 그룹에 있어야 합니다. `tests/build/conformance-coverage.test.mjs`는
fixture 수, 대상, 검사 연결, 지원 대상 선언이 어긋날 때 실패합니다. 이 검사는 CI가 언어별 검사
전에 실행하는 `npm run test:runtimes`에 포함됩니다.

대상 일부를 선택해 실행한 결과는 전체 적합성의 증거가 아닙니다. 전체 증거는 필터 없이 그룹의
모든 대상이 성공적으로 끝난 경우에만 성립합니다. 실행 파일·native 모듈·검사 연결이 없거나
fixture 목록이 바뀌면 unsupported가 아니라 실패입니다.
