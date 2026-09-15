# 네이티브 생성기 적합성 검사

[English](README.md).

검사기는 JavaScript 기준 구현(React 서버 렌더링), JavaScript HTML 렌더러, PHP, Go, Rust,
PHP 네이티브 확장을 실행합니다. 네이티브 모듈의
절대 파일 경로가 필요합니다. 대상 누락, 프로세스 실패, 잘못된 응답, 비교 실패가
있으면 명령이 실패합니다. 보고서는 사용할 수 없는 대상을 별도로 기록하고,
실행 가능한 대상의 검사를 계속하여 실제 결과를 수집합니다.

```sh
npm run build
generator_php=packages/generator-php
composer install --working-dir="$generator_php"
node --test tests/native-generators/protocol.test.mjs
node tests/native-generators/run.mjs \
  --extension /absolute/path/to/crudui.so \
  --report .git/native-generators/report.json
```

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
명세 멤버 순서와 컨트롤 속성 순서를 비교합니다. 목록 사례 39개는 이미지
리소스 힌트를 포함한 원본 HTML 문자열을 비교하고, 입력 오류 사례는 코드, 메시지, 위치를
비교합니다. 기존 정규화된 레이아웃 검사는 별도로 유지합니다.
[상세 사례](../fixtures/detail-render/README.ko.md) 25개는
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
