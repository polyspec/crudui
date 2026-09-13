# 구형 스키마

[English](legacy-schema.md).

명시적인 `legacy` 모듈은 이 필드 모델을 사용합니다. 패키지 루트는
[현재 스키마](schema.ko.md)를 사용합니다. 구형 모듈은 명시적으로 선택하며,
현재 검증기는 구형 선언을 변환하지 않습니다.

## 필드와 규칙

구형 루트는 `type: group`과 `properties` 맵을 사용합니다. 각 맵 키는 필드
이름입니다. 중첩 그룹은 별도의 `properties` 맵을 사용합니다. 필드는 `rules`에
규칙을, `messages`에 사용자 지정 규칙 메시지를 선언합니다.

```yaml
type: group
properties:
  email:
    type: email
    label: Email
    rules:
      required: true
      email: true
    messages:
      required: Enter an email address.
```

규칙은 규칙 이름과 매개변수의 맵입니다. 메시지는 규칙 이름과 문자열의 맵입니다.
라벨·플레이스홀더·클래스·선택지 라벨 등의 렌더링 속성 자체는 검증 규칙을
선언하지 않습니다.

`multiple: true`는 반복 그룹 값과 반복 스칼라 값을 지원합니다. TypeScript 구형
검증기는 배열 그룹을 인덱스순으로, 객체 그룹을 정렬된 키순으로 순회합니다.
오류 경로에는 인덱스 또는 키를 유지합니다. 이는 현재
[폼 인스턴스 순서 계약](form-runtime.ko.md)과 다릅니다.

`display_switch`와 `display_target`은 구형 검증을 비활성화할 수 있습니다.
[구형 표시](legacy-visibility.ko.md)를 참고합니다. 현재 스키마는 해당 키를 거부하며
`design`과 `validate`를 분리합니다.

## 제출 선언

루트의 `action`은 `method`, `url`, `enctype`, `buttons`를 선언할 수 있습니다.
버튼 선언에는 `label`, `class`, `type`, `href`, `onclick`을 포함할 수 있습니다. 구형 선언을
읽는 렌더러는 없으며, 구형 번역기가 현재 루트 `action`과 `buttons`로 변환합니다
([스키마](schema.ko.md) 참고). 애플리케이션 제출과 서버 저장은 별도 작업입니다.

## 소스 정의

- [구형 검증기 타입](../../packages/validator-ts/src/legacy/types.ts)
- [구형 검증기 순회](../../packages/validator-ts/src/legacy/Validator.ts)
- [예제 색인](../../examples/README.ko.md)

공통 표현식 문법은 [표현식](expressions.ko.md)에서 설명합니다. 구형 검증기 보조
함수는 별도의 매개변수 처리를 사용합니다. 현재 표현식 계약은 모든 구형 보조
API가 동일하다는 증거가 아닙니다.
