# CRUDUI Rust 검증기

[English](README.md).

`crudui-validator` 패키지 버전은 `0.0.1`입니다. 라이브러리이며 명령을 설치하지
않습니다.

## API

```rust
use crudui_validator::{validate, validate_detail, validate_list, ValidateOptions};

let result = validate(&spec, &data, &ValidateOptions::default())?;
```

- `validate(&spec, &data, &ValidateOptions)`는 폼 명세를 구성하고 금지 키와 검증
  규칙 매개변수를 검사한 다음 `data`를 검증합니다. `valid`와 `errors`를 가진
  `ValidationResult`를 반환하며, 각 오류는 `path`, `field`, `rule`, `message`,
  `value`를 포함합니다.
- `validate_list(&spec, &ValidateListOptions)`는 목록 구조를,
  `validate_detail(&spec, &ValidateDetailOptions)`는 `fields` 맵을 포함한 상세
  구조를 검사합니다. 둘 다 깨끗한 구조에 `Ok(())`를 반환합니다.

옵션은 `$ref`용 가상 파일 집합 `files`, `loader`, 상대 참조용 `basepath`를
받습니다. `validate`는 합성 실패나 금지 키 실패에 `Err(ValidateError::Load)`를,
형태가 잘못된 데이터에 코드 `INVALID_FORM_INPUT`의 `Err(ValidateError::Input)`을
반환하고, 구조 검사는 `ComposeLoadError`를 `Err`로 반환합니다. 실패는 데이터 검증
결과가 아닙니다. [검증 절차](../../docs/operations/validation.ko.md)가 모든 언어의
사용법을 보여 줍니다.

## 검사

저장소 루트에서 실행합니다.

```sh
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml --test list_validity_conformance
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml --test detail_validity_conformance
```
