# 네이티브 폼 생성기

[English](native-form-generators.md).

상태: 구현 제안. 필수 기능은 [런타임 패키지](../spec/runtime-packages.ko.md)에
정의합니다. 이 제안은 생성, SSR 통합, PHP 네이티브 검증의 완료를 증명하지
않습니다.

## 소스 현황

| 컴포넌트 | 실제 동작 | 소스 |
| --- | --- | --- |
| JavaScript 코어 | 템플릿 컴파일, 데이터 바인딩, 편집 가능한 인스턴스 관리 | [코어 공개 API](../../packages/generator-core/src/index.ts) |
| React, Vue, Svelte | JavaScript 코어를 사용하는 브라우저 폼, 폼 SSR, 목록 SSR | [React 공개 API](../../packages/generator-react/src/index.ts), [Vue 공개 API](../../packages/generator-vue/src/index.ts), [Svelte 공개 API](../../packages/generator-svelte/src/index.ts) |
| PHP 라이브러리 | 조합, 표현식 계산, 데이터 검증 | [검증 진입점](../../packages/validator-php/src/Validate/Validate.php) |
| Go 라이브러리 | 순서 있는 명세 조합, 표현식 계산, 데이터 검증 | [검증 진입점](../../packages/validator-go/validator/validate/index.go) |
| Rust 라이브러리 | 조합, 표현식 계산, 데이터 검증 | [라이브러리 공개 API](../../packages/validator-rust/src/lib.rs) |
| 콘솔 생성 | JavaScript 프레임워크 렌더러 세 종류 실행 | [렌더링 실행기](../../examples/cross-check-console/server/render-runner.mjs) |
| 콘솔 검증 | CLI로 네 언어 검증기 실행 | [검증 실행기](../../examples/cross-check-console/server/validate-runner.mjs) |

PHP, Go, Rust 검증기 패키지는 폼 컴파일이나 HTML 렌더링을 제공하지
않습니다. 외부 비교 환경의 네이티브 PHP 대상은 네이티브 JSON 파서를 로드하고
PHP 검증기를 사용합니다. 해당 보고서는 전송과 브라우저 검증 근거이며,
CRUDUI 네이티브 생성기나 검증기의 근거가 아닙니다.

공용 렌더링 데이터에는 폼 92개와 목록 21개 사례가 있습니다. 현재 이 사례를
실행하는 구현은 JavaScript 프레임워크 렌더러입니다. 이 검사는 정규화한
레이아웃을 비교합니다. 원본 HTML 검사기와 브라우저 초기화 시나리오는
별도 검사를 제공하며 계속 사용할 수 있어야 합니다.

## 패키지 구성

| 패키지 | 구현 책임 | 재사용 |
| --- | --- | --- |
| `packages/generator-core` | JavaScript 템플릿, 인스턴스, 계산된 모델 | JavaScript 조합과 표현식 모듈 |
| `packages/generator-react`, `generator-vue`, `generator-svelte` | 프레임워크 통합, 브라우저 동작, 렌더링 | 공용 JavaScript 생성기 |
| `packages/generator-php` | PHP 템플릿 컴파일, 데이터 바인딩, 폼과 목록 HTML | PHP 조합과 표현식 모듈 |
| `packages/generator-go` | Go 템플릿 컴파일, 데이터 바인딩, 폼과 목록 HTML | Go 조합과 표현식 모듈 |
| `packages/generator-rust` | Rust 템플릿 컴파일, 데이터 바인딩, 폼과 목록 HTML | Rust 조합과 표현식 모듈 |
| `packages/php-ext` | PHP 네이티브 생성과 검증 | PHP 패키지와 같은 공개 클래스이며 생성과 검증을 네이티브 코드에서 실행 |
| `packages/validator-*` | 데이터와 명세 검증 | 기존 언어별 검증 규칙 구현과 공용 사례 |

각 서버 생성기는 해당 언어의 HTTP 프로세스에서 실행할 수 있는
라이브러리입니다. CLI 어댑터는 검사와 예제의 진입점이며 라이브러리 구현이
아닙니다. Go 렌더링은 실행 시 Rust, PHP, Node에 의존하지 않습니다.
PHP 렌더링은 네이티브 확장을 필수로 요구하지 않습니다. Rust 렌더링은
PHP 호스트를 요구하지 않습니다.

## API 동작

이름은 각 언어의 명명 규칙을 따릅니다. 동작과 결과는 같으며 필드 명세에
런타임 선택자를 추가하지 않습니다.

| 동작 | JavaScript | PHP 라이브러리 | Go | Rust | PHP 네이티브 |
| --- | --- | --- | --- | --- | --- |
| 구조 컴파일 | `compileForm` | `Generator::compileForm` | `CompileForm` | `compile_form` | `Generator::compileForm` |
| 데이터 바인딩 | `bindForm` | `Generator::bindForm` | `BindForm` | `bind_form` | `Generator::bindForm` |
| 인스턴스 생성 | `createForm` | `new Form` | `NewForm` | `Form::new` | `new Form` |
| 데이터 교체 | `setData` | `$form->setData` | `SetData` | `set_data` | `$form->setData` |
| 데이터 조회 | `getData` | `$form->getData` | `GetData` | `get_data` | `$form->getData` |
| 폼 렌더링 | `renderForm` | `Generator::renderForm` | `RenderForm` | `render_form` | `Generator::renderForm` |
| 목록 렌더링 | `renderList` | `Generator::renderList` | `RenderList` | `render_list` | `Generator::renderList` |
| 검증 | `validate` | `Validator::validate` | `Validate` | `validate` | `Validator::validate` |

두 PHP 구현 모두 `CRUDUI\Generator`, `CRUDUI\Validator`,
`CRUDUI\Form` 클래스를 사용합니다.
[PHP API 계약](../spec/php-extension.ko.md)은 공용 메서드와 로딩 순서를
정의합니다. 활성화된 확장은 이 클래스를 등록합니다. 확장이 없으면
Composer가 PHP 클래스를 자동 로드합니다. 예제는 두 설정에서 같은 호출을
사용하며 비교 검사는 별도 PHP 프로세스에서 클래스 구현과 메서드
시그니처를 확인합니다.

PHP 패키지 구현은 `CRUDUI\Validator\Validate\Validate::run`을
`CRUDUI\Validator::validate`로, `ListValidate::run`을
`CRUDUI\Validator::validateList`로 변경합니다. Composer 클래스 매핑,
패키지 테스트, CLI 어댑터, 예제, 생성 API 문서를 함께 수정합니다.
대체된 공개 진입점을 제거하고 생성과 검증에 필요한 내부 조합, 표현식,
규칙 모듈을 유지합니다. 공개 클래스는 클래스 자동 로딩을 사용하고
즉시 포함되는 함수 파일이나 별칭을 사용하지 않습니다.

## PHP 확장 구현 선택

다음 두 구현 모두 네이티브 실행을 충족합니다.

| 선택 | 장점 | 필요한 작업과 의존성 |
| --- | --- | --- |
| 생성과 검증을 C로 구현 | PHP/Zend 직접 개발과 C 빌드 | 조합, 표현식, 생성, 검증을 C로 구현하고 유지하며 추가 엔진을 공용 사례와 검증 |
| Rust 구현과 PHP 바인딩 | 독립 Rust 생성기와 검증기를 모두 PHP 프로세스에서 재사용 | Rust 빌드 도구, PHP 헤더, Zend 바인딩이 필요하며 PHP 값, 예외, 객체 수명, 지원 PHP 버전을 검증 |

제안하는 선택은 독립 Rust 생성기 검사를 통과한 후 Rust 구현을 재사용하는
것입니다. 필수인 Rust SSR과 검증 기능을 모두 재사용합니다. 생성 기능을
Rust에만 배정하지 않으며 PHP와 Go도 각각 생성기 패키지를 제공합니다.
전체를 C로 구현해야 한다는 조건이 있으면 이 선택을 변경하고 C 엔진을
추가해야 합니다. 이를 바인딩만 변경하는 작업으로 설명하면 안 됩니다.
확장 구현 방식은 아직 결정되지 않았습니다. 이 선택을 결정한 후 네이티브
바인딩 작업을 시작합니다.

## 포팅 전 데이터 검토

- 컴파일한 필드 순서와 레코드 항목 순서를 유지합니다. Go 컴파일에는 이미
  순서 있는 명세 객체가 있지만 검증 데이터는 순서 없는 맵을 사용합니다.
  생성기 데이터는 전 과정에서 순서 있는 표현을 사용해야 합니다.
- 누락 값, `null`, `{}`, `[]`를 구분하고 언어 진입점마다 변환을 검사합니다.
  검증을 통과시키려고 행이나 숨김 값을 생성하지 않습니다.
- 각 언어의 기존 표현식 파서와 계산기를 공유합니다. 별도 추정 규칙으로
  두 번째 표현식 인식기를 구현하지 않습니다.
- 불변 템플릿, 편집 가능한 인스턴스, 필드 모델, HTML 직렬화기를 분리합니다.
  렌더링에서 저장이나 검증의 부수 효과를 발생시키지 않습니다.
- 입력 식별자를 한 번 결정하고 라벨, 스크립트, 네이티브 HTML, 브라우저
  갱신에서 일치하게 사용합니다. 스크립트를 생성하는 필드는 선택자 동작을
  검증합니다.
- 날짜 형식, 문자열 변환, 옵션 순서, 이스케이프, 원문 콘텐츠, 목록 형식을
  명시적으로 검토합니다. 언어 기본 동작은 적합성 검증 근거가 아닙니다.

## 구현 순서

1. 검토한 계약에서 공용 템플릿, 바인딩 모델, 키 기반 인스턴스 검사 데이터를
   추가합니다. 정상 기대 결과와 거부할 작업을 포함합니다. 원본 HTML과
   정규화한 레이아웃의 검증 근거를 구분합니다.
2. JavaScript 구현으로 이 사례들을 실행합니다. 출력이 기준으로 채택되기
   전에 계약 위반을 재현하고 수정합니다. 비교 코드는 대상 누락, 잘못된
   결과, 프로세스 실패를 거부해야 합니다.
3. PHP, Go, Rust의 기존 조합과 표현식 API를 사용하여 생성을 별도 모듈로
   구현합니다. 런타임 간 템플릿과 모델을 검증한 뒤 HTML과 공개 패키지 빌드를
   검증합니다. 검증한 각 구현을 실제 목적에 맞게 커밋합니다.
4. 선택한 확장 구조로 PHP 네이티브의 두 기능을 구현합니다. Composer 사용
   여부에 따른 확장 로드, 확장을 비활성화한 PHP 실행, 공개 시그니처 동일성,
   값 변환, 예외, 수명, 반복 요청과 동일한 생성·검증 사례를 검사합니다.
5. 각 서버 구현에 현재 예제를 추가합니다. 서버가 자체 HTML과 템플릿을
   생성하고, 폼 및 순서 보존 JSON 입력을 검증하고, 유효한 레코드를 저장하고
   다시 로드합니다. 브라우저 자산 빌드에 Node를 사용할 수 있지만 서버
   생성은 선택한 서버 구현에서 실행해야 합니다.
6. PHP, PHP 네이티브, Go, Rust를 React, Vue, Svelte와 검증합니다. 데이터를
   포함한 SSR, 초기 데이터를 포함한 캐시 템플릿, 이후 데이터를 주입하는
   정적 폼을 검사합니다. 두 전송 방식, 중첩 복사, 저장된 키, 빈 컬렉션,
   순서, 라벨, 복수 선택, 표시 상태, 포커스, 스크롤을 포함합니다.
7. CI에 새 패키지의 클린 빌드와 모든 네이티브 검사를 추가합니다. 실제 결과로
   영어·한국어 명세, 운영 절차, 기능 상태, 패키지 예제, 변경 기록을
   갱신합니다. 대체 동작 검증이 끝날 때까지 현재 소스와 비교 근거를 보존합니다.

## 완료 조건

- 다섯 실행 대상 모두 문서화된 패키지 진입점으로 생성과 검증을 제공합니다.
- 캐시 템플릿은 런타임 사이에서 동작합니다. 초기 데이터, 주입, 복원이
  원본 HTML, DOM, CSS, 입력 상태, 전송 비교를 통과합니다.
- 브라우저 보고서는 폼을 실제로 생성하고 검증한 서버 구현을 기록합니다.
  서버 네 종류와 프레임워크 세 종류의 HTTP 검사가 모두 완료됩니다.
- CI는 모든 새 패키지 검사를 실행합니다. 빌드하거나 검사하지 않은
  패키지의 결과를 기존 CI 작업의 성공으로 판단하지 않습니다.
- 패키지 게시를 빌드와 로컬 예제와 구분하여 기록합니다.
