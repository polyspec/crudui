# 구형 표시 동작

[English](legacy-visibility.md).

이 문서는 명시적인 legacy 검증기와 렌더러를 설명합니다. 현재 스키마는
`design.show`를 사용하며 데이터 검증을 비활성화하지 않습니다.
[스키마 구조](schema.ko.md)와 [데이터 검증](../operations/validation.ko.md)을 참고합니다.

## 검증기 조건

구형 필드는 해당 필드에 `display_switch`와 `display_target`을 선언합니다.
어느 조건이든 검증을 비활성화하면 검증기는 해당 필드의 규칙을 건너뜁니다.
그룹 검증을 건너뛰면 하위 필드도 건너뜁니다.

| `display_switch` | 검증기 동작 |
| --- | --- |
| 없음, `true` 또는 빈 문자열 | 검증을 계속합니다. |
| `false` | 검증을 건너뜁니다. |
| 조건 문자열 | 표현식이 참일 때만 검증을 계속합니다. |

```yaml
type: group
properties:
  payment_type:
    type: select
    items: { card: Card, bank: Bank }
  card_number:
    type: text
    display_switch: ".payment_type == 'card'"
    rules: { required: true }
```

이 예제에서 빈 `card_number`는 `payment_type`이 `card`일 때만 실패합니다.
`display_target`은 다른 값을 참조합니다. 값 없음, null, false, 빈 문자열,
빈 배열과 빈 객체는 검증을 건너뜁니다. 숫자 0과 문자열 `"0"`은 값이 있는
것으로 처리합니다.

이 검증기 조건은 브라우저 표시를 정의하지 않습니다. 구형 렌더러는 아래의
별도 표시 처리를 사용합니다. 속성 이름이 같다는 이유로 렌더러와 검증기의
동작이 같다고 판단하지 않습니다.

## 렌더러 표시

구형 생성기는 맵 형식의 `display_switch`도 받습니다. 전처리는 대상 조건 클래스와
스타일을 포함한 형제 필드의 표시 속성을 수정합니다. 검증기의 문자열 표현식
형식과는 다릅니다.

`display_target_condition_class`와 `display_target_condition_style`은 래퍼 표시를
선택합니다. 이 맵이 있으면 렌더러의 `display_target` 처리 방식이 달라집니다.
해당 맵은 검증 규칙이 아닙니다.

구형 React 렌더러의 `element.all_of`는 선언한 모든 조건을 검사합니다.
기대값이 배열이면 해당 조건에서 하나의 값만 일치해도 됩니다. 일치한 클래스·스타일
설정 또는 `not` 설정을 적용합니다. 검증기는 이 표시 설정을 평가하지 않습니다.

## 소스와 검증

- [TypeScript 구형 검증기](../../packages/validator-ts/src/legacy/Validator.ts)
- [PHP 구형 검증기](../../packages/validator-php/src/Legacy/Validator.php)
- [Go 구형 검증기](../../packages/validator-go/validator/legacy/validator.go)
- [Rust 구형 검증기](../../packages/validator-rust/src/legacy/validator.rs)
- [React 표시 전처리](../../packages/generator-react/src/legacy/hooks/legacyDisplay.ts)
- [React 조건 평가](../../packages/generator-react/src/legacy/hooks/useConditional.ts)
- [공통 구형 검증기 사례](../../tests/cases/display-switch.json)

테스트 결과와 배포 상태는 [기능 상태](../features.ko.md)에서 별도로 관리합니다.
검증기 사례의 통과는 렌더러가 동일하다는 증거가 아닙니다.
