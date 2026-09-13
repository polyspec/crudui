# CRUDUI Rust 검증기

[English](README.md).

`crudui-validator` 패키지 버전은 `0.0.1`입니다. 라이브러리는 폼 검증을
`crudui_validator::validate::validate`, 목록 검증을
`crudui_validator::list::validate_list`로 제공합니다. 현재 CLI는 `validate`,
별도 레거시 CLI는 `validate-legacy`입니다.

## CLI

`packages/validator-rust`에서 실행합니다.

```sh
cargo run --bin validate < request.json
```

입력은 `spec`과 선택 항목 `data`, `files`, `basepath`, `mode`를 포함한 JSON
객체입니다. 기본 모드는 `form`입니다. 폼 검증은 명세를 구성하고 금지 키를
검사한 다음 데이터를 검증합니다. `list` 모드는 목록 구조를 검사하고
`data`를 무시합니다.

완료된 검증은 `valid`와 `errors`를 반환합니다. 각 검증 오류는 `path`,
`field`, `rule`, `message`, `value`를 포함합니다. `data` 항목을 생략하면 `{}`를
검증합니다. 요청 문법이 잘못되면 `error`와 종료 상태 1을 반환합니다. 로드 실패
(`ValidateError::Load`) 또는 형태가 잘못된 데이터의 입력 실패
(`ValidateError::Input`)는 정확히 `error`, `code`, `at`과 종료 상태 2를
반환합니다. 실패는 데이터 검증 결과가 아닙니다. 모든 언어의 CLI가 이 계약을
사용합니다.

## 검사

```sh
cargo test
cargo test --test validate_cli_conformance
cargo test --test list_validity_conformance
```
