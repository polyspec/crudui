# 테스트 실행

[English](testing.md).

저장소 루트에서 실행합니다. `npm ci --strict-allow-scripts`로 Node 의존성을
설치하고 PHP 패키지의
Composer 의존성을 설치하며 PHP·Go·Cargo를 `PATH`에서 실행할 수 있게 합니다.
컴파일된 export를 검사하기 전에 JavaScript 패키지를 빌드합니다.

Rust validator 릴리스 프로필은 `strip = "none"`을 사용합니다. 릴리스 빌드가 toolchain의
선택적 `rust-objcopy`·`libLLVM.dylib` 조합에 의존하지 않게 하며, validator 바이너리를
성공으로 보고한 뒤 strip 경고를 남기지 않게 합니다.

```sh
composer --working-dir=packages/validator-php install
npm run build
npm test --workspace @crudui/validator -- --run
composer --working-dir=packages/validator-php test
go -C packages/validator-go test ./...
cargo test --locked --manifest-path packages/validator-rust/Cargo.toml
npm test --workspace @crudui/cli
npm run test:forms
npm run test:packages
make docs-check
```

검증기 패키지 검사는 현재 사례와 구형 사례를 포함합니다. 현재 적합성 검사는
[사례 계약](../spec/test-fixtures.ko.md)의 공통 사례를 사용합니다. 구현 간 일치뿐
아니라 기대 검증 결과 또는 전체 실패 기록을 비교합니다. 패키지 검사는 export 파일,
선언·소비자 컴파일·프로덕션 렌더링을 확인합니다.

## 구형 비교

루트 `npm test`는 `tests/cases/*.json`에 대해 `tests/runner/compare-all.js`를
실행합니다. 현재 API 적합성 검사가 아닌 구형 비교입니다. JavaScript는 명시적인
컴파일된 legacy 진입점을 로드하고 PHP는 구형 stdin 실행기를 사용합니다.
Go와 Rust 구형 실행 파일은 해당 언어의 비교를 선택하면 비교 전에 다시 빌드합니다.

```sh
npm run build
npm test
node --test tests/runner/compare-all.test.cjs
node tests/runner/compare-all.js --js-only --file required.json
```

선택한 모든 구현은 실행에 성공하고 각 기대 결과와 일치하며 다른 구현과도 일치해야
합니다. 하위 프로세스 실패·읽을 수 없는 스위트·기대 결과 불일치는 명령 실패입니다.
단일 언어 실행은 기대 결과를 검사하지만 언어 간 일치를 증명하지 않습니다.
회귀 검사는 프로세스 실패나 잘못된 성공 응답이 실행기를 통과하지 못하는지 확인합니다.

## 폼과 보고서

HTML 원문·DOM·스타일·입력 상태·반복 주입·브라우저 상호작용에는
[폼 검증 절차](verification.ko.md)를 사용합니다. JSON 순서와 HTTP 저장·로드
검사는 검증기 패키지 테스트와 별도입니다.

[기능 상태](../features.ko.md)에 리비전·명령·결과·배포 상태를 기록합니다. 테스트
결과는 실제로 실행한 코드와 입력에 적용됩니다. 검사 수만으로 범위나 배포가
증명되지는 않습니다.
