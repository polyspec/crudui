# CRUDUI Rust 검증기

[English](README.md).

`crudui-validator` 패키지 버전은 `0.0.1`입니다. 라이브러리는 폼 검증을
`crudui_validator::validate::validate`, 목록 검증을
`crudui_validator::list::validate_list`, 상세 검증을
`crudui_validator::detail::validate_detail`로 제공합니다. 현재 CLI는 `validate`,
별도 레거시 CLI는 `validate-legacy`입니다.

## CLI

`packages/validator-rust`에서 실행합니다.

```sh
cargo run --bin validate < request.json
```

입력은 `spec`과 선택 항목 `data`, `files`, `basepath`, `mode`를 포함한 JSON
객체입니다. 기본 모드는 `form`입니다. 폼 검증은 명세를 구성하고 금지 키를
검사한 다음 데이터를 검증합니다. `list` 모드는 목록 구조를, `detail` 모드는
상세 구조를 검사하며 둘 다 `data`를 무시합니다. 그 밖의 `mode` 값은 문자열이
아닌 JSON 값을 포함해 `{"error": "Unsupported validation mode"}`와 종료 상태
1을 반환합니다.

완료된 검증은 `valid`와 `errors`를 반환합니다. 각 검증 오류는 `path`,
`field`, `rule`, `message`, `value`를 포함합니다. `data` 항목을 생략하면 `{}`를
검증합니다. 폼 모드에서 `data`가 있는데 객체가 아니면(`null` 포함)
`INVALID_FORM_INPUT` 코드의 입력 실패입니다.

요청 오류는 정확히 `{"error": MESSAGE}`와 종료 상태 1을 반환하며 다음 순서로
검사합니다.

1. stdin이 올바른 JSON이 아님: `Request must be valid JSON`
2. 요청이 객체가 아님: `Request must be an object`
3. `spec`이 없거나 객체가 아님: `Request spec must be an object`
4. `mode`가 있는데 `form`, `list`, `detail`이 아님(`null`과 문자열이 아닌 값
   포함): `Unsupported validation mode`
5. `files`가 있고 `null`이 아닌데 객체가 아님: `Request files must be an object`
6. `files` 항목 중 객체가 아닌 값이 있음: `Request files must contain objects`
7. `basepath`가 있고 `null`이 아닌데 문자열이 아님:
   `Request basepath must be a string`

`files`와 `basepath`가 없거나 `null`이면 없는 것으로 봅니다. 로드 실패
(`ValidateError::Load`) 또는 형태가 잘못된 데이터의 입력 실패
(`ValidateError::Input`)는 정확히 `error`, `code`, `at`과 종료 상태 2를
반환합니다. 실패는 데이터 검증 결과가 아닙니다. 모든 언어의 CLI가 이 계약을
사용합니다.

## 검사

저장소 루트에서 실행합니다.

```sh
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml --test validate_cli_conformance
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml --test list_validity_conformance
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml --test detail_validity_conformance
```
