# 패키지 빌드 검사

[English](README.md).

저장소 루트에서 실행합니다.

```sh
npm ci --strict-allow-scripts
npm run test:runtimes
npm run test:dependencies
npm run build
npm run test:build
npm run test:build:repeat
npm run test:packages
```

`test:runtimes`는 `.node-version`에 짝수 Node.js 메이저 하나를 요구하고
`.go-version`에 Go 메이저·마이너 릴리스 하나를 요구합니다. CI는 두 파일을 읽고
모든 Node.js·Go 컨테이너 단계는 해당 릴리스 계열을 사용합니다. Rust CI와
컨테이너 단계는 안정 Rust 채널을 선택합니다. 검사는 정확한 런타임 패치 릴리스와
숫자 npm 릴리스를 거부합니다. CI는 현재 안정 npm 릴리스를 설치합니다. 런타임
검사는 프로세스 `PATH`에 Cargo가 없는 환경에서 저장소의 Rust Node.js 진입점을
실행합니다. 각 진입점은 하나의 toolchain 기록에서 Cargo, rustc, rustdoc을 해석하고
해석한 컴파일러 경로를 Cargo에 전달해야 합니다.

`test:dependencies`는 잘못되거나 누락되거나 충돌하는 설치 패키지를 거부합니다.
또한 추적하는 모든 npm 잠금 파일에서 보고된 중간·높음·치명적 취약점, 승인하지
않은 생명주기 스크립트, 정확한 패키지 버전을 명시하지 않은 스크립트 승인을
거부합니다.

`test:runtimes`는 계약 manifest 검사도 합성 저장소와 이 저장소에서 실행합니다. 모든 패키지
진입점은 정확한 값 export와 공개 범위로 선언되어야 하며, internal 진입점은 CRUDUI 패키지 코드만
가져옵니다.

`test:build`는 validator·generator-core·generator-html·generator-react를 공개 CommonJS·ESM
export로 로드하고, generator-core의 internal 진입점도 두 형식으로 로드합니다. `skipLibCheck: false`인 엄격한 NodeNext 타입 소비자를
컴파일하고 전체 선언 참조와 React가 export한 스타일시트를 검사합니다.
네 TypeScript 패키지 설정 모두 공개 타입에 오류가 있으면 선언을 생성하지
않아야 합니다.

`test:build:repeat`는 전체 빌드를 두 번 실행하고 다섯 패키지의 모든 산출물
파일 경로와 SHA-256을 비교합니다.

`test:packages`는 패키지를 빌드·패키징하고 별도 소비자에 설치합니다. 모든
프레임워크 타입을 컴파일하고 소비자 애플리케이션을 빌드한 뒤 세 폼 컴포넌트를
브라우저에서 실행합니다. 이 검사는 폼 검증·저장이나 전체 상호작용 조합 검사를
대체하지 않습니다.
