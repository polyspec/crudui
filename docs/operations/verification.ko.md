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

과거 구현의 브라우저·HTTP 비교는 독립된 외부 체크아웃을 사용합니다.
절대 경로를 명시해야 하며 해당 경로에는 보존한 비교 애플리케이션,
고정된 소스 커밋, 자체 빌드 절차가 있어야 합니다. 해당 안내에 따라 이미지를
빌드한 후 Compose 설정을 적용합니다.

```sh
COMPARISON_WORKSPACE=/absolute/path/to/preserved-comparison
cd "$COMPARISON_WORKSPACE"
containerctl up
```

보존한 작업 공간은 `docs/operations/form-comparison.md`에 실행 안내를 포함합니다.
해당 안내에 따라 PHP·네이티브 JSON 파싱을 사용하는 PHP·Go·Rust를 React·Vue·Svelte와 폼·JSON 전송으로
검사합니다. 보고서는 개별 실패와 소스 메타데이터를 유지합니다. 현재 구현의
성공은 과거 구현의 결과를 변경하지 않습니다. 외부 결과가 이후 소스 변경을
자동으로 검증하지는 않습니다.

네이티브 JSON 대상도 PHP 검증기를 사용합니다. 이 대상은
[CRUDUI 확장](../spec/php-extension.ko.md)을 검증하지 않습니다.

`containerctl up`은 시작 준비 검사와 HTTPS 경로 적용이 완료된 후 반환합니다.
같은 설정으로 다시 실행하고 컨테이너 검사 결과·프록시·인증서·저장 파일 해시·
HTTP 응답을 비교해 환경 멱등성을 검사합니다. 이 검사는 폼의 데이터 주입
동일성 검사와 별도로 기록합니다.
