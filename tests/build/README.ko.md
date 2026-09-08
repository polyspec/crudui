# 패키지 빌드 검사

[English](README.md).

저장소 루트에서 실행합니다.

```sh
npm ci
npm run build
npm run test:build
npm run test:build:repeat
npm run test:packages
```

`test:build`는 validator·generator-core·generator-react를 공개 CommonJS·ESM
export로 로드합니다. `skipLibCheck: false`인 엄격한 NodeNext 타입 소비자를
컴파일하고 전체 선언 참조와 React가 export한 스타일시트를 검사합니다.
네 TypeScript 패키지 설정 모두 공개 타입에 오류가 있으면 선언을 생성하지
않아야 합니다.

`test:build:repeat`는 전체 빌드를 두 번 실행하고 다섯 패키지의 모든 산출물
파일 경로와 SHA-256을 비교합니다.

`test:packages`는 패키지를 빌드·패키징하고 별도 소비자에 설치합니다. 모든
프레임워크 타입을 컴파일하고 소비자 애플리케이션을 빌드한 뒤 세 폼 컴포넌트를
브라우저에서 실행합니다. 이 검사는 폼 검증·저장이나 전체 상호작용 조합 검사를
대체하지 않습니다.
