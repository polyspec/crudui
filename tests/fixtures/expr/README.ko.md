# 공통 표현식 고정 사례

[English](README.md).

TypeScript·PHP·Go·Rust와 PHP 확장은 `cases.json`을 불러옵니다. 각 사례는
표현식, 기대 토큰·AST, 기대 불리언·값 결과를 포함한 데이터 컨텍스트를
제공합니다. 거부 사례는 `name`, `expr`, 파싱 오류 메시지의 첫 줄인 `error`만
포함하며 메시지를 보고하지 않는 PHP 확장은 파싱에 실패하는지 확인합니다.
[표현식 계약](../../../docs/spec/expressions.ko.md)이 의미를 정의합니다.
토큰·AST 비교에서는 소스 위치를 제외합니다.

토큰은 `type`, `value`, `literal`을 포함합니다. 공백은 제외하며 마지막 토큰은
`EOF`입니다. AST 필드는 다음과 같습니다.

| 노드 | 필드 |
| --- | --- |
| Ternary | `type`, `condition`, `trueValue`, `falseValue` |
| Binary | `type`, `operator`, `left`, `right` |
| Unary | `type`, `operator`, `operand` |
| In | `type`, `negated`, `value`, `list` |
| Path | `type`, `relative`, `levelsUp`, `segments` |
| Literal | `type`, `valueType`, `value` |
| Group | `type`, `expression` |

경로 세그먼트는 문자열 값을 가진 `identifier`, 값이 없는 `wildcard`, 숫자 값을
가진 `index` 타입입니다. 데이터 컨텍스트는 `data`, 선택적인 `currentPath`,
기대 `value`, 기대 `truthy`를 포함합니다.

사례는 상대·와일드카드 경로, 비교, 포함 검사, 논리 우선순위, 중첩 삼항식,
경로 비교, 불리언 변환, 닫히지 않은 목록, 중첩 한도를 검사합니다. 한도
사례는 괄호·부정·연쇄·삼항식이 정확히 64 단계인 식, 각각 한 단계를 넘는 식,
괄호 10,000 겹의 식입니다. 빈 배열과 객체는 조건에서 참이며 필수
입력 검증은 별개입니다. 조건맵 키를 표현식으로 검사하지만 이 사례만으로
맵의 순서에 따른 선택을 증명하지는 않습니다.

저장소 루트에서 다시 생성합니다.

```sh
node_modules/.bin/tsx tests/fixtures/expr/generate.ts > tests/fixtures/expr/cases.json
```

생성기는 실제 TypeScript 토큰·AST·결과를 기록합니다. 생성된 변경을 계약과
대조하고 모든 언어 테스트와 PHP 확장 엔진 테스트를 실행합니다. 실패한 구현을 통과시키기 위한
목적으로만 기대 결과를 변경하면 안 됩니다.
