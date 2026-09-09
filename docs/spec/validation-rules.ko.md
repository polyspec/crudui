# 검증 규칙

[English](validation-rules.md).

현재 필드는 `validate` 아래에 규칙을 선언합니다. [스키마 계약](schema.ko.md)은
필드 구조를, [검증 API](../operations/validation.ko.md)는 진입점과 로드 실패를
정의합니다. 명시적인 legacy 모듈은 대신 `rules`를 사용합니다.

## 등록 규칙

| 규칙 | 매개변수와 동작 |
| --- | --- |
| `required` | `true`는 비어 있지 않은 입력값을 요구합니다. |
| `email`, `url` | 해당 형식 검사를 불리언으로 활성화합니다. |
| `minlength`, `maxlength` | 문자열 길이의 최소 또는 최대 숫자값입니다. |
| `rangelength` | 문자열 길이의 `[최소, 최대]`입니다. |
| `number`, `digits` | 숫자 또는 숫자 문자만 포함하는 입력 검사를 불리언으로 활성화합니다. |
| `min`, `max` | 숫자 하한 또는 상한입니다. |
| `range` | 숫자 범위의 `[최소, 최대]`입니다. |
| `step` | 숫자 증분입니다. |
| `match`, `pattern` | 정규식 매개변수이며 두 이름은 같은 규칙 구현을 사용합니다. |
| `equalTo`, `notEqual` | 필드 비교이며 참조 또는 리터럴 매개변수를 그대로 받습니다. |
| `in` | 배열 또는 맵 형식을 포함한 포함 여부 검사 값입니다. |
| `date`, `dateISO` | 날짜 형식 검사를 불리언으로 활성화합니다. |
| `enddate` | 시작일 필드 경로이며 파싱한 종료일은 파싱한 시작일보다 이전일 수 없습니다. |
| `mincount`, `maxcount` | 컬렉션 크기의 최소 또는 최대입니다. |
| `unique` | 고유성 검사이며 선택적으로 참조 또는 필터 매개변수를 사용합니다. |
| `accept` | 파일 확장자 또는 MIME 타입 매개변수입니다. |

[TypeScript 등록부](../../packages/validator-ts/src/rules/index.ts)는 기본 규칙 이름을
정의합니다. `crudui describe`는 이 등록부에서 목록을 생성합니다.
[CLI 절차](../operations/cli.ko.md)를 참고합니다. 사용자 지정 TypeScript 규칙을
등록해도 다른 언어에 해당 규칙이 설치되지는 않습니다.

## 평가

규칙은 선언 순서대로 실행하며 필드별 첫 실패에서 중단합니다. 해석된 매개변수가
`false` 또는 `null`이면 규칙을 비활성화합니다. 런타임은 미등록 규칙을 건너뜁니다.
런타임의 수용을 스키마 검증으로 판단하지 않고 선언 형식을 별도로 검사합니다.

값 없음·null·공백만 있는 문자열·빈 배열·빈 객체는 `required`에서 빈 값입니다.
숫자 0과 불리언 false는 입력된 값입니다. 다른 형식·범위 규칙은 일반적으로 빈 값을
허용하지만 컬렉션 개수 규칙은 빈 컬렉션도 평가합니다. 필수 입력과 컬렉션 제한은
별도입니다. [빈 컬렉션](empty-collections.ko.md)을 참고합니다.

`number` 필드는 해당 규칙을 명시적으로 선언하지 않았으면 다른 규칙보다 먼저
암묵적인 `number` 검사를 실행합니다. 비유한 숫자 입력은 숫자 검증에 실패합니다.
문자열 길이는 Unicode 코드 포인트를 사용합니다. 정규식에 앵커를 자동으로 추가하지
않으므로 전체 문자열이 일치해야 하면 앵커를 선언합니다.

반복 스칼라 필드는 `required`, `unique`, `mincount`, `maxcount`를 컬렉션에 적용하고
다른 규칙을 각 원소에 적용합니다. 중첩 반복 그룹은 오류 경로에 행 키를 유지합니다.
[폼 런타임](form-runtime.ko.md)은 행 식별과 순서를 정의합니다.

## 조건부 매개변수

```yaml
type: group
properties:
  email:
    type: email
    validate:
      required: ".enabled"
      email: true
  amount:
    type: text
    validate:
      min: ".premium ? 10 : 1"
```

조건부 매개변수는 [표현식 계약](expressions.ko.md)을 사용합니다. 조건맵은 첫 번째로
일치한 값 또는 `true` 기본값을 선택합니다. 삼항식은 선택한 분기의 값을 반환합니다.

`equalTo`, `notEqual`, `unique`, `enddate`, `accept`, `match`, `pattern`, `in`은
자체 처리를 위해 매개변수를 그대로 받습니다. 특히 `enddate: period.start`는
불리언 조건이 아니라 필드 참조입니다. 포함 여부 검사 맵은 조건맵이 아닌 값 집합입니다.

`enddate`의 `.start`는 형제 필드, `..start`는 한 그룹 위의 필드를 공통 필드 참조
해석기로 조회합니다.

`design.show`는 검증을 비활성화하지 않습니다. 조건부 필수 입력은
`validate.required`에 선언해야 합니다. 브라우저 표시와 서버 검증은 별도 작업입니다.

## 오류와 검증

각 오류는 필드 경로·필드 이름·실패 규칙·메시지를 포함하고 값이 있으면 값도
포함합니다. 사용자 지정 메시지는 `match`와 `pattern`을 구분해 선언한 규칙 이름을
사용합니다. 기본 메시지는 규칙 구현에 정의합니다.
[사례 계약](test-fixtures.ko.md)은 기대 결과와 로드 오류 검사를 정의합니다.

[테스트 절차](../operations/testing.ko.md)로 네 검증기 패키지 검사를 모두 실행합니다.
실제 결과는 [기능 상태](../features.ko.md)에 기록합니다. 모든 등록부에 같은 규칙
이름이 있다는 사실은 모든 입력의 동작이 같다는 증거가 아닙니다.
