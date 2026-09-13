# CRUDUI 폼 검증

[English](README.md).

이 예제는 PHP, PHP 확장, Go, Rust에서 중첩 keyed 폼을 검증합니다. 각 서버는
같은 폼 데이터를 컴파일·렌더링·검증·저장합니다. React·Vue·Svelte는
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

저장소 루트에서 소스 검사를 실행합니다.

```sh
npm run test:form-comparison
make docs-check
```

변경이 없는 현재 커밋으로 불변 후보 하나를 준비하고 이미지를 빌드합니다.

```sh
CANDIDATE_REF=$(git rev-parse HEAD)
CANDIDATE_IMAGE=localhost/crudui-form-comparison:$(printf '%s' "$CANDIDATE_REF" | cut -c1-12)
node examples/form-comparison/prepare.mjs --ref "$CANDIDATE_REF"
container build --tag "$CANDIDATE_IMAGE" --progress plain \
  ".form-comparison/candidates/$CANDIDATE_REF/context"
```

준비 명령은 추적하거나 추적하지 않은 변경을 거부합니다. 후보 컨텍스트는 소스
커밋·아카이브 해시와 고정한 OrderedJSON 공통 커밋·구현 커밋 다섯 개를
기록합니다. 후보 빌드는 실행 중인 서비스를 변경하지 않습니다.

[검증 절차](../../docs/operations/verification.ko.md)는 후보 시작, HTTP 검사,
서버별 순차 브라우저 검사와 보고서 집계를 정의합니다.
[폼 검증 계약](../../docs/spec/form-comparison.ko.md)은 필수 조합·자료·통과 기준을
정의합니다. 전체 집계가 통과하면
`node examples/form-comparison/comparison-deployment.mjs --commit "$CANDIDATE_REF"`가 정확한
이미지와 보고서를 검사하고 실행 중인 서비스 데이터를 보존한 뒤
`https://crudui.test`에서 동일한 containerctl 적용 두 번을 검증합니다. 배포가
성공하면 후보 컨테이너, 디렉터리, 보고서, 스크린샷과 사용하지 않는 비교 이미지를
제거합니다.
[기능 상태](../../docs/features.ko.md)는 코드 검증과 배포를 별도로 기록합니다.
