# 입력 텍스트 픽스처

[English](README.md).

이 케이스들은 [입력 텍스트](../../../docs/spec/input-text.ko.md) 규칙을 정의합니다. 명세, 합성 파일,
호출자 데이터의 모든 문자열과 객체 멤버 이름은 유니코드 스칼라 값의 나열이며, 연산은 다른 검사보다
먼저 그 밖의 텍스트를 거부합니다.

각 디렉터리에는 연산 하나의 `cases.json`이 있습니다. 연산은 `validate`, `validateList`,
`validateDetail`, `compileForm`, `bindForm`, `createForm`, `buildList`, `buildDetail`입니다. 파일은
쌍이 없는 서로게이트를 `"\ud800"` 같은 이스케이프로 쓴 JSON 텍스트입니다. 단독 하위 서로게이트와
순서가 뒤바뀐 `"\udc00\ud800"`도 문자열 값, 멤버 이름, 배열, 중첩 행, 합성 파일, 옵션에 들어
있습니다. 이 이스케이프를 바꾸거나 거부하는 디코더로는 파일을 읽을 수 없으므로, 각 소비자는 명세가
해당 런타임에 지정한 디코더로 읽습니다.

케이스는 `name`, `note`, `expect`와 연산의 입력을 가집니다.

- `spec`, 그리고 검증 연산의 `files`
- `data`(검증, 바인딩, 인스턴스), `rows`(목록), `record`(상세)
- `options`. 생성 연산의 합성 파일은 `files` 멤버에 둡니다
- `template`. `spec`에서 컴파일한 템플릿 대신 JSON 텍스트로 주는 템플릿입니다
- `action`. 생성한 폼에 대한 `{ method, args }` 호출 하나이며, 그 결과가 기대값입니다

`expect`는 실패 `{ code, message, at }`이거나 통과하는 케이스의 결과입니다. 검증 연산은 검증 결과
`{ valid, errors }`, 생성 연산은 `"pass"`입니다. 올바른 서로게이트 쌍과 U+E000부터 U+FFFF까지의
문자를 쓴 케이스는 올바른 텍스트가 통과하는지, 멤버가 코드 포인트 순서를 따르는지 확인합니다.

## 소비자

검증 연산은 [TypeScript](../../../packages/validator-ts/src/text/text-validity.conformance.test.ts),
[PHP](../../../packages/validator-php/tests/Validate/TextValidityConformanceTest.php),
[Go](../../../packages/validator-go/validator/validate/text_conformance_test.go),
[Rust](../../../packages/validator-rust/tests/text_validity_conformance.rs) 테스트,
[API 테스트](../../../packages/php-ext/tests/api.test.mjs)가 실행하는
[PHP 확장 러너](../../../packages/php-ext/tests/validate.php), 그리고 모든 케이스를 다섯 검증
프로세스에 보내는 교차 검증 콘솔
[검증 프로세스 테스트](../../../examples/cross-check-console/server/validator-processes.test.mjs)가
실행합니다.

생성 연산은 [generator core 테스트](../../../packages/generator-core/src/input-text.test.ts)가
프로세스 안에서 실행하고, [네이티브 생성기 스위트](../../native-generators/README.ko.md)가 모든
프로그램으로 실행하며 JavaScript, PHP, Go, Rust, PHP 확장 런타임의 증거를 기록합니다.

UTF-8이 아닌 바이트 문자열은 JSON 텍스트로 쓸 수 없습니다. PHP, Go, Rust 디코더, PHP 확장 테스트가
직접 검사하고, 프로그램은 UTF-8이 아닌 표준 입력을 거부합니다.

## 케이스 변경

케이스는 직접 작성합니다. 케이스마다 기대값을 하나 두고, 변경한 뒤에는 모든 소비자를 실행합니다.
