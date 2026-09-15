# 목록 유효성 고정 데이터

[English](README.md).

`cases.json`의 사례는 다른 구조 유효성 고정 데이터([폼](../spec-validity/README.ko.md),
[목록](../list-validity/README.ko.md), [상세](../detail-validity/README.ko.md))와 같은
`{ name, note, spec, files?, expect, reason?, engine }` 형태를 사용합니다.

- `expect`는 [메타 스키마](../../../schema/crudui.schema.json)의 `#/definitions/List`에 대한 메타 스키마 결과인 `"ok"` 또는 `"fail"`입니다.
- `reason`은 `"fail"` 사례에만 있으며 그 사례에는 반드시 있어야 합니다. 오류 중에 나타나야 하는 Ajv
  키워드를 지정합니다.
- `engine`은 런타임 구조 검증 결과입니다. `"pass"`는 로드 실패가 없고 결과가 `{ valid: true, errors: [] }`임을
  뜻하며, `{ code, at }`은 로드 실패 코드와 합성 경로를 `.`으로 이은 값입니다.
- `files`는 모든 런타임 사용처가 엔진에 전달하는 합성 파일 묶음입니다. 메타 스키마는 `spec`만 읽습니다.

두 결과는 서로 독립적입니다. 모든 사용처는 자신이 담당하는 모든 멤버를 적용하며, 사례를 스스로 분류하거나
자체 파일을 제공하는 사용처는 없습니다. `npm run spec:schema`로 실행하는
[`check-schema.mjs`](../../../scripts/check-schema.mjs)는 `expect`와 `reason`을 확인하기 전에 세 고정
데이터 모두의 형태를 검사합니다.

`columns` 누락, 알 수 없는 `sort` 키, 잘못된 `pagination.mode`처럼 메타 스키마만 거부하는 형태는
`engine: "pass"`입니다.

허용 사례는 최소 열, 모든 셀 형식, 축약형과 불리언 형식, 정렬, 페이지 나누기, 동작, 빈 상태와 디자인,
합성한 열, 합성한 검색 폼을 검사합니다. 거부 사례는 열 누락, 금지 키와 `x`로 시작하는 열 키, 열·정렬·
페이지 나누기·동작·목록 루트의 알 수 없는 키, 형식 옵션 안의 금지 키, 잘못된 열거값, 잘못된 형식 값을
다룹니다.

## 비교

[목록 메타 스키마 검사](../../../packages/validator-ts/src/list-metaschema.conformance.test.ts)와
`check-schema.mjs`는 목록 진입점을 컴파일해 `expect`와 `reason`을 확인합니다.

런타임 검사는 `spec`을 `files`와 함께 검증하고 행은 읽지 않으며 `engine`과 비교합니다. Rust 구조 API는
`"pass"`에 대해 `{ valid: true, errors: [] }`에 해당하는 `Ok(())`를 반환합니다. PHP 명령행 검사는 깨끗한
결과와 함께 종료 코드 `0`, 또는 `{ error, code, at }`과 함께 종료 코드 `2`를 기대하며, 교차 검증 콘솔은 모든
사례를 네 명령행 검증기에 보내 모두 같은 결과를 내기를 요구합니다.

[TypeScript](../../../packages/validator-ts/src/validate-list/validate-list.conformance.test.ts),
[PHP](../../../packages/validator-php/tests/Validate/ListValidateConformanceTest.php),
[PHP 명령행](../../../packages/validator-php/tests/Validate/ListValidateCliTest.php),
[Go](../../../packages/validator-go/validator/validate/list_conformance_test.go),
[Rust](../../../packages/validator-rust/tests/list_validity_conformance.rs)의 목록 검증 검사,
[PHP 확장 엔진 검사](../../../packages/php-ext/tests/engine.test.mjs),
[PHP 확장 실행기](../../../packages/php-ext/tests/validate.php), 교차 검증 콘솔의
[목록 실행기 검사](../../../examples/cross-check-console/server/validate-list-runner.test.mjs)가 런타임
사용처입니다.

## 재생성

생성기는 없으며 사례는 직접 작성합니다. `expect`와 `reason`은 메타 스키마의 목록 정의와, `engine`은 모든
런타임의 합성 및 금지 키 검사와 일치해야 합니다. 합성 사례는 참조하는 모든 파일을 `files`에 담아야 합니다.
사례를 변경한 뒤 메타 스키마 검사와 모든 런타임 사용처를 실행합니다.
