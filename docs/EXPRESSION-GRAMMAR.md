# CRUDUI 표현식 문법 명세

> 4개 언어(JS/PHP/Go/Rust) 표현식 엔진의 **단일 진실**. 토크나이저·파서·평가기는
> 이 명세를 글자 그대로 따른다. 같은 입력 → 같은 토큰열 → 같은 AST → 같은 값.
> 한 언어라도 어긋나면 멱등(schema R6)이 깨진다. 정규식·문자열 split 같은 임시
> 구현은 금지한다 — 연산자 우선순위·중첩 ternary에서 반드시 깨진다. `eval`은 절대
> 쓰지 않는다.

이 명세는 CRUDUI `design.show`/`design.class`/`design.style`, `validate.*`(조건부
규칙) 등 **평가되는 모든 값**에 적용된다. `behavior`의 스크립트(`onchange` 등)는
표현식이 아니라 불투명 클라 JS이므로 이 엔진을 거치지 않는다(schema §4).

기존 자산: `validator-ts/src/parser/ConditionParser.ts`(lexer+AST)·`PathResolver.ts`
(평가), Go `condition_parser.go`·Rust `parser.rs`는 AST 보유. **PHP `ConditionParser.php`는
현재 문자열 split/정규식이라 이 명세의 통일 대상이다**(AST 신규 포팅 필요). 이 명세는
JS/Go/Rust 토큰/AST를 정식화하고 PHP를 여기에 수렴시키며, CRUDUI(값 반환·조건맵)로 확장한다.

## 0. 파이프라인

```
문자열 ─[토크나이저]→ 토큰열 ─[파서]→ AST ─[평가기 + 데이터]→ 값
```

세 단계는 분리된다. 토크나이저는 문법을 모르고, 파서는 데이터를 모르고, 평가기는
문자열을 모른다. 각 단계의 출력이 4언어에서 동일해야 한다(§9 계약).

## 1. 토큰 (terminal)

`ConditionParser` 토큰 실측 + EOF/WHITESPACE.

| 토큰 | 패턴 | 예 |
|---|---|---|
| `DOT` | `.` | `.field` 의 선행 점 |
| `DOT_DOT` | `..`·`...`·… (점 N개, N≥2) | 부모 N−1단계 상향 |
| `ASTERISK` | `*` | 와일드카드 |
| `IDENTIFIER` | `[A-Za-z_][A-Za-z0-9_]*` | 경로 세그먼트 / unquoted 문자열 |
| `STRING` | `'...'` 또는 `"..."` | `'active'` |
| `NUMBER` | 정수·소수 | `42`, `3.14` |
| `BOOLEAN` | `true`·`false` | |
| `NULL` | `null` | |
| `EQ NE` | `==` `!=` | |
| `GT GE LT LE` | `>` `>=` `<` `<=` | |
| `AND OR NOT` | `&&` `\|\|` `!` | |
| `IN NOT_IN` | `in` `not in` | |
| `QUESTION COLON` | `?` `:` | ternary |
| `LPAREN RPAREN` | `(` `)` | |
| `LBRACKET RBRACKET COMMA` | `[` `]` `,` | in 리스트 |
| `WHITESPACE` | 공백(무시) | |
| `EOF` | 입력 끝 | |

**없는 토큰(의도적)**: 산술 `+ - * / %`, 함수 호출 `(`인자`)`, 메서드 `.method()`,
정규식, 할당 `=`, 비트 연산, 루트 경로 `/`. 추가하면 4언어 재현·보안이 깨진다.

## 2. 문법 (EBNF)

우선순위를 production 계층으로 인코딩한다(낮은 결합부터).

```ebnf
expression   = ternary ;
ternary      = logic_or [ "?" ternary ":" ternary ] ;   (* 우결합 *)
logic_or     = logic_and { "||" logic_and } ;
logic_and    = equality { "&&" equality } ;
equality     = comparison { ( "==" | "!=" ) comparison } ;
comparison   = unary [ ( ">" | ">=" | "<" | "<=" ) compare_value
                     | ( "in" | "not in" ) value_list ] ;
unary        = "!" unary | primary ;
primary      = path | literal | "(" expression ")" ;

path         = dots IDENTIFIER { "." IDENTIFIER | "." "*" }
             | "*" { "." IDENTIFIER | "." "*" } ;
dots         = ""            (* 절대/현재 *)
             | "."           (* 형제(현재 레벨) *)
             | ".." { "." } ; (* 부모: 점 개수−1 단계 상향 *)

compare_value = path | literal | IDENTIFIER ;  (* unquoted IDENTIFIER → string *)
value_list   = "[" value { "," value } "]" | value { "," value } ;
value        = literal | IDENTIFIER ;          (* in 리스트의 unquoted → string *)
literal      = STRING | NUMBER | BOOLEAN | NULL ;
```

비교의 우변(`compare_value`)은 점으로 시작하면 경로, 아니면 리터럴/문자열이다
(`ConditionParser.parseComparisonValue` 실측). 따라서 `.a < .b`(경로-경로 비교)가
성립한다.

## 3. 연산자 우선순위 (낮음 → 높음)

1. `?:` (ternary, 우결합)
2. `||`
3. `&&`
4. `== !=`
5. `> >= < <=` · `in` · `not in`
6. `!` (unary)
7. primary: path · literal · `( )`

## 4. AST 노드

필드명은 JS 레퍼런스(`ConditionParser.ts`) 실측 기준이다 — 4언어가 이 직렬화 형태로
동치 비교된다(`position` 제외, 아래 주).

```
Ternary { type:'Ternary', condition: Node, trueValue: Node, falseValue: Node }
Binary  { type:'Binary', operator:'=='|'!='|'>'|'>='|'<'|'<='|'&&'|'||', left: Node, right: Node }
Unary   { type:'Unary', operator:'!', operand: Node }
In      { type:'In', negated: bool, value: Node, list: Node[] }   // list = Literal 노드 배열
Path    { type:'Path', relative: bool, levelsUp: int, segments: PathSegment[] }
Literal { type:'Literal', valueType:'string'|'number'|'boolean'|'null', value }
Group   { type:'Group', expression: Node }

PathSegment = { type:'identifier', value } | { type:'wildcard' } | { type:'index', value: number }
```

**position 주**: JS/Go 노드는 `position:{start,end}`를 갖지만 Rust는 없다. 4언어 AST
동치 비교(공유 픽스처)는 `position`을 **제외**한 의미 필드만 직렬화한다 — position을
계약에 넣으면 4언어 일치가 불가능하다.

## 5. 평가 의미론

평가기는 AST와 **컨텍스트**(현재 필드 위치 + 전체 데이터)를 받아 값을 반환한다.

- **Path**: 컨텍스트 기준 경로 해석. `.x`=형제, `..x`=부모 1단계(점 1개당 1단계),
  `x.*.y`=배열 `x`의 각 원소의 `y`(와일드카드). 값이 없으면 spec의 `default`를
  찾고, 그래도 없으면 `null`(`PathResolver` 실측).
- **Binary 비교**(`== != > >= < <=`): 좌·우 평가 후 비교. 타입 강제·트림·유한수
  규칙은 [VALIDATION-RULES.md](./VALIDATION-RULES.md) "검증 의미론 원칙"을 계승한다
  (4언어 1074 멱등의 그 규칙).
- **Binary 논리**(`&& ||`): 단축 평가, 결과는 boolean.
- **Unary `!`**: 피연산자 truthy의 부정(boolean).
- **In**: `value`가 `list`에 포함되면 true(`not in`은 부정).
- **Ternary**: `cond`가 truthy면 `then`, 아니면 `else`를 평가해 **그 값**을 반환한다.
  `then`/`else`는 boolean뿐 아니라 string/number/null일 수 있다 — 이것이 CRUDUI의
  **값 반환**이며 `design.class` 등이 문자열을 얻는 경로다.
- **Literal / Group**: 자명.

**결과 타입**: boolean(조건·`show`) | string(class/style) | number | null. 호출
지점이 기대 타입을 정한다(`show`는 boolean, `class`는 string).

## 6. truthy 규칙 (4언어 동일)

`null` · `false` · `0` · `""` · 빈 배열 · 빈 객체 = **falsy**. 그 외 truthy.
VALIDATION-RULES.md의 빈값 판정을 그대로 따른다.

## 7. 와일드카드 전략

`items.*.field` 같은 와일드카드 경로는 배열을 순회한다. 비교의 한쪽이 와일드카드면
**any**(하나라도 만족) 또는 **all**(전부 만족) 전략을 호출 지점이 지정한다
(`PathResolver`의 wildcardStrategy 실측). 기본 전략은 구현 계획에서 확정한다.

## 8. 조건맵 (엔진 위, 스펙 레벨)

`design.class` 등의 값은 **단일 표현식** 또는 **조건맵**이다(schema §4).

```yaml
class:
  ".status == 'active'":  text-success
  ".status == 'pending'": text-warning
  true: form-control         # 기본(else) — 항상 참인 조건
```

평가 규칙: 키(조건식)를 **선언 순서대로** 평가해 첫 truthy의 값을 반환한다. 아무것도
맞지 않으면 `true`(있으면)를, 없으면 `null`. 기본키는 `true`(항상 참) — `_` 같은 관례
기호는 R4(매직 토큰 금지) 위반이라 쓰지 않는다. 단일 표현식 `class: "...?...:..."`은
조건맵의 축약이다(둘은 동일 의미론). 조건맵의 각 키는 §2 문법의 표현식이다 — 즉
조건맵은 엔진을 **반복 호출**하는 얇은 래퍼이지 별도 파서가 아니다.

## 9. 4언어 동일 계약 (게이트)

- **토큰·AST·값 일치**: 같은 입력에 대해 4언어가 같은 토큰열, 같은 AST 모양, 같은
  평가 값을 낸다.
- **공유 픽스처**: `표현식 → 기대 토큰열 / 기대 AST(직렬화) / (데이터, 기대 값)`
  케이스를 한 곳에 두고 4언어가 모두 통과해야 한다. 값 반환 ternary·조건맵·경로
  비교는 legacy에 없던 신규이므로 **신규 픽스처**로 검증한다(schema §8·§10).
- **기존 자산 정식화**: `ConditionParser`(4언어)를 이 명세에 맞춰 정식화하고 평가기를
  값 반환·조건맵으로 확장한다 — 새로 짜기보다 명세 준수로 수렴시킨다.

## 10. 비지원 (의도적 — 추가 금지)

산술 · 함수 호출 · 메서드 · 정규식(=`validate.match`의 인자로만 존재) · 할당 ·
비트 연산 · 루트 경로 `/` · `eval`. 평가가 필요한 값은 실측상 이 DSL로 충분하며
(운영 스펙에 산술·함수 없음), 강력함이 필요한 동작은 `behavior` 스크립트로
불투명 전달한다. 평가값에 산술이 정말 필요해지면 4언어 동일 구현과 픽스처를 갖춘
뒤에만 추가한다(YAGNI).
