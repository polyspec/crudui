# PHP 네이티브 생성과 검증

[English](README.md).

`crudui` 확장은 PHP 프로세스에서 `CRUDUI\Generator`, `CRUDUI\Validator`,
`CRUDUI\Form`을 제공합니다. C 모듈은 공용 PHP 클래스를 등록하고 PHP 값을
순서 있는 Rust 값으로 직접 변환합니다. 독립 Rust 생성기와 검증기는 확장에
정적으로 연결합니다.

[PHP API 명세](../../docs/spec/php-extension.ko.md)는 메서드, 로딩, 데이터 타입,
예외를 정의합니다. 확장을 활성화하면 Composer 자동 로딩 전에 확장의
클래스를 사용할 수 있습니다. 확장을 비활성화하면 Composer가 PHP 패키지를
로드합니다. 각 프로세스는 한 구현을 사용합니다.

## 빌드와 검증

전체 저장소에서 64비트 PHP 8.4 이상, 일치하는 PHP 개발 헤더, C 컴파일러,
Autoconf, Make, Cargo로 빌드합니다. Linux와 macOS를 빌드 대상으로 지원합니다.
macOS 빌드는 11.0 이상을 대상으로 합니다. `phpize`와 `php-config`는 모듈을
로드할 PHP 바이너리와 일치해야 합니다.

저장소 루트에서 실행합니다.

```sh
sh scripts/build-php-extension.sh
composer install --working-dir=packages/generator-php
node packages/php-ext/tests/run.mjs "$(pwd)/packages/php-ext/modules/crudui.so"
npm run build
node tests/native-generators/run.mjs \
  --extension "$(pwd)/packages/php-ext/modules/crudui.so" \
  --report .git/native-generators/report.json
```

API 검사는 확장을 비활성화한 PHP, Composer 없는 확장, Composer를 사용하는
확장을 실행합니다. 클래스 구현 출처, 메서드 서명, 값 변환, 예외, 복사,
행 작업, 반복 인스턴스 생성을 검사합니다. 검증기는 공용 폼과 목록 유효성
데이터를 사용합니다. 생성기 적합성 검사는 다섯 구현을 각각 비교합니다.

`crudui.stub.php`는 네이티브 PHP 서명을 정의합니다. 스텁을 변경하면 PHP
개발 도구로 `crudui_arginfo.h`를 다시 생성합니다.

```sh
php packages/php-ext/build/gen_stub.php packages/php-ext/crudui.stub.php
```

생성한 헤더는 커밋합니다. 스텁 파일을 포함하여 PHP 클래스를 선언하지
않습니다. 캐시 템플릿은 일반 JSON 객체입니다. 네이티브 `Form` 인스턴스는
PHP 직렬화를 지원하지 않습니다. 템플릿을 캐싱하고 `getData()`를 저장합니다.

## HTTP 예제

PHP 생성기 예제는 두 구현에서 같은 호출을 사용합니다.

```sh
CRUDUI_DATA_FILE=/absolute/path/to/record.json \
  php -n -d "extension=$(pwd)/packages/php-ext/modules/crudui.so" \
  -S 127.0.0.1:8080 packages/generator-php/examples/index.php
```

예제는 HTML을 렌더링하고 폼 전송을 검증하며 승인된 데이터를 JSON으로
저장합니다. 레코드 경로는 명시해야 합니다. 패키지 빌드와 HTTP 검증은
패키지 게시와 구분합니다. 현재 결과는 [기능 상태](../../docs/features.ko.md)에
기록합니다.
