# JSON 문서 순서 검증
<!-- doc-id: docs-operations-ordered-json -->
<!-- source-sha256: da12de9807de34d91e359e788e660aaf397ca015a206a4431d4972d288d9d4c9 -->

[English](ordered-json.md). [폼 런타임 계약](../spec/form-runtime.ko.md)은 필요한
데이터 형태와 순서를 정의합니다. [기능 상태](../features.ko.md)는 검증과 런타임
배포를 구분해 기록합니다.

[폼 비교](../spec/form-comparison.ko.md)의 레코드 서버는 [OrderedJSON](https://github.com/polyspec/ordered-json)
0.0.9의 패키지로 JSON을 읽고 씁니다. `make install-ordered-json`이 만드는 tag `v0.0.9` 체크아웃의 JavaScript
`@polyspec/ordered-json`과 `packages/php-ext` 패키지의 `ordered_json` 확장, `v0.0.9`의 Go module
`github.com/polyspec/ordered-json/packages/go`, Git tag `v0.0.9`의 Rust crate `polyspec-ordered-json`입니다. PHP의
`Polyspec\OrderedJson`은 `config/release-assets.json`이 고정하는 release zip의 Composer 패키지 `polyspec/ordered-json`이며,
`make install-composer`가 이를 root `composer.json`의 artifact 저장소 `var/composer-artifacts`에 내려받습니다. 처리기 자체는 OrderedJSON의 parity 검사와 테스트가 다섯 구현에서 검증하며 crudui는 이를
반복하지 않습니다. crudui는 패키지 사용을 테스트합니다. `examples/form-comparison/src/json.test.mjs`, `servers/php`의 `FormJsonTest.php`,
Go 서버의 `json_test.go`, Rust 서버의 JSON 테스트는 레코드가 숫자 키와 키가 있는 행을 포함한 멤버 순서와 빈 타입을
유지하고, 폼 데이터 범위 밖의 숫자가 실패하는지 확인합니다.

폼 비교의 전송 모듈은 JSON 요청·응답과 저장소 파일에 이 처리기를 사용합니다. 처리기는 `Value` 노드를 반환하며,
JavaScript 객체 멤버는 `Map`입니다. 폼 세션은 일반 객체 데이터를 받습니다.
이 맵을 일반 JavaScript 객체로 변환하면 숫자 형태 멤버의 순서가 변경되므로
폼 변환은 그런 변경을 거부합니다.
현재 구분자를 포함한 13자리 행 키는 정수 인덱스 속성이 아니므로 기존 세션에서도
삽입 순서를 유지합니다.

폼과 JSON 전송은 같은 검증기와 저장소를 실행합니다. 런타임 연동은
[폼 검사](testing.ko.md#폼과-보고서)가 확인합니다. 레코드 저장소 HTTP 계약은 multipart, URL-encoded, JSON
저장과 잘못된 요청을 모든 레코드 서버에 보내고, 정본 흐름 검사는 모든 서버·클라이언트·초기화 방식의
폼에 입력하고 저장한 뒤 목록을 다시 불러옵니다.
