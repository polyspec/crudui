# 폼 비교 실행

[English](form-comparison.md). [계약](../spec/form-comparison.ko.md)과
[현재 결과](../features.ko.md)를 확인합니다.

## 시작과 검토

Apple container가 실행 중인 Apple silicon Mac을 사용합니다. 이 저장소 루트에서
다음 명령을 실행합니다. 빌드는 Linux 컨테이너에서 Node 26.8.1과 PHP 8.4를 사용합니다.

```sh
container system status
node examples/form-comparison/run.mjs start
```

[http://localhost:4317](http://localhost:4317)을 열고 React, Vue, Svelte를 선택합니다.
왼쪽 폼은 원본 키 렌더러, 예제 행 컨트롤러, 원본 공개 함수의 캐시 바인딩을 사용합니다.
오른쪽 폼은 13자리 세션 구현을 사용합니다. 두 폼은 숨김 seq 필드 없이 동일한 키
데이터를 사용합니다. 비교 대상 선택에서 이전 배열 진단도 제공하며 생성된 행 버튼은
추가, 복사, 정렬, 제거를 수행합니다. 상단 제어 버튼은
해당 프레임의 데이터 로드, 저장, 검증, 초기화를 수행합니다. 데이터 영역을 펼쳐
input 이름, 현재 값, PHP 파싱, 저장 레코드, 로드된 계층을 확인합니다.
“5 → 7 → 1” 버튼은 비연속 ID 픽스처를 불러와 직접 삽입, 복사, 정렬, 저장할 수
있도록 합니다.

저장은 네이티브 multipart 필드를 PHP에 제출합니다. PHP는 해당 소스 버전으로 검증하고
회사, 스토어, 부서 행을 JSON 파일에 저장합니다. 재로드는 새로운 GET 요청을 수행하고
저장된 부모 ID로 중첩 데이터를 생성합니다. 두 키 예제는 응답받은 키 변경을 하위 행부터
부모 순서로 적용합니다. 유지한 배열 예제는 숨김 seq 필드를 선언하고 복사할 때
초기화합니다. 원본 예제들은 렌더링 인터페이스로 마운트된 폼을 갱신하고 입력 속성과
조건 표시를 동기화합니다. 배열 진단의 숨김 seq 필드는 승인된 식별자 계약을
충족하지 않으며 확인을 위해 유지합니다. 현재 결과는 기능 상태에 기록합니다.

JSON 검사는 기존 키 구조를 사용하며 문서 멤버 순서를 행 순서로 처리합니다.
문서 순서를 유지하는 경우와 편집하는 경우의 저장과 재로드를 검사합니다.
순서 필드나 다른 행 키 형식을 제출하지 않습니다. 별도의 키 기반 입력 사례는
숨김 식별자 필드 없이 원본 렌더러와 해당 PHP 검증기를 확인합니다.

비교 예제와 프레임워크마다 `.form-comparison/data/`의 독립된 파일을 사용합니다.
저장은 해당 파일의 전체 계층을 교체합니다. 초기화와 자동 검사는 최초 레코드를
복원합니다. 컨테이너를 제거해도 호스트 파일은 유지합니다. 이 환경은 로컬 개발용이며
패키지를 게시하지 않습니다.

## 검증

화면의 “모든 프레임워크 검사”는 세 프레임워크에서 원본 키 예제, 현재 키 런타임,
유지한 배열 진단에 동일한 17개 검사를 실행합니다. 각 시나리오의 결과를 PASS 또는
FAIL로 표시합니다. 다운로드는 이 결과를 내보냅니다. 헤드리스 실행기는 아홉 예제에
실제 포인터, 키보드, 체크박스 상호작용 검사 27개도 실행합니다. 두 키 예제의 행 연산
검사는 하위 행이 있는 레코드를 사용하며 exact와 empty 검사는 빈 부서를 사용합니다.
캐시 검사는 참조 읽기 1회를 확인하고 준비 이후의 로드를 거부합니다.
헤드리스 실행기는 각 예제의 최초 PHP 로드 요청을 중단하고 중첩 input 요소가 이미
있는지 확인하며 아홉 예제·프레임워크 조합을 모두 검사합니다.
반복 가능한 헤드리스 브라우저 검사를 위해 저장소 의존성과 Puppeteer의 Chrome을
설치한 후 실행합니다.

```sh
npm ci
npx puppeteer browsers install chrome
node examples/form-comparison/check.mjs
container exec crudui-form-comparison php /workspace/keyed/examples/form-comparison/test-repository.php
make docs-check
```

브라우저 실행기는 `.form-comparison/results/`에 `report.json`, `forms.png`,
`comparison.png`를 생성합니다. 검사 실패, 결과 누락, 브라우저 오류가 있으면
종료 코드 1을 반환합니다. 원본 배열 진단의 실패는 보고서와 화면에서 실패로 유지하며
[기능 상태](../features.ko.md)에 기록합니다. 브라우저 검사가 실패해도 PHP 검사와
문서 검사 명령은 각각 실행합니다. 저장소 검사는 새 인스턴스의 로드, 물리적 레코드
순서를 변경한 후 `position`에 따른 로드, 부모 관계, 거부한 트랜잭션의 파일 유지,
전체 삭제, 삭제된 ID의 재사용 방지도 확인합니다.

검증 중에는 두 비교 구현, 스냅샷, 실행 환경을 유지합니다. 저장소 정리는 검증과
결과 검토 이후에 수행합니다.

## 확인, 재빌드, 종료

```sh
container logs crudui-form-comparison
curl http://localhost:4317/api/load/keyed/react
node examples/form-comparison/run.mjs stop
node examples/form-comparison/run.mjs start
```

재빌드 없이 종료하려면 `stop` 명령만 실행합니다. 해당 이름의 비교 컨테이너를
제거합니다. 빌드와 JSON 파일은 `.form-comparison/`에 유지하며 Git에서 제외합니다.
컨테이너를 시작하지 않고 아카이브를 준비하려면 다음 명령을 실행합니다.

```sh
node examples/form-comparison/run.mjs prepare
```

화면은 전체 소스 커밋 ID와 Git 아카이브의 SHA-256 해시를 제공합니다.
두 소스는 커밋된 npm 잠금 파일을 사용합니다. 잠금 파일에 네이티브 빌드 모듈의
macOS 패키지 항목만 있으므로 이미지에서 동일 버전의 Linux ARM64 모듈을 별도로
설치합니다. 소스의 프레임워크 의존성 버전은 변경하지 않습니다.
