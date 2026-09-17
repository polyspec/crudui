# 상품 폼

[English](README.md).

이 두 명세는 현재 문법으로 작성한 실제 규모의 상품 편집 폼입니다. 메타 스키마로 검사하며,
명세를 합성하고 검증하고 렌더링하는 테스트로 실행합니다.

- **옵션 폼**([option-form.yml](option-form.yml)) — 단일 옵션, 생성된 옵션 조합, 직접 입력
  옵션 사이를 전환합니다. `design.show`는 전환 값이 선택한 영역만 표시합니다. 생성된 조합은
  `multiple: only` 반복 그룹입니다. 행은 애플리케이션이 데이터로 제공한 키(예: `__opt_a1__`)와
  정확히 같고, 폼은 이 행에 행 컨트롤을 제공하지 않습니다. 직접 입력 옵션은 추가, 복사, 이동
  컨트롤이 있는 일반 반복 그룹입니다.
- **상품 폼**([product-form.yml](product-form.yml)) — 기본 정보, 예약 기간과 판매 시간이 있는
  공개 설정, 할인이 있는 가격, 반복 속성, 미디어, 옵션 영역, 무게별 요금과 지역별 행
  (`multiple: only`), 반품 정책이 있는 배송, 검색 설정, 반복 안내로 구성합니다. 옵션 영역은
  `(option-form.yml).properties.options` 조각입니다.
- **옵션 행**([option-row.yml](option-row.yml)) — 모든 옵션 행이 쓰는 필드 맵입니다. 옵션명,
  판매 여부, 정가, 판매가, 재고, 노출, 품목 코드로 구성합니다. 판매가는 행이 판매 중일 때만
  필수이고 1 이상이며, 재고 필드는 재고를 관리할 때만 표시합니다.

숨겨진 필드는 값을 유지하고 규칙을 건너뛰므로, 예제 데이터는 표시되면 실패할 값을 숨겨진
영역에 그대로 둡니다([검증 규칙](../../docs/spec/validation-rules.ko.md#평가)).

| 파일 | 내용 |
| --- | --- |
| [option-row.yml](option-row.yml) | 재사용하는 옵션 행 필드 맵 |
| [option-form.yml](option-form.yml) | 옵션 폼 명세 |
| [product-form.yml](product-form.yml) | 상품 폼 명세 |
| [option-valid.json](option-valid.json), [option-invalid.json](option-invalid.json) | 오류가 없는 옵션 폼 데이터와 오류가 다섯 개인 데이터 |
| [product-valid.json](product-valid.json), [product-invalid.json](product-invalid.json) | 오류가 없는 상품 폼 데이터와 오류가 열네 개인 데이터 |
| [examples.test.mjs](examples.test.mjs) | 합성, 검증, 렌더링 테스트 |

## 실행

테스트는 빌드된 `@crudui/validator`, `@crudui/generator-core`, `@crudui/generator-html`
패키지를 가져옵니다. 저장소 루트에서 실행합니다.

```sh
npm run build
node scripts/run-tests.mjs node -- examples/product-forms/examples.test.mjs
```

`node scripts/check-schema.mjs`는 세 YAML 파일을 메타 스키마로 검사합니다.
