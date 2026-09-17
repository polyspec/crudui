# PHP 네이티브 생성과 검증

[English](README.md).

`crudui` 확장은 PHP 프로세스에서 `CRUDUI\Generator`, `CRUDUI\Validator`,
`CRUDUI\Form`을 제공합니다. C 모듈은 PHP 클래스를 등록하고 PHP 값을 자체
순서 보존 값 모델로 직접 변환합니다.

[PHP API 명세](../../docs/spec/php-extension.ko.md)는 메서드, 로딩, 데이터 타입,
예외를 정의합니다. 확장을 활성화하면 Composer 자동 로딩 전에 확장의
클래스를 사용할 수 있습니다. 확장을 비활성화하면 Composer가 PHP 패키지를
로드합니다. 각 프로세스는 한 구현을 사용합니다.

## 빌드와 검증

전체 저장소에서 64비트 PHP 8.4 이상, 일치하는 PHP 개발 헤더, `php-config`, C
컴파일러로 빌드합니다. Linux와 macOS를 빌드 대상으로 지원합니다. macOS
빌드는 11.0 이상을 대상으로 합니다. 빌드는 컴파일 전에 정규 실행 파일 경로를 확인하고
심볼릭 링크, 여러 발견 결과, 서로 다른 PHP 설치 정보를 거부합니다. `phpize`,
Autoconf, libtool은 사용하지 않습니다.

`pattern`과 `match` 규칙은 PHP의 PCRE2 API를 사용합니다. 대상 PHP의
`main/php_config.h`에 `HAVE_BUNDLED_PCRE`가 정의되지 않았으면 PHP는 외부
PCRE2를 사용하고, 빌드는 `pkg-config --cflags libpcre2-8`이 알려 주는 include
경로를 추가합니다. 이때 macOS에서는 Homebrew `pkgconf` formula, Linux에서는
Debian `pkgconf-bin` 패키지의 정규 `pkgconf` 실행 파일을 사용하며,
`--pkg-config` 또는 `PHP_EXTENSION_PKG_CONFIG`로 지정할 수도 있습니다. PCRE2
개발 파일(Homebrew `pcre2`, Debian `libpcre2-dev`)이 필요합니다. 번들 PCRE2를
사용하는 PHP에는 추가 요구 사항이 없습니다.

저장소 루트에서 실행합니다.

```sh
node scripts/build-crudui-php-extension.mjs
composer install --working-dir=packages/generator-php
node scripts/run-tests.mjs node -- packages/php-ext/tests/api.test.mjs
npm run build
node tests/native-generators/run.mjs \
  --extension "$(pwd)/packages/php-ext/modules/crudui.so" \
  --report .git/native-generators/report.json
```

API 검사는 확장을 비활성화한 PHP, Composer 없는 확장, Composer를 사용하는
확장을 실행합니다. 클래스 구현 출처, 메서드 서명, 값 변환, 예외, 복사,
행 작업, 반복 인스턴스 생성을 검사합니다. 검증기는 공용 폼과 목록 유효성
데이터를 사용합니다. 생성기 적합성 검사는 확장과 PHP 패키지를 별도로 검사합니다.

`crudui.stub.php`는 네이티브 PHP 서명을 정의합니다. 스텁을 변경하면 PHP
개발 도구로 `crudui_arginfo.h`를 다시 생성합니다.

```sh
/absolute/path/to/php -n /absolute/path/to/php-build/gen_stub.php \
  packages/php-ext/crudui.stub.php
```

두 외부 경로는 같은 PHP 개발 도구 설치의 정규 파일이어야 합니다. 빌드는 PHP 빌드
도구의 로컬 복사본을 생성하거나 유지하지 않습니다.

생성한 헤더는 커밋합니다. 스텁 파일을 포함하여 PHP 클래스를 선언하지
않습니다. 캐시 템플릿은 일반 JSON 객체입니다. 네이티브 `Form` 인스턴스는
PHP 직렬화를 지원하지 않습니다. 템플릿을 캐싱하고 `getData()`를 저장합니다.

## HTTP 예제

PHP 예제는 확장을 로드하고 공개 클래스를 호출합니다.

```sh
CRUDUI_DATA_FILE=/absolute/path/to/record.json \
  php -n -d "extension=$(pwd)/packages/php-ext/modules/crudui.so" \
  -S 127.0.0.1:8080 packages/generator-php/examples/index.php
```

예제는 HTML을 렌더링하고 폼 전송을 검증하며 승인된 데이터를 JSON으로
저장합니다. 레코드 경로는 명시해야 합니다. 패키지 빌드와 HTTP 검증은
패키지 게시와 구분합니다. 현재 결과는 [기능 상태](../../docs/features.ko.md)에
기록합니다.
