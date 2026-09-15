# 네이티브 생성기 적합성 검사

[English](README.md).

검사기는 JavaScript 기준 구현(React 서버 렌더링), JavaScript HTML 렌더러, PHP, Go, Rust,
PHP 네이티브 확장을 실행합니다. 네이티브 모듈의
절대 파일 경로가 필요합니다. 대상 누락, 프로세스 실패, 잘못된 응답, 비교 실패가
있으면 명령이 실패합니다. 보고서는 사용할 수 없는 대상을 별도로 기록하고,
실행 가능한 대상의 검사를 계속하여 실제 결과를 수집합니다.

```sh
node scripts/require-current-build.mjs
generator_php=packages/generator-php
composer install --working-dir="$generator_php"
node --test --test-timeout=10000 tests/native-generators/protocol.test.mjs
node tests/native-generators/run.mjs \
  --extension /absolute/path/to/crudui.so \
  --report .git/native-generators/report.json
```

## 진행 상황, 시간 예산, 선택 실행

검사기는 실행 중에 자신의 상태를 보고합니다. 모든 줄에 시작 이후 경과 시간이
붙습니다. 입력 해시, 각 대상의 준비, 각 검사 그룹의 시작과 통과 수·소요 시간을
담은 종료, 5초 이상 계속되는 그룹이나 검사의 실행 중 줄, 각 대상의 합계입니다.

```
[    0.1s] inputs: 561 files hashed (0.1s)
[    0.1s] targets: php, go; checks matching list, dates
[    0.1s] php: preparing
[    0.2s] php: prepared (0.1s)
[    0.2s]   php · list: running
[    4.0s]   php · list: 44/44 passed (3.7s)
[    5.0s] php: 47/47 checks passed (4.9s)
```

각 검사에는 그룹에서 가장 느린 검사의 측정값으로 정한 시간 예산이 있습니다. 폼
고정 사례, 폼 인스턴스, 타임존 사례는 20초(측정값 385ms, 335ms, 282ms)이고 나머지
그룹은 10초(측정값 130ms 미만)입니다. Go와 Rust 생성기를 빌드하는 준비 단계는 각각
300초와 900초입니다.
예산을 넘긴 검사는 그 검사가 시작한 모든 프로세스와 함께 중단되고 검사 id와 함께
보고되며 실행을 실패로 만듭니다. 다음 검사는 계속 실행하므로 멈춘 검사 하나가
보고서 전체를 막지 않습니다.

한 대상이나 한 영역을 개발하는 동안에는 해당 검사만 실행합니다. 전체 검사는 변경이
끝난 뒤 한 번 실행합니다. 아래 명령은 차례대로 Rust 대상만, Go와 네이티브 PHP 대상의
목록·상세 검사만, id에 `lang`이 들어 있는 폼 고정 사례만 실행합니다. `*`는 임의의
문자열과 일치합니다.

```sh
node tests/native-generators/run.mjs --extension /absolute/crudui.so --target rust
node tests/native-generators/run.mjs --extension /absolute/crudui.so \
  --target go,php-native --check list,detail
node tests/native-generators/run.mjs --extension /absolute/crudui.so \
  --check 'form-fixture:*lang*'
```

`--target`은 `javascript`, `html`, `php`, `go`, `rust`, `php-native`를 받습니다.
`--check`는 그룹 이름(`form-fixture`, `list`, `detail`, `number`, `instance`,
`reject`, `compile-reject`, `member-order`, `bindForm-option-reject`,
`form-option-reject`, `bindForm-shape-reject`, `form-shape-reject`, `dates`), 전체
검사 id, `*`를 포함한 패턴을 받습니다. 두 옵션 모두 쉼표로 여러 값을 지정할 수 있고
여러 번 쓸 수 있습니다. 어떤 검사와도 일치하지 않는 선택은 실패하며, 보고서에
선택 내용을 기록하므로 선택 실행을 전체 실행으로 오인하지 않습니다.

검사기가 Go와 Rust 실행 파일을 빌드합니다. `PHP`, `GO`, `CARGO`로 해당 설치 명령을
지정할 수 있습니다. 확장은 네이티브 `CRUDUI\Generator`, `CRUDUI\Validator`,
`CRUDUI\Form` 클래스를 등록해야 합니다. Reflection으로 세 클래스가 네이티브
PHP에서는 내부 클래스이고 순수 PHP에서는 사용자 정의 클래스인지 확인합니다.
PHP 메서드 서명과 수명 검사는 별도로 관리합니다. 검사 중 소스와 빌드 산출물의
해시가 유지되어야 하며 보고서는 시작과 종료 시점의 입력 목록을 기록합니다.
소스 디렉터리를 직접 읽으므로 Git이 필요하지 않습니다. `--source-commit` 또는
`CRUDUI_SOURCE_COMMIT`으로 선택적인 소스 커밋을 기록할 수 있으며 해시
비교에는 영향을 주지 않습니다.

기존 폼 사례 92개는 전체 컴파일 템플릿과 바인딩 모델을 비교합니다. JavaScript가
각 대상의 템플릿을 바인딩하고 각 대상이 JavaScript의 템플릿을 바인딩합니다.
바인딩에는 합성 로더나 파일을 제공하지 않습니다.
명세 멤버 순서와 컨트롤 속성 순서를 비교합니다. 목록 사례 42개는 이미지
리소스 힌트를 포함한 원본 HTML 문자열을 비교하고, 입력 오류 사례는 코드, 메시지, 위치를
비교합니다. 기존 정규화된 레이아웃 검사는 별도로 유지합니다.
[상세 사례](../fixtures/detail-render/README.ko.md) 30개는
런타임이 제공하는 두 수준을 모두 비교합니다. 멤버 순서를 포함한 `buildDetail` 모델과
이미지 리소스 힌트를 포함한 `renderDetail` 원본 HTML입니다. 오류 사례는 두 수준에서
코드, 메시지, 위치를 비교합니다.

추가 사례는 시퀀스 5, 7, 1 순서의 키 기반 데이터, 지정 컬렉션의 추가, 순서 변경,
저장 키 교체, 거부된 연산, 빈 컬렉션, 명시적 null, 선택 값, 클래스, CSS, 주입 및
복원 후 원본 HTML을 비교합니다. 각 주입 사례는 빈 레코드로 시작하여 데이터를
두 번 적용하고 각 결과를 초기 데이터로 생성한 결과와 비교합니다. 숫자 사례에는 JavaScript 결과만을 기준으로
삼지 않고 명시적인 소수 출력 기대값을 지정합니다. 잘못된 연산은 데이터, 필드,
HTML, 리비전을 유지해야 합니다.

날짜 사례는 UTC, Asia/Seoul, America/Los_Angeles에서 실행합니다. 검사기는 `TZ`와
PHP의 `date.timezone`을 모두 설정하고 날짜/날짜시간/목록의 명시적 UTC 기대값을
비교합니다. 초기 데이터, 빈 인스턴스 주입, 비우기, 복원을 검사하며 잘못된 달력
값과 지원하지 않는 문자열은 원래 값을 유지해야 합니다.

중첩 복사는 실제 생성한 모든 키, 복사 값, 행 순서, 변경하지 않은 기존 레코드를
검사합니다. 생성한 레코드를 그대로 JavaScript와 두 번째 네이티브 인스턴스에
제공하여 전체 모델과 원본 HTML을 비교합니다. 무작위 키를 치환하거나 식별자,
값, 속성, HTML을 제거하여 비교하지 않습니다.

각 CLI는 표준 입력으로 JSON 값 하나를 받습니다. 연산은 `compileForm`, `bindForm`,
`form`, `renderList`, `buildDetail`, `renderDetail`입니다. 성공 응답은 종료 상태 0을 사용합니다. 최상위 연산 오류는
`{ "error": { "code", "message", "at" } }`이며 종료 상태 1을 사용합니다. 폼 액션
실패는 해당 단계에 포함하고 실행을 계속합니다. 오류 코드, 메시지, 위치와 유지한
상태는 모든 구현에서 일치해야 합니다.
