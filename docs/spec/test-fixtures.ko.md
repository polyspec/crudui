# 테스트 사례

[English](test-fixtures.md).

고정 사례는 입력과 기대 동작을 정의합니다. 형식은 검사하는 계약에 따라 다릅니다.
구형 사례의 통과는 현재 API의 적합성을 증명하지 않습니다.

| 위치 | 계약 |
| --- | --- |
| `tests/fixtures/validate/cases.json` | 현재 검증 결과와 조합 실패. |
| `tests/fixtures/compose/` | 참조와 패치 조합. |
| `tests/fixtures/expr/` | 토큰·AST·표현식 평가. |
| `tests/fixtures/form-render/` | 기대 폼 렌더링. |
| `tests/fixtures/form-session/` | 공통 폼 입력과 상호작용 시나리오. |
| `tests/cases/*.json` | 구형 검증 사례. |

## 현재 검증

검증 사례 파일은 배열입니다. 각 항목은 `name`, `spec`, `data`를 포함하며 선택적인
`files`는 조합 입력을 제공합니다. `note`는 사례를 설명합니다. `expected`는 전체
`{ valid, errors }` 결과를 포함합니다. 로드 실패 사례는 대신
`expectLoadError: { code }`를 사용합니다.

```json
{
  "name": "supplied-name",
  "spec": {
    "type": "group",
    "properties": { "name": { "type": "text", "validate": { "required": true } } }
  },
  "data": { "name": "Example" },
  "expected": { "valid": true, "errors": [] }
}
```

[TypeScript 적합성 검사](../../packages/validator-ts/src/validate.conformance.test.ts)는
전체 결과를 엄격하게 비교하고 조합 오류 코드를 검사합니다. 기대 결과가 없는
항목도 거부합니다. PHP·Go·Rust 패키지 검사도 같은 검증 사례 파일을 사용합니다.

## 구형 검증

구형 스위트는 `testSuite`, `version`, `description`, `tests`를 포함합니다.
사례 버전은 패키지 버전이 아니라 사례 형식을 설명합니다. 각 테스트는 `id`,
`spec`, `cases`를 포함합니다. 사례는 `input`과 `expected`를 포함하며
`expected.valid`는 결과를, 선택적인 `error`와 `field`는 첫 규칙과 필드 경로를
검사합니다.

구형 연동 검사는 단일 필드 스펙을 그룹의 `value` 아래에 추가하고 입력도 같은
키 아래에 추가합니다. `properties`가 있는 그룹은 그대로 사용합니다.
`"__undefined__"` 입력 표시는 연동 검사에서 값 없음을 나타냅니다.
[구형 TypeScript 연동 검사](../../packages/validator-ts/src/__tests__/conformance.test.ts)를 참고합니다.

## 사례 추가와 검토

검사하는 계약에 해당하는 위치에 사례를 추가합니다. 동작을 설명하는 식별자와
해당 동작을 재현하는 입력을 사용합니다. 기대 결과는 명세에서 결정하며 실패한
구현에 맞추기 위해 변경하지 않습니다. 계약이 바뀌면 기대 결과와 구현을 함께 검토합니다.

생성된 기대 결과도 직접 작성한 기대 결과와 동일하게 검토합니다. 생성만으로
정확성이 증명되지는 않습니다. 생성된 사례를 관련 구현에서 실행하고 현재 결과를
[기능 상태](../features.ko.md)에 기록합니다. 검사 수와 배포 결과는 사례 형식
계약에 포함하지 않습니다.

[폼 검증](../operations/verification.ko.md)은 렌더링·DOM·스타일·입력 상태·브라우저
상호작용 검사를 별도로 정의합니다.
