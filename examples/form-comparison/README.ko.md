# CRUDUI 정본 예제와 폼 검증

[English](README.md).

정본 진입 페이지는 CRUDUI 전체 기능을 사용하는
`List → Detail → Form → Save → List refresh` 파이프라인입니다. 목록·상세·링크·폼·검증 흐름을
CRUDUI가 생성하고 실행하며 외부 단계 버튼으로 기능을 흉내 내지 않습니다. JavaScript
reference·PHP·PHP extension·Go·Rust, HTML·React·Vue·Svelte, CSR·SSR을 선택합니다.
별도 벤치마크 화면은 `/benchmark/`에 있으며 `/displays/`는 제공하지 않습니다.

이 예제는 PHP, PHP 확장, Go, Rust에서 중첩 keyed 폼을 검증합니다. 각 서버는
같은 폼 데이터를 컴파일·렌더링·검증·저장합니다. React·Vue·Svelte·HTML 렌더러는
`bindForm`과 `createForm`을 모두 실행합니다. 네이티브 폼과 ordered JSON 전송은
같은 검증·저장 계약을 사용합니다.

반복 컬렉션은 keyed 객체를 사용합니다. 저장 행은 `__` 구분자 사이에 13자리
십진수를 사용하고 새 행은 13자리 소문자 16진수를 사용합니다. 객체 멤버 순서가
표시·저장 순서를 결정합니다. OrderedJSON은 keyed 객체를 배열로 변환하지 않고
JSON 요청·응답·저장 파일을 처리합니다.

메인 페이지는 두 초기화 경로를 좌우에 표시합니다. 왼쪽 프레임은 저장 레코드와 함께
폼을 생성하고, 오른쪽 프레임은 레코드를 요청하기 전에 데이터가 없는 직렬화 템플릿을
마운트한 뒤 레코드를 주입합니다. 두 열은 같은 주입, 수정, 저장, 복사, 이동,
추가, 구조 맵, 포커스 단계를 차례로 실행하고, 상단 목록은 단계마다 HTML 원문, DOM, 속성,
컨트롤 상태, 계산된 CSS, 전송 필드, 데이터, 포커스, 저장 응답을 비교합니다.

저장소 루트에서 검사를 실행합니다.

```sh
make test-form-comparison
make test-form-comparison-pipeline
```

파이프라인 검사는 이 트리에서 다섯 레코드 서버를 빌드하고, 각 서버를 127.0.0.1의 빈 포트에서 로컬
프로세스로 시작하고, 한 HTTP 계약으로 레코드 저장소를 비교하고, 서버·클라이언트·초기화 방식 40개 조합의
정본 흐름을 실행한 뒤 서버를 멈춥니다. 모든 서버는 체크아웃 커밋과 커밋하지 않은 변경의 digest로
이루어진 소스 식별자를 명시합니다.

[폼 검사](../../docs/operations/testing.ko.md#폼과-보고서)가 명령을 설명하고,
[폼 검증 계약](../../docs/spec/form-comparison.ko.md)은 레코드 리소스, 정본 페이지, 정본 흐름 검사를
정의합니다. [기능 상태](../../docs/features.ko.md)는 코드 검증과 배포를 별도로 기록합니다.
