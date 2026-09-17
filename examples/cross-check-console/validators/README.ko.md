# 검증기 프로세스

[English](README.md).

교차 검증 콘솔은 각 언어의 검증기를 별도 프로세스에서 실행합니다. 이 프로그램들이 그 프로세스
경계입니다. 콘솔과 그 검사에 속하며 어떤 패키지도 이를 배포하지 않습니다. 애플리케이션은 검증기
라이브러리 함수를 호출합니다.

| 프로세스 | 프로그램 | 라이브러리 진입점 |
| --- | --- | --- |
| JavaScript | `js/validate.mjs` | `@crudui/validator`의 `validate`, `validateList`, `validateDetail` |
| PHP | `php/validate.php` | `CRUDUI\Validator::validate`, `validateList`, `validateDetail` |
| PHP 확장 | `php -d extension=… php/validate.php` | 확장의 클래스로 실행하는 같은 PHP 프로그램 |
| Go | `go/`(자체 `go.mod`를 가진 모듈) | `validate.ValidateJSON`, `ValidateListJSON`, `ValidateDetailJSON` |
| Rust | `rust/`(크레이트 `crudui-cross-check-validator`) | `crudui_validator::validate`, `validate_list`, `validate_detail` |

`../server`에서 `npm run build:validators`를 실행하면 Go 프로그램을 `go/validate`로, Rust
프로그램을 `rust/target/release/crudui-cross-check-validator`로 빌드합니다. JavaScript 프로그램은
빌드된 `@crudui/validator` 패키지를 import합니다. PHP 프로그램은 `packages/validator-php`의
Composer 자동 로더를 불러옵니다. 배포 환경은 `CRUDUI_CROSS_CHECK_GO_VALIDATOR`와
`CRUDUI_CROSS_CHECK_RUST_VALIDATOR`로 다른 Go·Rust 실행 파일을 지정할 수 있습니다.

## 요청

표준 입력은 JSON 객체 하나입니다.

```json
{ "spec": {}, "data": {}, "files": {}, "basepath": "", "mode": "form" }
```

`spec`만 필수입니다. `mode`의 기본값은 `data`를 검증하는 `form`입니다. `data` 항목을 생략하면
`{}`를 검증합니다. `list`와 `detail` 모드는 명세 구조를 검사하고 `data`를 무시합니다.
`files`와 `basepath`가 없거나 `null`이면 없는 것으로 봅니다.

## 응답

각 프로그램은 표준 출력에 JSON 한 줄을 쓰고 세 종료 상태 중 하나로 끝납니다.

| 종료 상태 | 출력 | 의미 |
| --- | --- | --- |
| `0` | 정확히 `{ "valid", "errors" }`, 각 오류는 `path`, `field`, `rule`, `message`, `value`를 가짐 | 검증 결과 |
| `2` | 정확히 `{ "error", "code", "at" }` | 로드 실패(`ComposeLoadError`) 또는 입력 실패(`INVALID_FORM_INPUT`). `at`은 합성 경로를 `.`으로 연결한 값이며 입력 실패에서는 빈 문자열 |
| `1` | 정확히 `{ "error" }` | 잘못된 요청 |

잘못된 요청은 다음 순서로 검사하는 규칙 중 처음 실패한 규칙의 메시지를 씁니다.

| 규칙 | 메시지 |
| --- | --- |
| 표준 입력이 올바른 JSON | `Request must be valid JSON` |
| 요청이 객체 | `Request must be an object` |
| `spec`이 객체 | `Request spec must be an object` |
| `mode`가 없거나 `form`, `list`, `detail` | `Unsupported validation mode` |
| `files`가 없거나 `null`이거나 객체 | `Request files must be an object` |
| `files`의 모든 항목이 객체 | `Request files must contain objects` |
| `basepath`가 없거나 `null`이거나 문자열 | `Request basepath must be a string` |

폼 모드에서 값이 있으면서 객체가 아닌 `data`(`null` 포함)는 입력 실패
`Form data must be an object`(종료 상태 `2`)입니다.

## 검사

`requests.json`은 요청 사례 목록입니다. 사례마다 `name`, `note`, 표준 입력 원문 `input`,
`expected: { exit, output }`이 있으며 `output`은 표준 출력에 쓰는 JSON 객체 전체입니다.
`scripts/check-schema.mjs`는 받아들이는 모든 요청의 명세를 메타 스키마로 검사합니다.

[`../server/validator-processes.test.mjs`](../server/validator-processes.test.mjs)는 모든 요청 사례와
[`tests/fixtures/validate`](../../../tests/fixtures/validate/README.ko.md),
[`tests/fixtures/list-validity`](../../../tests/fixtures/list-validity/README.ko.md),
[`tests/fixtures/detail-validity`](../../../tests/fixtures/detail-validity/README.ko.md)의 모든 사례를
다섯 프로세스에서 실행하고, 각 프로세스에 기대한 종료 상태와 응답 전체를 요구합니다. 목록과 상세
실패는 `code`와 `at`을 비교하며, 메시지는 엔진마다 비어 있지 않은 자체 문구를 씁니다.

```sh
npm test --prefix examples/cross-check-console/server -- validator-processes
```
