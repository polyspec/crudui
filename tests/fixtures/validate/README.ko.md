# 검증 고정 데이터

[English](README.md).

`cases.json`은 TypeScript, PHP, PHP 확장, Go, Rust가 공유하는 폼 검증 사례입니다. 각 사례는 `name`,
`note`, `spec`, `data`, 선택적인 `files`, 그리고 `expected` 또는 `expectFailure`를 제공합니다.
`expected`는 `{ valid, errors }` 전체 결과이며 모든 오류는 `path`, `field`, `rule`, `message`,
`value`를 가집니다. `expectFailure`는 `{ code, message, at }`입니다. 합성 실패의 `at`은 합성 경로를
`.`으로 이은 값이고 입력 실패의 `at`은 빈 문자열입니다.

규칙 안의 상대·부모·필드 경로, 삼항식과 조건맵 제한값, 조건부 필수 입력, 키를 가진 그룹과 스칼라, 반복
필드 경로, `unique`, `mincount`, `equalto`, 정규식과 `accept` 값, 번역한 라벨과 빈 라벨을 가진 선택지
포함 검사, 멤버 순서, 합성한 명세, 필드별 첫 오류, 메시지 재정의, 등록되지 않은 규칙, 숨겨도 검증하는
필드, 형식 규칙을 건너뛰는 빈 값, 제출 데이터의 형태를 검사합니다. 실패 사례는 `REF_FILE_NOT_FOUND`와
`INVALID_FORM_INPUT`을 사용합니다. [테스트 고정 데이터 계약](../../../docs/spec/test-fixtures.ko.md)이
형식을 설명합니다.

## 비교

모든 사용처는 검증기를 실행해 결과 또는 실패 기록 전체를 비교합니다. `errors` 배열은 순서대로 비교합니다.
Go·Rust·PHP는 숫자를 값으로 비교하므로 `5`와 `5.0`은 같습니다.
[PHP 확장 실행기](../../../packages/php-ext/tests/validate.php)는 JSON 문자열을 비교하므로 멤버 순서도
비교합니다. 실패 사례는 `code`, `message`, `at`을 정확히 비교하며, 모든 사례는 `expected`와
`expectFailure` 중 정확히 하나를 선언해야 합니다.

명령행 검사는 각 사례를 표준 입력으로 보냅니다. 결과 사례는 종료 코드 `0`과 함께 결과를 표준 출력에 쓰고,
실패 사례는 종료 코드 `2`와 함께 `{ error, code, at }`을 씁니다.

[TypeScript](../../../packages/validator-ts/src/validate.conformance.test.ts),
[PHP](../../../packages/validator-php/tests/Validate/ValidateConformanceTest.php),
[Go](../../../packages/validator-go/validator/validate/conformance_test.go),
[Rust](../../../packages/validator-rust/tests/validate_conformance.rs)의 검증 적합성 검사,
[TypeScript](../../../packages/validator-ts/src/validate-cli.test.ts),
[PHP](../../../packages/validator-php/tests/Validate/ValidateCliTest.php),
[Go](../../../packages/validator-go/cmd/validate/main_test.go),
[Rust](../../../packages/validator-rust/tests/validate_cli_conformance.rs)의 명령행 검사,
[PHP 확장 엔진 검사](../../../packages/php-ext/tests/engine.test.mjs)와
PHP 검증기와 네이티브 검증기를 실행하는 [PHP 확장 API 검사](../../../packages/php-ext/tests/api.test.mjs), 고정 사례를 네 명령행 검증기에 보내는 교차 검증 콘솔의
[검증 실행기 검사](../../../examples/cross-check-console/server/validate-runner.test.mjs)가 사용합니다.

## 재생성

저장소 루트에서 실행합니다.

```sh
node_modules/.bin/tsx tests/fixtures/validate/generate.ts > tests/fixtures/validate/cases.json
```

생성기는 TypeScript 검증기를 실행해 각 결과 또는 실패 기록을 기록합니다. 생성기가 JSON 문자열로 가진
명세는 `cases.json`에서도 멤버 순서를 유지합니다. 변경을 반영하기 전에 명세와 비교하여 검토하고 모든
사용처를 실행합니다. 재생성만으로 검증이 완료되지는 않습니다.
