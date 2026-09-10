# 폼 검증

[English](verification.md).

저장소 루트에서 유지하는 패키지·폼 검사를 실행합니다.

```sh
npm run test:forms
npm run test:form-comparison
node --test tests/form-inspector/form-snapshot.test.mjs
node tests/form-inspector/browser.mjs
npm run test:packages
make docs-check
```

폼 검사기는 검사 대상 폼을 변경하지 않고 HTML 원문, 파싱한 DOM, 계산된
스타일, 현재 입력 상태를 비교합니다. 프레임워크 초기화 테스트는 초기 데이터와
생성 후 주입·레코드 복원을 비교합니다.
[JSON 순서 검사](ordered-json.ko.md)는 전송 표현을 별도로 검증합니다.

HTTP·브라우저 검증기는 이 저장소에서 관리합니다. 변경이 없는 현재 커밋으로
후보를 준비하고 이미지를 빌드한 뒤 격리한 컨테이너를 시작합니다.

```sh
CANDIDATE_ROOT=$(pwd)
CANDIDATE_REF=$(git rev-parse HEAD)
CANDIDATE_TAG=$(printf '%s' "$CANDIDATE_REF" | cut -c1-12)
CANDIDATE_DIR="$CANDIDATE_ROOT/.form-comparison/candidates/$CANDIDATE_REF"
CANDIDATE_IMAGE="localhost/crudui-form-comparison:$CANDIDATE_TAG"
CANDIDATE_NAME="crudui-form-comparison-$CANDIDATE_TAG"
node examples/form-comparison/prepare.mjs --ref "$CANDIDATE_REF"
container build --tag "$CANDIDATE_IMAGE" --progress plain "$CANDIDATE_DIR/context"
container run --detach --name "$CANDIDATE_NAME" \
  --publish 127.0.0.1:18080:8080 \
  --mount "type=bind,source=$CANDIDATE_DIR/data,target=/data" \
  --mount "type=bind,source=$CANDIDATE_DIR/results,target=/results" \
  "$CANDIDATE_IMAGE"
```

준비 명령은 추적하거나 추적하지 않은 변경을 거부하고 `CANDIDATE_REF`를
아카이브합니다. 후보 데이터·결과 디렉터리는 배포 데이터와 분리합니다. 컨테이너는
같은 소스 아카이브에서 PHP, PHP 확장, Go, Rust 프로세스를 각각 하나씩 시작합니다.
PHP는 Composer 클래스를 사용하고 PHP 확장 프로세스는 `ordered_json.so`와
`crudui.so`를 함께 로드합니다.

후보 컨테이너 안에서 처리 모드·생성·저장·JSON 검사를 실행합니다.

```sh
container exec "$CANDIDATE_NAME" node /workspace/source/examples/form-comparison/test-php-modes.mjs /opt/ordered_json.so /opt/crudui.so /workspace/source
container exec "$CANDIDATE_NAME" node /workspace/source/examples/form-comparison/check-generation.mjs --url http://127.0.0.1:8080 --library /workspace/source --report /results/generation.json
container exec "$CANDIDATE_NAME" node /workspace/source/examples/form-comparison/check-servers.mjs
container exec "$CANDIDATE_NAME" node --test /workspace/source/examples/form-comparison/src/json.test.mjs
```

전체 생성 검사는 결과 290개, 요청 411개와 서버·렌더링 경로·프레임워크 필수 조합
24개를 요구합니다. compile, 유지한 직렬화 템플릿 render, SSR HTML 원문,
영어·한국어 출력, 잘못된 데이터 거부와 저장 레코드 불변을 검사합니다. 저장 검사는
네 서버·두 렌더링 경로의 결과 120개를 요구합니다.

브라우저 검증은 서버별로 한 번씩 실행합니다. 포커스·선택 범위·스크롤을 하나의
브라우저 환경에서 측정하므로 다음 명령을 병렬로 실행하지 않습니다.

```sh
FORM_COMPARISON_RESULTS="$CANDIDATE_DIR/results" node examples/form-comparison/check.mjs php http://127.0.0.1:18080
FORM_COMPARISON_RESULTS="$CANDIDATE_DIR/results" node examples/form-comparison/check.mjs php-ext http://127.0.0.1:18080
FORM_COMPARISON_RESULTS="$CANDIDATE_DIR/results" node examples/form-comparison/check.mjs go http://127.0.0.1:18080
FORM_COMPARISON_RESULTS="$CANDIDATE_DIR/results" node examples/form-comparison/check.mjs rust http://127.0.0.1:18080
node examples/form-comparison/check-browser-reports.mjs \
  --results "$CANDIDATE_DIR/results" \
  --origin http://127.0.0.1:18080 \
  --metadata "$CANDIDATE_DIR/context/metadata.json" \
  --report "$CANDIDATE_DIR/results/browser-summary.json"
```

집계는 시나리오 960개, 상호작용 240개, 마운트 24개, 일치하는 정적 문서 24개와
성능 결과 4개의 통과를 요구합니다. 서버별 절대 제한은 900,000밀리초이고 진행 없음
제한은 300,000밀리초입니다. 실패·누락·잘못된 형식·시간 초과 결과가 있으면 종료
상태 1을 유지합니다. 모든 명령과 집계가 상태 0을 반환하고 집계에 `passed: true`를
기록하기 전에는 후보를 배포하지 않습니다.

보고서를 보존한 뒤 격리한 후보 컨테이너를 중지하고 제거합니다.

```sh
container stop "$CANDIDATE_NAME"
container delete "$CANDIDATE_NAME"
```

배포와 패키지 게시는 별도 작업입니다. 후보 검증은 두 상태를 변경하지 않습니다.
