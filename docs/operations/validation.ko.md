# 데이터 검증

[English](validation.md).

클라이언트와 서버는 같은 스펙으로 데이터를 검증합니다. 필드는 검증 규칙에
`validate`를 사용합니다. 스펙의 선언 형식은 [스키마 절차](schema-validation.ko.md)로
별도 검증합니다. [스키마 계약](../spec/schema.ko.md)은 조합과 허용 필드를 정의합니다.

먼저 의존성을 설치하고 JavaScript 패키지를 빌드합니다. JavaScript와 PHP 예제는
저장소 루트에서 실행하며 Go와 Rust는 아래에 설명한 모듈 설정을 사용합니다.
각 예제는 필수 이메일에 빈 값을 제공하며 `valid`가 false인지 검사합니다.

## TypeScript와 JavaScript

패키지 루트는 `validate(spec, data, options?)`를 export합니다. 옵션은 조합에
필요한 `files`, `loader`, `basepath`를 받습니다. 로더를 지정하면 메모리 파일
집합보다 우선합니다.

```js
import { validate } from '@crudui/validator';

const spec = {
  type: 'group',
  properties: { email: { type: 'email', validate: { required: true, email: true } } },
};
const result = validate(spec, { email: '' });
if (result.valid || result.errors[0]?.rule !== 'required') {
  throw new Error('Expected required validation failure');
}
```

## PHP

`CRUDUI\Validator::validate`은 스펙, 데이터, 선택적 가상 파일,
선택적 로더와 기준 경로를 받습니다. 결과는 `valid`, `errors`, `toArray()`를 제공합니다.

```php
<?php
require 'packages/validator-php/vendor/autoload.php';

use CRUDUI\Validator;

$spec = [
    'type' => 'group',
    'properties' => [
        'email' => ['type' => 'email', 'validate' => ['required' => true, 'email' => true]],
    ],
];
$result = Validator::validate($spec, ['email' => '']);
if ($result->valid || $result->errors[0]['rule'] !== 'required') {
    throw new RuntimeException('Expected required validation failure');
}
```

## Go

`validator/validate` 패키지는 순서를 보존한 스펙 값에 `Validate`, JSON 바이트에
`ValidateJSON`을 제공합니다. `ValidateJSON`은 스펙 바이트, 데이터 바이트,
가상 파일 바이트와 기준 경로를 받습니다. 예제는 `packages/validator-go` 모듈에서
실행합니다. 결과는 `Valid`와 `Errors`를 제공합니다.

```go
package main

import (
    "fmt"
    "github.com/polyspec/crudui/packages/validator-go/validator/validate"
)

func main() {
    spec := []byte(`{"type":"group","properties":{"email":{"type":"email","validate":{"required":true,"email":true}}}}`)
    result, err := validate.ValidateJSON(spec, []byte(`{"email":""}`), nil, "")
    if err != nil {
        panic(err)
    }
    if result.Valid || len(result.Errors) == 0 || result.Errors[0].Rule != "required" {
        panic(fmt.Errorf("expected required validation failure"))
    }
}
```

## Rust

크레이트 루트는 `validate`와 `ValidateOptions`를 export합니다. 옵션은 가상 파일,
로더와 기준 경로를 받습니다. 예제는 `crudui-validator` 크레이트와
`serde_json` 의존성을 사용해 실행합니다.

```rust
use crudui_validator::{validate, ValidateOptions};
use serde_json::json;

fn main() {
    let spec = json!({
        "type": "group",
        "properties": {"email": {"type": "email", "validate": {"required": true, "email": true}}}
    });
    let result = validate(&spec, &json!({"email": ""}), &ValidateOptions::default())
        .expect("specification should load");
    assert!(!result.valid);
    assert_eq!(result.errors[0].rule, "required");
}
```

## 결과와 실패

검증 결과는 불리언과 오류 목록을 포함합니다. 각 오류는 `path`, `field`, `rule`,
`message`를 명시하며 값이 있으면 `value`를 포함합니다. 필수 입력 실패는 검증
결과입니다.

두 가지 실패는 검증 결과를 만들지 않습니다. 조합 참조가 없거나 금지된 스키마 키가
있으면 로드 실패(`ComposeLoadError`)입니다. 형태가 잘못된 제출 데이터는 입력
실패(`FormInputError`, 코드 `INVALID_FORM_INPUT`)입니다.

| 데이터 | 메시지 |
| --- | --- |
| 객체가 아닌 루트 데이터(합성 전에 검사) | `Form data must be an object` |
| 값이 있지만 객체가 아닌 그룹 데이터 또는 반복 그룹 행 | `Group data must be an object: {path}` |
| 값이 있지만 키 기반 객체가 아닌 반복 데이터 | `Repeated data must be a keyed object: {path}` |

그룹 또는 반복 데이터가 없는 것은 실패가 아닙니다. JavaScript와 PHP는 실패를
예외로 발생시키고, Go는 오류로 반환하며, Rust는 `Err(ValidateError)`를 반환합니다.
모든 구현은 같은 코드, 메시지, 위치를 보고합니다. 로드 실패의 위치는 조합 경로를
`.`으로 연결한 값이고 입력 실패의 위치는 빈 문자열입니다. 실패를 검증 결과로
변환하지 않습니다.

애플리케이션은 이 라이브러리 함수를 호출하며, 어떤 패키지도 검증 명령을 설치하지 않습니다.
교차 검증 콘솔은 같은 함수를 호출하는 작은 프로그램으로 각 구현을 별도 프로세스에서 실행해 네
구현을 비교합니다. 그 요청과 응답 계약은 콘솔의
[검증기 프로세스](../../examples/cross-check-console/validators/README.ko.md) 문서에 있습니다.

표시 여부는 검증을 비활성화하지 않습니다. `design.show: false`는 필드를 숨기지만
필수 규칙을 변경하지 않습니다. 조건부 필수 입력은 `validate.required`에 표현식을
사용합니다. [표현식 계약](../spec/expressions.ko.md)을 참고합니다.

데이터 검증은 HTTP 디코딩, 저장 또는 전송 순서를 구현하지 않습니다.
해당 작업은 [ordered JSON 절차](ordered-json.ko.md)와
[전송 검증 절차](verification.ko.md)를 따릅니다. 전체 심볼 참조는
`make docs-api`로 생성합니다. [문서 절차](documentation.ko.md)를 참고합니다.
