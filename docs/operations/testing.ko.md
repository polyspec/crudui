# 테스트 실행

[English](testing.md).

저장소 루트에서 실행합니다. `npm ci --strict-allow-scripts`로 Node 의존성을
설치하고 PHP 패키지의
Composer 의존성을 설치하며 PHP·Go·Cargo를 `PATH`에서 실행할 수 있게 합니다.
컴파일된 export를 검사하기 전에 JavaScript 패키지를 빌드합니다.

교차 검증 콘솔의 Rust 검증기 프로그램 릴리스 프로필은 `strip = "none"`을 사용합니다. 릴리스
빌드가 toolchain의 선택적 `rust-objcopy`·`libLLVM.dylib` 조합에 의존하지 않게 하며, 바이너리를
성공으로 보고한 뒤 strip 경고를 남기지 않게 합니다.

`make ci`는 CI 워크플로의 모든 검사 명령을 워크플로 순서대로 실행하고, 적합성 증거를 모아 CI의 마지막
작업처럼 검사합니다. `tests/build/ci-local.test.mjs`는 이 목록이 `.github/workflows/ci.yml`과 다르면
실패합니다. 개별 명령은 다음과 같습니다.

```sh
composer --working-dir=packages/validator-php install
npm run build
npm test --workspace @crudui/validator
composer --working-dir=packages/validator-php test
node scripts/run-tests.mjs go --cwd packages/validator-go -- ./...
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml
npm test --workspace @crudui/cli
npm run test:forms
npm run test:packages
make docs-check
```

검증기 패키지 검사는
[사례 계약](../spec/test-fixtures.ko.md)의 공통 사례를 실행합니다. 구현 간 일치뿐
아니라 기대 검증 결과 또는 전체 실패 기록을 비교합니다. 패키지 검사는 export 파일,
선언·소비자 컴파일·프로덕션 렌더링을 확인합니다.

## 린트

`npm run lint`는 저장소 전체에 ESLint를 실행합니다(`eslint . --max-warnings 0`). CI의 빌드·린트·타입
작업과 `make ci`가 이 명령을 호출합니다. `eslint.config.mjs`는 패키지, 예제, 테스트, 스크립트, 도구,
루트 설정 파일까지 모든 JavaScript, TypeScript, Vue, Svelte 소스에 하나의 규칙 집합을 적용합니다.
생성되거나 설치된 출력(`dist`, `out`, `.svelte-kit`, `node_modules`, `vendor`, `target`, 문서
사이트의 빌드 결과와 생성된 API 페이지, 네이티브 빌드 디렉터리)만 제외합니다. 파일별 설정은 코드가
실행되는 환경만 나타냅니다. 브라우저 코드에는 브라우저 전역, 브라우저 페이지나 DOM 환경에 함수를
넘기는 Node 프로그램에는 Node와 브라우저 전역, 루트 패키지의 `.js` 스크립트에는 CommonJS, Svelte
컴포넌트에는 Svelte 파서와 규칙을 지정합니다. 규칙은 적용되지 않는 줄에서만, 규칙 이름과 이유를 적은
비활성화 주석으로 끕니다.

`npm run test:build`가 실행하는 `tests/build/lint-coverage.test.mjs`는 Git이 추적하거나 추가할 모든
소스를 ESLint에 묻고, 소스가 `npm run lint`가 넘기는 경로 밖에 있거나 설정이 그 소스를 제외하거나
어떤 항목도 그 소스에 맞지 않으면 실패합니다.

## 테스트 실행기

모든 테스트는 `scripts/run-tests.mjs`로 실행합니다.

```sh
node scripts/run-tests.mjs <node|vitest|go|cargo|phpunit> [--timeout <seconds>] [--cwd <directory>] [--] [<arguments>]
```

실행기는 각 테스트의 시작, 실행 중임을 알리는 줄, 결과와 경과 시간을 출력합니다. 모든
테스트는 자기 제한 시간을 가지며, `--timeout`으로 지정하지 않으면 30초입니다. 패키지
스크립트, Composer 스크립트, Makefile 대상은 이 실행기를 통해서만 테스트 도구를 호출합니다.

`npm run test:runtimes`가 실행하는 `tests/build/test-commands.test.mjs`는 다음 경우에
실패합니다.

- 패키지 스크립트, Composer 스크립트, Makefile 대상, CI 단계가 테스트 도구를 직접 호출합니다.
- CI 작업에 `timeout-minutes`가 없습니다.
- 테스트 명령이 시작하는 스크립트가 `scripts/test-progress/progress.mjs`로 출력하지 않습니다.
- 어떤 프로젝트 명령도 실행하지 않는 `node:test` 파일이 있습니다.
- TypeScript 패키지에 `typecheck` 스크립트가 없거나 CI가 `npm run typecheck`를 실행하지 않습니다.

`make conformance`는 적합성 근거를 기록하는 모든 테스트 모음을 실행하고 그 근거를 기능
계약과 대조합니다. [적합성 근거](../spec/conformance.ko.md)를 참고합니다.

## 루트 테스트 명령

루트 `npm test`는 모든 워크스페이스 패키지의 테스트 스크립트를
(`npm test --workspaces --if-present`) 각각 테스트 실행기로 실행합니다. 생성기 검사가
빌드 결과를 읽으므로 JavaScript 패키지를 먼저 빌드합니다.

```sh
npm run build
npm test
```

## 폼과 보고서

HTML 원문·DOM·스타일·입력 상태·반복 주입·브라우저 상호작용에는
[폼 검증 절차](verification.ko.md)를 사용합니다. JSON 순서와 HTTP 저장·로드
검사는 검증기 패키지 테스트와 별도입니다.

[기능 상태](../features.ko.md)에 리비전·명령·결과·배포 상태를 기록합니다. 테스트
결과는 실제로 실행한 코드와 입력에 적용됩니다. 검사 수만으로 범위나 배포가
증명되지는 않습니다.
