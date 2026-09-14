# 네이티브 생성기 검사

[English](native-generators.md).

명령은 저장소 루트에서 실행합니다. PHP, Go, Rust는 독립적인 폼과 목록 생성기를
제공합니다. PHP 확장은 공용 PHP 클래스를 사용하고 네이티브 코드로 폼 생성과 검증을
실행합니다. [런타임 계약](../spec/runtime-packages.ko.md)은 필요한 동작과 비교를
정의합니다.

## 로컬 빌드와 검사

동일한 설치의 `php-config`와 개발 헤더를 갖춘 64비트 PHP를 사용합니다. 순수 PHP는
PHP 8.2 이상, 확장은 PHP 8.4 이상이 필요합니다. Composer, Node, Go, Cargo, C
컴파일러를 설치합니다. 아래 컨테이너는 필요한 Linux 빌드 도구를 제공합니다.

```sh
npm ci --strict-allow-scripts
composer install --working-dir=packages/validator-php --no-interaction --prefer-dist
composer install --working-dir=packages/generator-php --no-interaction --prefer-dist
make test-native
make docs-check
```

`make test-native`는 JavaScript 패키지를 빌드한 다음 확장을 빌드하고 로드하며,
생성기 패키지 검사 및 JavaScript, PHP, Go, Rust, 네이티브 PHP 비교를 실행합니다.
확장 빌드는 `php-config`에서 PHP 실행 파일, 헤더, 빌드 플래그를 읽고 C 바인딩을
컴파일한 뒤 Cargo 잠금 파일의 Rust 출력을 직접 연결합니다. `phpize`, Autoconf,
libtool은 필요하지 않습니다. 도구 발견은 상대경로, 심볼릭 링크, 여러 결과를
거부합니다. 명시한 도구 경로는 정규 실행 파일을 식별해야 합니다.
Debian 계열 Linux에서 컴파일러 발견은 설치된 `gcc` 패키지 기록을 읽고 정규 target
compiler 파일 하나를 선택합니다. 여러 PHP 릴리스를 선택할 수 있으면
`PHP_EXTENSION_PHP_CONFIG`에 정규 versioned `php-config` 파일을 지정합니다.

PHP API 검사는 Composer 클래스, Composer 없는 확장, Composer를 함께 사용하는
확장의 세 프로세스를 실행합니다. 리플렉션은 실제 클래스 구현과 모든 공개 메서드
서명을 검사합니다. 공용 생성기 검사는 템플릿, 평가된 필드, 데이터, 행 동작, 원본
HTML과 각 거부의 코드·메시지·위치 전체를 비교합니다. 실행 전후 입력 해시를 기록하고
입력이 변경되면 실패합니다.

기본 보고서는 `.git/native-generators/report.json`입니다. `NATIVE_REPORT`로 다른
보고서 경로를 지정합니다. 통과한 실행은 임시 빌드 디렉터리를 삭제합니다. 실패한
실행은 디렉터리를 남기고 경로를 출력하며 보고서의 `buildDirectory`에 기록합니다. [검사 절차](../../tests/native-generators/README.ko.md)는
명시적인 확장 경로를 사용하는 직접 실행과 비교 프로토콜을 설명합니다. 실행 파일이나
네이티브 클래스가 없거나 응답 형식이 잘못되면 검사가 실패합니다.

브라우저 위젯 검사는 Chromium에서 생성된 선택자와 콜백을 실행합니다. 호스트 편집기
함수는 전달된 선택자와 인수를 검사합니다. 외부 편집기 구현을 설치하거나 검증하는
검사는 아닙니다.

## Apple container

컨테이너 정의에는 PHP 8.4와 개발 헤더, Node 26·Go 1.27 릴리스 계열, Rust 안정
채널, Composer, Chromium이 포함됩니다. 전체 저장소를 빌드 컨텍스트로 사용합니다.
호스트에서 생성한 의존성과 바이너리는 제외하며, 이미지 안에서 패키지 잠금 파일로
의존성을 설치합니다.

```sh
container build --cpus 4 --memory 4g \
  --file tests/containers/native.Containerfile \
  --tag localhost/crudui-native-check:0.0.1 .
container run --rm --cpus 4 --memory 4g \
  localhost/crudui-native-check:0.0.1
```

이미지의 기본 명령은 `make test-native`입니다. 보고서를 보존하려면 `--rm` 없이
이름을 지정한 컨테이너를 실행하고, 제거하기 전에 `/tmp/crudui-native-report.json`을
복사합니다. 이미지 빌드 성공은 컴파일과 모듈 로드를 확인하며, 검사 명령은 보고서에
기록된 비교를 확인합니다.

## HTTP와 브라우저 검증

패키지 예제는 각 언어의 라이브러리 사용을 보여 줍니다.
[폼 검증 절차](verification.ko.md)는 PHP, 네이티브 PHP, Go, Rust의 개별 HTTP
대상과 React, Vue, Svelte, HTML 렌더러 검사를 정의합니다. 폼과 순서 보존 JSON 전송, 잘못된 요청,
저장과 재조회를 모두 검증합니다.

브라우저에서 생성한 폼과 PHP, Go, Rust 검증 엔드포인트만으로는 서버 렌더링이
확인되지 않습니다. 서버 렌더링 결과에는 컴파일, 바인딩, 렌더링을 실행한 런타임을
기록해야 합니다. 정확한 소스, 검사 결과와 배포는 [기능 상태](../features.ko.md)에
구분해서 기록합니다.
