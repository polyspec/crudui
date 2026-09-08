# 패키지 빌드

[English](package-build.md).

패키지 빌드는 같은 소스에서 JavaScript·공개 TypeScript 선언·선언된 스타일시트를
생성한다. JavaScript는 각 패키지가 선언한 CommonJS·ES 모듈 형식을 유지한다.
TypeScript는 패키지의 엄격한 컴파일러 설정과 `noEmitOnError`를 사용해 공개 진입점과
해당 import에서 선언 파일을 생성한다. 테스트는 배포 선언과 별도로 검사한다.

선언 컴파일러는 JavaScript 번들러가 추가한 폐기 예정 모듈 해석 설정을 받지 않는다.
빌드 명령은 타입 오류를 억제하거나 대체 선언을 만들지 않는다. 전체 빌드는 이전
출력을 제거한 뒤 다음 패키지 산출물을 생성한다. 감시 명령은 JavaScript 빌드 성공
후 선언 파일을 다시 생성한다.

## 인수 기준

- `npm ci`는 고정된 의존성을 설치하고 `npm run build`는 선언된 validator·generator
  빌드를 의존성 순서로 실행한다.
- validator·generator-core·generator-react는 패키지 소스 경로 import 없이 공개
  CommonJS·ES 모듈 export로 로드된다.
- 엄격한 소비자 검사는 공개 타입과 모든 하위 선언 import를 해석한다.
- React가 export한 스타일시트가 존재하고 선언한 소스 스타일시트와 일치한다.
- 같은 입력의 반복 빌드는 공개 API를 유지하고 동일한 산출물을 생성한다.

이 검사는 패키지 생성과 소비를 확인한다. 폼 입력 동작·검증 일치·SSR·브라우저
상호작용은 해당 테스트를 계속 적용한다.
