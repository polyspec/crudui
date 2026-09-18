# 검증 규칙

[English](validation-rules.md).

필드는 `validate` 아래에 규칙을 선언합니다. [스키마 계약](schema.ko.md)은
필드 구조를, [검증 API](../operations/validation.ko.md)는 진입점과 로드 실패,
입력 실패를 정의합니다.

## 등록 규칙

| 규칙 | 매개변수와 동작 |
| --- | --- |
| `required` | `true`는 비어 있지 않은 입력값을 요구합니다. |
| `email`, `url` | 해당 형식 검사를 불리언으로 활성화합니다. |
| `minlength`, `maxlength` | 길이의 정수 최소 또는 최대입니다. [값](#값)을 참고합니다. |
| `rangelength` | 길이의 `[최소, 최대]`입니다. [값](#값)을 참고합니다. |
| `number`, `digits` | [숫자](#값) 검사 또는 숫자 문자만 허용하는 검사를 불리언으로 활성화합니다. |
| `min`, `max` | 경계를 포함하는 숫자 하한 또는 상한입니다. |
| `range` | 경계를 포함하는 숫자 범위 `[최소, 최대]`입니다. |
| `step` | 0부터 세는 숫자 증분입니다. |
| `match`, `pattern` | 값 전체에 대한 [패턴](#패턴)이며 두 이름은 같은 규칙 구현을 사용합니다. |
| `equalTo`, `notEqual` | 필드 비교이며 참조 또는 리터럴 매개변수를 그대로 받습니다. |
| `in` | 목록, 쉼표 문자열, 맵에 대한 [포함](#값) 여부입니다. |
| `date`, `dateISO` | 날짜 형식 검사를 불리언으로 활성화합니다. |
| `enddate` | 시작일 필드 경로이며 파싱한 종료일은 파싱한 시작일보다 이전일 수 없습니다. |
| `mincount`, `maxcount` | 컬렉션 크기의 최소 또는 최대입니다. |
| `unique` | 고유성 검사이며 선택적으로 참조 또는 필터 매개변수를 사용합니다. |
| `accept` | 파일 확장자 또는 MIME 타입 매개변수입니다. |

[TypeScript 등록부](../../packages/validator-ts/src/rules/index.ts)는 기본 규칙 이름을
정의합니다. `crudui describe`는 이 등록부에서 목록을 생성합니다.
[CLI 절차](../operations/cli.ko.md)를 참고합니다. 모든 런타임은 같은 기본 규칙을 가지며 다른 규칙을
등록하는 방법은 없습니다. 이 이름이 아닌 `validate` 또는 `messages` 키는 `UNKNOWN_RULE`로 로드에
실패합니다([매개변수 오류](#매개변수-오류) 참고). 이름은 정확히 비교하므로 `equalto`는 `equalTo`가 아닙니다.

## 평가

규칙은 선언 순서대로 실행하며 필드별 첫 실패에서 중단합니다. 해석된 매개변수가
`false` 또는 `null`이면 규칙을 비활성화합니다. 등록되지 않은 규칙 이름은 매개변수와 관계없이
로드 실패이므로 철자가 틀린 규칙이 검증을 조용히 끄는 일은 없습니다. 메타 스키마도 같은 이름을 거부합니다.

`number` 필드는 해당 규칙을 명시적으로 선언하지 않았으면 다른 규칙보다 먼저
암묵적인 `number` 검사를 실행합니다. 비유한 숫자 입력은 숫자 검증에 실패합니다.

**표시 여부.** 검증하는 데이터에 대해 `design.show`가 `false`로 해석되는 필드는 숨겨진 필드입니다.
숨겨진 필드와 그 필드에 포함된 모든 필드의 규칙은 `required`와 컬렉션 개수 규칙을 포함해 평가하지 않으며
오류를 보고하지 않습니다. 값은 바꾸거나 제거하지 않습니다. 데이터는 값을 유지하고 다른 조건과 참조도 그
값을 그대로 읽으므로, 필드가 숨겨진 동안 유지한 값은 데이터가 필드를 다시 보이게 하면 다시 검증합니다.
`design.show`는 조건부 매개변수처럼(불리언, 표현식, 조건 맵을 필드의 행 문맥에서) 해석하며,
`false`로 해석될 때만 숨기므로 `design.show`가 없거나, 조건 맵이 아무것도 선택하지 않거나, 유효한 표현식이
아닌 문자열(리터럴)인 필드는 보이는 필드입니다. 데이터 모양은 입력 계약이므로 숨겨진 필드에도 검사합니다. 표시 여부는 데이터만으로 결정하므로 서버는 폼을 표시한
화면과 같은 결론을 냅니다.

## 값

모든 런타임은 다음 정의를 적용하며, 아래 규칙은 이 밖의 공백·빈 값·텍스트 개념을 쓰지 않습니다.

**Unicode 데이터**는 [`contracts/unicode-properties.json`](../../contracts/unicode-properties.json)에 기록된
Unicode 16.0.0입니다. `scripts/generate-unicode-properties.mjs`가 `contracts/unicode/`의 Unicode Character
Database 파일에서 이 표를 만듭니다. 모든 런타임은 이 표를 내장하고 다른 Unicode 데이터를 쓰지 않으므로 모든
코드 포인트를 똑같이 분류합니다.

**공백**은 Unicode `White_Space` 속성을 가진 코드 포인트뿐입니다. U+0009–U+000D, U+0020,
U+0085, U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029, U+202F, U+205F, U+3000입니다.
U+0000, U+180E, U+200B, U+FEFF는 공백이 아닙니다. **다듬기**는 앞뒤 공백만 제거합니다.

**빈 값**은 값 없음, `null`, 다듬은 뒤 비는 문자열, 빈 배열, 빈 객체입니다. `0`과 `false`는
입력된 값입니다. `required`는 빈 값에서 실패합니다. `mincount`와 `maxcount`를 제외한 다른
규칙은 빈 값을 평가하지 않고 통과시키며, 컬렉션 개수 규칙은 빈 컬렉션도 평가합니다. 데이터가 없는 반복 필드나 그룹은 빈 컬렉션입니다. 필수 입력과
컬렉션 제한은 별도입니다. [빈 컬렉션](empty-collections.ko.md)을 참고합니다.

스칼라의 **정규 텍스트**는 문자열이면 그 문자열, `true`는 `1`, `false`는 `0`, 유한한 숫자는
그 double 값을 ECMAScript `Number.prototype.toString`이 쓰는 텍스트입니다. 즉 같은 double로 다시 읽히는 가장
짧은 텍스트이며, 크기가 10^21 이상이거나 10^-6 미만이면 지수를 쓰고 음수 0은 `0`입니다. 정수는 먼저 가장
가까운 double로 바꾸므로 `9007199254740993`은 `9007199254740992`로 씁니다.

**길이** 규칙(`minlength`, `maxlength`, `rangelength`)은 스칼라의 정규 텍스트를 다듬지 않고
Unicode 코드 포인트 수로 셉니다. 제한값은 0부터 9007199254740991까지의 정수이며
`rangelength`는 최소 ≤ 최대여야 합니다. 배열이나 객체 값은 정규 텍스트가 없으므로 길이 규칙, `pattern`, `match`에 실패합니다.

**숫자.** 유한한 수이거나, 다듬은 뒤 값이 유한한 *숫자 텍스트*인 문자열은 숫자 값입니다. 숫자 텍스트는
HTML의 유효한 부동소수점 수입니다. 선택적인 `-` 다음에 숫자, 숫자와 `.`과 숫자, 또는 `.`과 숫자가 오고,
선택적으로 `e`나 `E`, 선택적인 `-`나 `+`, 숫자가 옵니다
(`^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$`). 그 값은 가장 가까운 double입니다. `+1`,
`1.`, 16진수, `Infinity`, `NaN`, 구분 기호, ASCII가 아닌 숫자는 숫자 텍스트가 아니며, 값이 넘치는 텍스트는
숫자가 아닙니다. 불리언, `null`, 배열, 객체는 숫자가 아닙니다.

- `number`는 숫자 값을 통과시킵니다.
- `min`, `max`, `range`는 최솟값보다 작지 않고 최댓값보다 크지 않은 숫자 값을 통과시키며, `step`은 0부터
  센 간격의 정수배인 숫자 값을 통과시킵니다. 숫자가 아닌 값은 이 규칙들에 실패합니다. 배수 여부는 값과
  간격을 정규 텍스트가 쓰는 10진수로 읽어 허용 오차 없이 정확히 판정하므로 `0.3`은 `0.1`의 배수이고
  `0.30000000000000004`는 아닙니다.
- `digits`는 정규 텍스트(문자열은 다듬은 뒤)가 ASCII 숫자로만 이루어진 문자열이나 수를 통과시키며, 불리언과
  그 밖의 값은 실패합니다.
- `mincount`와 `maxcount`는 배열의 원소나 객체의 키를 셉니다. 값 없음, `null`, 다듬으면 비는 문자열은 0개,
  그 밖의 스칼라는 1개입니다.
- 메시지는 숫자 매개변수를 정규 텍스트로 표시합니다. 기본 메시지와 선언한 메시지의 `{0}`과 `{1}`은 규칙에
  해당 매개변수가 있으면 모두 치환하고, 규칙에 없는 매개변수의 자리 표시자는 쓴 그대로 둡니다.

**포함**(`in`)은 목록(각 원소 그대로), 쉼표 문자열(U+002C로 나누고 각 항목을 다듬음), 맵(키)에서
멤버를 얻습니다. 멤버는 문자열, 숫자, 불리언이며 그 밖의 형식인 멤버, 빈 멤버 집합, 정규 텍스트를 다듬으면 비는 멤버는
선언 오류이며, 멤버는 순서대로 각각 형식을 먼저, 빈 값 여부를 다음에 검사합니다. 문자열 값은 다듬고, 배열
값은 모든 원소가 통과해야 통과합니다. 빈 원소(빈 배열·빈 객체 포함)는 빈 값처럼 통과하고 비어 있지 않은 배열이나 객체
원소는 실패합니다. 값과 멤버의 정규 텍스트가
같은 코드 포인트이거나, 둘 다 숫자이고 값이 같으면 일치합니다. 목록 원소와 맵 키는 그대로 읽으므로 앞뒤에
공백이 있는 멤버는 숫자 텍스트가 아닙니다. 대소문자, Unicode 정규화, 숫자가 아닌
텍스트는 일치하지 않습니다.

## 패턴

`pattern`과 `match`는 HTML `pattern` 속성처럼 값의 정규 텍스트 **전체**가 일치해야 합니다. 패턴은 CRUDUI
패턴 언어를 사용합니다. 이 언어는 모든 런타임이 직접 인식하고 매칭하는 정규 언어이며, 결과가 같고 매칭 시간은
값 길이와 패턴 크기의 곱에 비례합니다.

| 구성 | 허용 형식 |
| --- | --- |
| 리터럴 | `\ ^ $ . \| ? * + ( ) [ ] { }`를 제외한 모든 Unicode 스칼라 값 |
| 이스케이프 | `\` 뒤의 `^ $ \ . * + ? ( ) [ ] { } \| / -` 중 하나, `\t \n \r \f \v`, `\xHH`, `\u{H…}`(16진수 1–6자리, 스칼라 값) |
| 클래스 약칭 | `\d` = `[0-9]`, `\w` = `[0-9A-Za-z_]`, `\s` = 공백, `\D \W \S`는 각각의 여집합 |
| 임의 문자 | `.` = U+000A를 제외한 모든 코드 포인트 |
| 대괄호 클래스 | 멤버가 하나 이상인 `[…]` 또는 `[^…]`. 멤버는 리터럴, 이스케이프, `\d`, `\w`, `\s`, 속성, 끝점이 단일 코드 포인트이고 내림차순이 아닌 범위 `a-z`입니다. 클래스 안에서는 `[`, `]`, `\`, 처음이나 끝이 아닌 `-`만 이스케이프합니다 |
| Unicode 속성 | 일반 분류(`L Lu Ll Lt Lm Lo M Mn Mc Me N Nd Nl No P Pc Pd Ps Pe Pi Pf Po S Sm Sc Sk So Z Zs Zl Zp C Cc Cf Co`)의 `\p{X}` 또는 `\P{X}`, Unicode 데이터에 있는 스크립트(Unicode `Script` 속성)의 `\p{Script=Name}` 또는 `\P{Script=Name}` |
| 그룹 | `(…)`, `(?:…)`, 고유하고 `[A-Za-z_][A-Za-z0-9_]*`에 맞는 이름의 `(?<name>…)`. 그룹은 최대 100단계까지 중첩합니다 |
| 수량자 | 원자나 그룹 뒤의 `*`, `+`, `?`, `{n}`, `{n,}`, `{n,m}`(10진 숫자, n ≤ m ≤ 1000), 뒤에 `?`를 붙일 수 있음 |
| 선택 | `\|` |
| 앵커 | 첫 문자의 `^`와 마지막 문자의 `$`. 전체 일치에서는 의미를 더하지 않습니다 |

선택지와 그룹은 비어 있을 수 있고 패턴이 앵커만으로 이루어질 수도 있습니다. 거부하는 것은 빈 패턴뿐입니다.
값 전체만 매칭하므로 게으른 수량자는 탐욕적 수량자와 같은 값에 일치합니다. `C`는 `Cc`, `Cf`, `Co`,
서로게이트, 미배정 코드 포인트이며, 속성의 여집합은 그 속성 밖의 모든 코드 포인트입니다.

**크기.** 패턴의 크기는 1000 이하입니다. 원자(리터럴, 이스케이프, 약칭, `.`, 클래스, 속성)의 크기는 1이고,
연속과 선택은 구성 요소 크기의 합이며, 수량자가 붙은 항목은 항목 크기에 최댓값을, 상한이 없으면 최솟값 더하기
1을 곱합니다(`*`는 1배, `+`는 2배).

그 밖의 구성은 언어에 속하지 않습니다. 역참조, 전후방 탐색, 인라인 플래그, 대소문자 무시, 단어 경계,
POSIX 클래스, 소유·중첩 수량자, `\uHHHH`, 8진수·제어 문자 이스케이프, 빈 패턴이 해당합니다.
구분자는 의미가 없어 `/x/i`는 텍스트 `/x/i`에 일치합니다. 패턴 매개변수는 문자열, `false`, `null`입니다.

## 매개변수 오류

이 정의를 벗어난 매개변수와 등록된 규칙이 아닌 규칙 이름은 로드 실패입니다. 규칙 이름과 매개변수는
조합과 금지 키 검사 다음에 검사합니다. 필드는 선언 순서로, 필드의 `validate` 규칙은 선언 순서로(규칙마다
이름을 매개변수보다 먼저), 이어서 그 필드의 `messages` 키를 선언 순서로 검사하며, 모두 그 필드가 포함한
필드보다 먼저 검사하고 첫 실패를 보고합니다. `messages` 키는 메시지를 재정의할 규칙의 이름이며, 암묵적인
`number` 검사처럼 필드가 선언하지 않은 등록 규칙을 가리킬 수 있습니다. 숨겨진 필드와 데이터가 없는 필드의
이름도 검사합니다. 위치는 필드의 선언 경로, 즉 루트부터의 속성 이름을
`.`로 이은 값이며 행 키를 포함하지 않습니다. 모든 런타임은 같은 코드와 메시지를 보고합니다.

| 매개변수 | 코드 | 메시지 |
| --- | --- | --- |
| 등록된 규칙이 아닌 `validate` 또는 `messages` 키 | `UNKNOWN_RULE` | `Unknown rule: {name}` |
| `minlength`, `maxlength` 제한값 | `INVALID_RULE_PARAMETER` | `Invalid {rule} parameter: expected an integer from 0 to 9007199254740991` |
| `rangelength` 제한값 | `INVALID_RULE_PARAMETER` | `Invalid rangelength parameter: expected [minimum, maximum] integers with minimum not above maximum` |
| `number`, `digits` 매개변수 | `INVALID_RULE_PARAMETER` | `Invalid {rule} parameter: expected true or false` |
| `min`, `max` 제한값 | `INVALID_RULE_PARAMETER` | `Invalid {rule} parameter: expected a finite number` |
| `range` 제한값 | `INVALID_RULE_PARAMETER` | `Invalid range parameter: expected [minimum, maximum] finite numbers with minimum not above maximum` |
| `step` | `INVALID_RULE_PARAMETER` | `Invalid step parameter: expected a finite number above 0` |
| `mincount`, `maxcount` 제한값 | `INVALID_RULE_PARAMETER` | `Invalid {rule} parameter: expected an integer from 0 to 9007199254740991` |
| 다른 형식의 `in` 멤버 | `INVALID_RULE_PARAMETER` | `Invalid in parameter: expected a list, a comma-separated string or a map` |
| 문자열·숫자·불리언이 아닌 `in` 멤버 | `INVALID_RULE_PARAMETER` | `Invalid in parameter: members must be strings, numbers or booleans` |
| 멤버가 없거나 빈 멤버가 있는 `in` | `INVALID_RULE_PARAMETER` | `Invalid in parameter: members must not be empty` |
| 다른 형식의 `pattern`, `match` | `INVALID_RULE_PARAMETER` | `Invalid {rule} parameter: expected a pattern string` |
| 언어에 속하지 않는 `pattern`, `match` | `INVALID_RULE_PATTERN` | `Invalid {rule} pattern: {reason} at {offset}` |

패턴의 `{reason}`은 `empty pattern`, `unexpected character`, `unsupported construct`,
`invalid escape`, `invalid class`, `invalid range`, `invalid property`, `invalid quantifier`,
`unterminated group`, `unterminated class`, `invalid group name`, `duplicate group name`, `nesting too deep`,
`pattern too large` 중 하나입니다. 언어에 없는 이스케이프는
`invalid escape`이고, `(?:`와 `(?<name>`이 아닌 `(?` 그룹은 `unsupported construct`입니다. `{offset}`은
잘못된 구성이 시작하는 코드 포인트 위치(이스케이프의 역슬래시, 그룹의 `(`, 클래스의 `[`, 수량자나 범위의
첫 문자)이며, 닫히지 않은 그룹이나 클래스는 패턴의 길이입니다. 원자나 그룹 뒤에 오지 않은 수량자 문자
(`* + ? {`), 1000을 넘는 한도, 최댓값보다 큰 최솟값은 `invalid quantifier`입니다. 대괄호 클래스 안의 `\D`,
`\W`, `\S`, 빈 클래스, 중첩된 `[`, 처음·끝·범위 연산자가 아닌 이스케이프 없는 `-`는 `[` 위치의
`invalid class`입니다. 클래스는 왼쪽부터 읽으므로 이런 멤버는 범위의 끝점 자리에 있어도 읽는 순간 보고합니다.
단일 코드 포인트가 아닌 집합인 범위 끝점과 내림차순 범위는 첫 끝점 위치의 `invalid range`이고, 클래스 안의
이스케이프나 속성 오류는 그 역슬래시 위치에서 자기 사유를 유지합니다. 후방 탐색(`(?<=`, `(?<!`)이 아니면서 유효한
이름이 `>`로 닫히지 않은 `(?<` 그룹은 `(` 위치의 `invalid group name`입니다. 처음이나 끝이 아닌 `^`와 `$`(`^`나 `$` 한 글자 패턴은 앵커),
서로게이트 코드 포인트는 `unexpected character`입니다. 101번째 중첩 단계를 여는 그룹은 그 `(` 위치의
`nesting too deep`입니다. 크기가 1000을 넘는 패턴은 위치 0의 `pattern too large`이며, 나머지가 모두 유효할 때
검사합니다.

매개변수는 스펙을 로드할 때 검사하며, 조건 맵이나 삼항식이 선택할 수 있는 모든 리터럴도 선택 여부와 관계없이
이때 검사합니다. 유효한 [표현식](expressions.ko.md)이 아닌 문자열은 리터럴입니다. 데이터에서 계산한 값만 선택될 때 검사합니다. 단순 조건식의 결과(`false`는 규칙을 끄고 `true`는 매개변수로
검사)와 경로나 조건인 삼항식 분기가 해당하며, 선택은 빈 값 건너뛰기보다 먼저 일어납니다. 런타임은 패턴 규칙을 건너뛰거나 경고하지 않습니다. 패턴을 정규식 엔진에 넘기지 않고, 이 문법으로
인식한 뒤 Unicode 데이터 위에서 자체 선형 시간 매처로 매칭합니다.

반복 스칼라 필드는 `required`, `unique`, `mincount`, `maxcount`를 컬렉션에 적용하고
다른 규칙을 각 원소에 적용합니다. 중첩 반복 그룹은 오류 경로에 행 키를 유지합니다.
[폼 런타임](form-runtime.ko.md)은 행 식별과 순서를 정의합니다.

`unique`는 `equalTo`와 같은 방식으로 값을 비교합니다. 문자열은 코드 포인트가 같은 문자열과만, 숫자는 같은
숫자와만, 불리언과 `null`은 자기 자신과만 같습니다. 타입이 다른 값은 같지 않으므로 `1`과 `"1"`은 다릅니다.
목록은 같은 값을 같은 순서로 가진 목록과 같고, 객체는 언어 값처럼 항목 순서와 관계없이 같은 이름과 값을 가진
객체와 같습니다. White_Space로 trim한 뒤 비어 있는 값은 비교에 참여하지 않습니다. 반복 필드에서는 두 값이
같으면 컬렉션이 실패하고, 반복 그룹 안의 필드에서는 앞선 행과 값이 같은 각 행이 실패하며, 필터 조건은 행마다
한 번 평가합니다. 검사 시간은 값 개수에 비례합니다.

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

`design.show`는 필드의 규칙 실행 여부를 결정합니다. [표시 여부](#평가)를 참고합니다.
`validate.required`의 조건은 보이는 필드를 선택 입력으로 만듭니다.

## 오류와 검증

각 오류는 필드 경로·필드 이름·실패 규칙·메시지를 포함하고 값이 있으면 값도
포함합니다. 사용자 지정 메시지는 `match`와 `pattern`을 구분해 선언한 규칙 이름을
사용합니다. 기본 메시지는 규칙 구현에 정의합니다.
[사례 계약](test-fixtures.ko.md)은 기대 결과와 실패 기록을 정의합니다.

[테스트 절차](../operations/testing.ko.md)로 네 검증기 패키지 검사를 모두 실행합니다.
실제 결과는 [기능 상태](../features.ko.md)에 기록합니다. 모든 등록부에 같은 규칙
이름이 있다는 사실은 모든 입력의 동작이 같다는 증거가 아닙니다.
