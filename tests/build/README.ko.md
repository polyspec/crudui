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
export로 로드하고, generator-core의 internal 진입점도 두 형식으로 로드합니다. `skipLibCheck: false`인 엄격한 NodeNext 타입 프로젝트를
validator·generator-core·generator-html·generator-react·generator-vue·generator-svelte·form-binding의 선언으로
컴파일하고 전체 선언 참조와 React가 export한 스타일시트를 검사합니다.
네 TypeScript 패키지 설정 모두 공개 타입에 오류가 있으면 선언을 생성하지
않아야 합니다. 또한 다른 명령을 실행하는 스크립트가 끝나지 않는 명령을 제한 시간에 프로세스 그룹째
멈추는지 검사합니다([명령 제한 시간](../../docs/operations/testing.ko.md#명령-제한-시간)).

`test:bench`는 JavaScript·PHP·Go·Rust 벤치마크 드라이버와 `tools/bench/run.js`가
`tools/bench/iteration-arguments.json`의 반복 횟수를 같은 규칙과 같은 메시지로 받거나
거부하는지 검사합니다. PHP, Go, Rust가 필요하며 CI의 네이티브 생성 작업이 실행합니다. 먼저 패키지를 빌드하고
`tools/bench/build-drivers.mjs`로 Go와 Rust 드라이버를 빌드합니다. 이 스크립트는 시간 한도 없이 각 빌드의
출력을 흘리고 결과를 경과 시간과 함께 출력합니다. 테스트는 빌드된 드라이버를 실행하며 각 테스트는 테스트
실행기의 30초 제한 시간을 가집니다.

`test:build:repeat`는 `scripts/repeat-build.mjs`로 전체 빌드를 두 번 실행합니다. 이는 시간 한도 없이
로그를 남기는 단계로, 각 빌드 뒤에 공개 패키지의 모든 산출물 파일 경로와 SHA-256을 기록합니다. 이어서
테스트가 두 기록을 서로, 그리고 현재 산출물과 비교하며 각 테스트는 테스트 실행기의 30초 제한 시간을
가집니다.

`test:packages`는 패키지를 빌드·패키징하고 별도 설치 프로젝트에 설치합니다. 모든
프레임워크 타입을 컴파일하고 설치 프로젝트를 빌드한 뒤 세 폼 컴포넌트를
브라우저에서 실행합니다. 이 검사는 폼 검증·저장이나 전체 상호작용 조합 검사를
대체하지 않습니다.
