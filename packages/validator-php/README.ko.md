# CRUDUI PHP 검증기

[English](README.md).

PHP에서 명세를 합성하고, 표현식을 평가하고, 데이터를 검증합니다.

```sh
composer install --working-dir=packages/validator-php
composer test --working-dir=packages/validator-php
composer test:current --working-dir=packages/validator-php
```

## 공개 API

```php
require 'packages/validator-php/vendor/autoload.php';

use CRUDUI\Validator;

$spec = json_decode('{"type":"group","properties":{"name":{"type":"text","validate":{"required":true}}}}');
$result = Validator::validate($spec, ['name' => 'Ada']);
assert($result->valid);
```

`Validator::validate($spec, $data, $options)`는 명세를 합성하고, 지원하지 않는
메타데이터를 검사하고, 제출한 데이터를 검증합니다. `Validator::validateList`는
목록 명세의 합성과 메타데이터를 검사하며 행 데이터는 검증하지 않습니다.
`Validator::validateDetail`은 루트와 `fields` 맵의 `$ref`, `$patch`를 포함한 상세
명세의 합성과 메타데이터를 검사하며 레코드 데이터는 검증하지 않습니다. 두 메서드
모두 로드에 성공하면 `{ valid: true, errors: [] }`를 반환합니다.
옵션은 `files` 객체와 `basepath`를 받습니다. 합성 실패는
`CRUDUI\Validator\Compose\ComposeLoadError`를 발생시킵니다. 형태가 잘못된 제출
데이터는 코드 `INVALID_FORM_INPUT`인 `CRUDUI\Validator\Validate\FormInputError`를
발생시킵니다.
`getCompositionTrace()`는 명세 경로를 반환하고, `getTrace()`는 예외 스택을
반환합니다.

결과와 오류 항목은 `stdClass` 객체입니다. `errors`는 `path`, `field`, `rule`,
`message`, `value`를 포함하는 레코드 배열입니다. 연관 PHP 배열과 `stdClass`는
객체이며 연속된 PHP 배열은 배열입니다. 빈 객체는 `new stdClass()`를 사용합니다.
오류 값을 포함하여 중첩 객체, 배열과 `null`을 구분합니다. 잘못된 UTF-8 문자열과
객체 키는 검증 전에 `InvalidArgumentException`을 발생시킵니다.

공개 클래스는 `CRUDUI\Validator`입니다. 네이티브 확장이 클래스를 등록하면
PHP는 해당 구현을 사용하며, 그렇지 않으면 Composer가 PHP 클래스를 자동으로
로드합니다. [PHP API 계약](../../docs/spec/php-extension.ko.md)이 메서드 일치와
로딩 동작을 정의합니다. 내부 합성과 표현식 모듈은
[PHP 생성기](../generator-php/README.ko.md)와 공유합니다.

## 검증 CLI

```sh
php packages/validator-php/bin/validate.php < request.json
```

CLI는 `{ "spec": {}, "data": {}, "files": {}, "basepath": "", "mode": "form" }`을
수신합니다. `spec`만 필수입니다. `mode`를 생략하면 `data`를 검증하는 `form`입니다.
`list`는 `validateList`, `detail`은 `validateDetail`을 실행하며 둘 다 `data`를
무시합니다. `files`와 `basepath`를 생략하거나 `null`로 주면 없는 것으로 봅니다.

CLI는 검증 전에 요청을 다음 순서로 검사합니다. 처음 실패한 검사는 정확히
`{ "error": MESSAGE }`를 출력하고 종료 코드 1로 종료합니다.

1. 표준 입력이 유효한 JSON이 아니면 `Request must be valid JSON`.
2. 요청이 JSON 객체가 아니면 `Request must be an object`.
3. `spec`이 없거나 객체가 아니면 `Request spec must be an object`.
4. `mode`가 있고 정확히 `form`, `list`, `detail`이 아니면(`null`과 문자열이 아닌
   값 포함) `Unsupported validation mode`.
5. `files`가 있고 `null`도 객체도 아니면 `Request files must be an object`.
6. `files`의 항목이 객체가 아니면 `Request files must contain objects`.
7. `basepath`가 있고 `null`도 문자열도 아니면 `Request basepath must be a string`.

실행에 성공하면 종료 코드 0과 함께 `{ "valid": true, "errors": [] }`
또는 데이터 오류를 출력합니다. `data` 항목을 생략하면 `{}`를 검증하며, 값을
제공하면 JSON 객체여야 합니다. 로드 또는 입력 실패는 정확히
`{ "error", "code", "at" }`를 출력하고 종료 코드 2로 종료합니다. 잘못된 요청은
`{ "error" }`를 출력하고 종료 코드 1로 종료합니다. 모든 언어의 CLI가 이 계약을
사용합니다.

`composer test:current`는 합성, 표현식, 현재 검증과 필드 모델 검사를 실행합니다.
`composer test`는 유지하는 레거시 규칙 검사와 공개 심볼 문서 검사도 실행합니다.
[기능 상태](../../docs/features.ko.md)는 현재 검증과 게시 상태를 구분하여 기록합니다.
