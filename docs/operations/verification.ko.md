# 폼 검증

[English](verification.md).

저장소 루트에서 유지하는 패키지·폼 검사를 실행합니다.

```sh
npm run test:forms
node --test tests/form-inspector/form-snapshot.test.mjs
node tests/form-inspector/browser.mjs
npm run test:packages
make docs-check
```

폼 검사기는 검사 대상 폼을 변경하지 않고 HTML 원문, 파싱한 DOM, 계산된
스타일, 현재 입력 상태를 비교합니다. 프레임워크 초기화 테스트는 초기 데이터와
생성 후 주입·레코드 복원을 비교합니다.
[JSON 순서 검사](ordered-json.ko.md)는 전송 표현을 별도로 검증합니다.

현재 HTTP·브라우저 통합 검사는 독립된 외부 체크아웃을 사용합니다. 이 체크아웃은
과거 비교 구현과 결과도 보존합니다. 이 저장소 루트에서 비교 저장소 경로와 정확한
라이브러리 커밋을 명시적으로 결정합니다.

```sh
LIBRARY_WORKSPACE=$(pwd)
LIBRARY_REF=$(git rev-parse HEAD)
COMPARISON_WORKSPACE=/absolute/path/to/crudui-comparison
cd "$COMPARISON_WORKSPACE"
node examples/form-comparison/prepare.mjs --library "$LIBRARY_WORKSPACE" --ref "$LIBRARY_REF"
```

준비 단계는 `LIBRARY_REF`를 아카이브하며 커밋하지 않은 라이브러리 변경은 포함하지
않습니다. 비교 체크아웃의 `docs/operations/form-comparison.ko.md`가 후보 이미지 빌드와
검증 절차를 정의합니다. Compose 설정은 새 이미지가 전체 검사를 통과할 때까지 보존
배포 `dfe70a6`을 가리킵니다. 이 보존 이미지를 시작해도 현재 소스가 검증되지는 않습니다.

현재 대상은 Composer 클래스를 사용하는 PHP, `ordered_json.so`와 `crudui.so`를
함께 사용하는 PHP 확장, Go, Rust입니다. 각 대상은 compile·render·SSR 엔드포인트를
제공하고 React·Vue·Svelte와 검사합니다. 브라우저는 서버가 컴파일한 직렬화 템플릿을
받아 사용하며 임의의 네이티브 HTML을 hydration하지 않습니다. 이 연결의 집중 로컬
검사는 server-generation 단위 검사 7개, Go 서버 패키지 전체, Rust 서버 검사 4개와
React·Vue·Svelte 프레임 조합 production build 12개가 모두 통과했습니다. 이 결과는
구현한 연결을 검증하지만 후보 이미지를 검증하지 않습니다. 후보 이미지를 선택해
시작한 다음 해당 컨테이너 안에서 생성 검사를 실행합니다.

```sh
container exec crudui-comparison node /workspace/keyed/examples/form-comparison/test-php-modes.mjs /opt/ordered_json.so /opt/crudui.so /workspace/keyed
container exec crudui-comparison node /workspace/keyed/examples/form-comparison/check-generation.mjs --url http://127.0.0.1:8080 --library /workspace/keyed --report /results/generation-current-new.json
container exec crudui-comparison node /workspace/keyed/examples/form-comparison/check-servers.mjs
container exec crudui-comparison node --test /workspace/keyed/examples/form-comparison/src/json.test.mjs
```

전체 생성 검사는 결과 146개, 요청 207개와 서버·프레임워크 필수 조합 12개를
요구합니다. compile·render, SSR HTML 원문, 영어·한국어 응답, 전송·저장과 잘못된
요청 거부를 별도로 검사합니다. 완전한 실행 결과를 보고서에 기록할 때까지 이 범위는
pending입니다. 배포 후 대표 SSR 문서는
[영어 PHP/React 폼](https://crudui.test/api/php/ssr/keyed/react?language=en)과
[한국어 PHP/React 폼](https://crudui.test/api/php/ssr/keyed/react?language=ko)이며,
다른 조합은 서버와 프레임워크 경로를 바꿔 선택합니다.

보존 모드는 기록된 리비전의 네이티브 JSON 파싱 PHP·Go·Rust를 유지합니다. 과거
PHP 대상은 여전히 PHP 검증기를 사용하며 [CRUDUI 확장](../spec/php-extension.ko.md)을
검증하지 않습니다. 보존 실패와 소스 메타데이터는 변경하지 않습니다. 현재 구현의
성공은 과거 결과를 변경하지 않으며 외부 결과가 이후 소스 변경을 자동으로 검증하지도
않습니다.

검증된 이미지를 Compose에 기록한 뒤 `containerctl up`은 시작 준비 검사와 HTTPS
경로 적용이 완료된 후 반환합니다. 같은 설정으로 다시 실행하고 컨테이너 검사 결과·
프록시·인증서·저장 파일 해시·HTTP 응답을 비교해 환경 멱등성을 검사합니다. 이
검사는 폼의 데이터 주입 동일성 검사와 별도로 기록합니다.
