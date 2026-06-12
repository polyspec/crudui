# 조건식 파서 (Condition Expression Parser) 명세서

form-spec 조건식의 문법과 평가 의미론.

**참조 구현(reference implementation)은 validator-js다**:

- 파서(lexer + AST): `packages/validator-js/src/parser/ConditionParser.ts`
- 경로 해석·평가기: `packages/validator-js/src/parser/PathResolver.ts`

Go(`packages/validator-go/validator/condition_parser.go`, `path_resolver.go`,
`ternary.go`)와 PHP(`packages/validator-php/src/ConditionParser.php`,
`PathResolver.php`)는 동일 동작의 포팅이며, 951케이스 크로스언어 테스트로
일치가 검증된다. 이 문서와 구현이 다르면 구현(validator-js)이 정답이다.

## 목차

1. [사용처](#사용처)
2. [BNF 문법](#bnf-문법)
3. [토큰](#토큰)
4. [연산자 우선순위](#연산자-우선순위)
5. [경로 해석 의미론](#경로-해석-의미론)
6. [와일드카드 평가 전략](#와일드카드-평가-전략)
7. [Ternary 평가](#ternary-평가)
8. [값 비교 의미론](#값-비교-의미론)
9. [조건식 판별 휴리스틱](#조건식-판별-휴리스틱)
10. [캐싱](#캐싱)
11. [에러 처리](#에러-처리)

---

## 사용처

| 사용처 | 예 |
|--------|----|
| 조건부 규칙 파라미터 | `rules: { required: ".payment_type == 'card'" }` |
| ternary 파라미터 | `rules: { min: ".is_premium == 1 ? 10 : 1" }` |
| 조건부 표시 | `display_switch: ".is_display in 2,3"` |
| unique 필터 | `rules: { unique: ".is_close == 0" }` |

---

## BNF 문법

JS `Parser` 클래스의 재귀 하강 구조에서 추출
(`ConditionParser.ts:598-1081`, 각 생성 규칙은 같은 이름의 `parse*` 메서드에 대응).

```bnf
expression          ::= ternary_expression

ternary_expression  ::= or_expression [ "?" ternary_expression ":" ternary_expression ]

or_expression       ::= and_expression { "||" and_expression }

and_expression      ::= not_expression { "&&" not_expression }

not_expression      ::= "!" not_expression
                      | comparison

comparison          ::= primary [ comparison_op comparison_value
                                | in_op value_list ]

comparison_op       ::= "==" | "!=" | ">" | ">=" | "<" | "<="

in_op               ::= "in" | "not in"

(* 비교 우변: 점이 따라오지 않는 단독 식별자는 문자열 리터럴로 취급
   — .country == US 는 .country == "US" 와 동일 *)
comparison_value    ::= IDENTIFIER          (* 뒤에 "." 없음 → 문자열 리터럴 *)
                      | primary

value_list          ::= "[" value_item { "," value_item } "]"
                      | value_item { "," value_item }

(* in 목록의 비인용 식별자도 문자열 리터럴 *)
value_item          ::= IDENTIFIER | NUMBER | STRING

primary             ::= "(" or_expression ")"
                      | path
                      | literal

literal             ::= STRING | NUMBER | BOOLEAN | NULL

path                ::= [ dot_prefix ] IDENTIFIER { "." path_segment }

dot_prefix          ::= "."                 (* 형제 참조, levelsUp = 0 *)
                      | ".." | "..." | ...  (* 점 n개 = levelsUp n-1 *)

path_segment        ::= IDENTIFIER          (* 필드명 *)
                      | NUMBER              (* 배열 인덱스 *)
                      | "*"                 (* 와일드카드 *)
```

ternary 분기(`trueValue`/`falseValue`)는 다시 `ternary_expression`이므로
중첩 ternary가 가능하다 (`ConditionParser.ts:644-681`,
Go `condition_parser.go` `parseTernaryExpression`).

---

## 토큰

JS `TokenType` enum (`packages/validator-js/src/types.ts:217-262`),
Go `TokenType` 상수(`validator/types.go:59-91`)와 1:1 대응.

| 분류 | 토큰 |
|------|------|
| 리터럴 | `STRING`(`'...'`/`"..."`, 이스케이프 `\n \t \r \\ \' \"`), `NUMBER`(음수·소수·지수 표기), `BOOLEAN`(`true`/`false`), `NULL`(`null`) |
| 경로 | `IDENTIFIER`(`[a-zA-Z_][a-zA-Z0-9_]*`), `DOT`(`.`), `DOT_DOT`(`..` 이상, 점 개수 보존), `ASTERISK`(`*`) |
| 비교 | `EQ`(`==`), `NE`(`!=`), `GT`(`>`), `GE`(`>=`), `LT`(`<`), `LE`(`<=`) |
| 논리 | `AND`(`&&`), `OR`(`\|\|`), `NOT`(`!`) |
| 포함 | `IN`(`in`), `NOT_IN`(`not in`) |
| 구분 | `LPAREN` `RPAREN` `LBRACKET` `RBRACKET` `COMMA` |
| ternary | `QUESTION`(`?`), `COLON`(`:`) |
| 특수 | `EOF`, `WHITESPACE`(버려짐), `INVALID` |

---

## 연산자 우선순위

낮음 → 높음 (파서 재귀 깊이 순):

| 우선순위 | 연산자 |
|----------|--------|
| 1 (최저) | `?:` (ternary) |
| 2 | `\|\|` |
| 3 | `&&` |
| 4 | `!` (단항) |
| 5 | `==` `!=` `>` `>=` `<` `<=` `in` `not in` |
| 6 (최고) | `()` 그룹, 경로, 리터럴 |

---

## 경로 해석 의미론

출처: `packages/validator-js/src/parser/PathResolver.ts` `resolvePathSegments`
(`PathResolver.ts:29-88`), Go `path_resolver.go` `resolveRelativePath`,
PHP `PathResolver::resolveRelativePath`.

### 절대 경로

점 prefix 없는 경로는 폼 데이터 루트에서 시작한다.

```
common.is_sale          → 루트의 common 그룹 안 is_sale
items.*.is_close        → items 배열 모든 항목의 is_close
items.0.code            → items 첫 항목의 code
```

### 상대 경로

점 prefix는 현재 필드 위치 기준 상대 참조다.

| 표기 | 의미 | levelsUp |
|------|------|----------|
| `.x` | **형제** 필드 (현재 필드와 같은 그룹) | 0 |
| `..x` | **부모 그룹의 형제** 필드 | 1 |
| `...x` | 조부모 그룹의 형제 필드 | 2 |

해석 절차 (`resolvePathSegments`):

1. 현재 경로에서 자기 필드명을 제거한다.
2. levelsUp 만큼 한 단계씩 올라간다. **이때 배열 인덱스(숫자 세그먼트)는
   레벨로 세지 않고 건너뛴다** (`PathResolver.ts:58-70`).
   예: 현재 경로가 `items.0.code`일 때 `..x` → `0`은 스킵되고
   `items`까지 벗겨져 → `x` (루트 레벨).
3. 남은 base 경로 뒤에 경로 세그먼트를 붙인다.

```
현재 필드: items.0.code
  .price   → items.0.price     (형제: 같은 배열 항목 안)
  ..x      → x                 (인덱스 0은 레벨 아님)

현재 필드: a.b.c
  .x       → a.b.x
  ..x      → a.x
  ...x     → x
```

### 그룹 노드 의미론

조건이 **group 노드 자신에** 붙은 경우(예: group의 `display_switch`),
그룹이 스코프 경계가 되어 `levelsUp`이 1 감소한다
(`effectiveLevelsUp = max(0, levelsUp - 1)` — `PathResolver.ts:44-49`).
결과적으로 **`.x`와 `..x` 모두 그룹의 형제**를 가리킨다
(픽스처: `display-switch-nested-001`).

JS는 `PathContext.groupNode`(`types.ts:392-403`), PHP는
`ConditionParser::evaluate(..., bool $fromGroup)`, Go는 동등 로직으로 구현한다.

---

## 와일드카드 평가 전략

경로에 `*`가 있으면 배열의 여러 값으로 확장된다. 평가 전략
(`WildcardStrategy` — `types.ts:408`, `PathResolver.ts:455-473`):

| 전략 | 의미 |
|------|------|
| `CURRENT` | 와일드카드를 **현재 검증 중인 항목의 인덱스로 치환** (검증기 기본값 — `Validator.ts:779`) |
| `ANY` | 하나라도 조건 충족이면 true |
| `ALL` | 모두 충족해야 true |
| `NONE` | 모두 불충족이어야 true |

`CURRENT` 전략에서 현재 경로에 대응 인덱스가 없으면(스코프 밖 와일드카드)
값 배열로 확장해 비교한다 (`PathResolver.ts:487-514`).

```yaml
# items 배열 항목 안의 필드 검증 시:
price:
  rules:
    required: "..is_option == 0 && .is_close == 0"
# .is_close 는 현재 항목의 형제 → CURRENT 인덱스로 해석
```

---

## Ternary 평가

`조건 ? 참값 : 거짓값` — 평가 결과는 boolean이 아니라 **선택된 분기의 값**이다.

두 평가 경로가 있다:

1. **AST 경로** (JS/Go): 파서가 `TernaryNode`를 생성하고
   (`types.ts:366-371`, Go `types.go:190-198`), 평가기가 분기 값을 반환한다
   (`PathResolver.ts` `evaluateExpressionValue`/`evaluateTernary`,
   Go `ConditionParser.EvaluateValue`).
2. **문자열 분할 경로** (규칙 파라미터): 규칙 파라미터의 ternary는 따옴표·괄호·
   중첩 ternary를 존중하는 top-level `?`/`:` 탐색으로 문자열을 쪼개 평가한다.
   분기 값이 조건식으로 파싱 불가능한 원문 문자열(예: 정규식)이어도 보존되기
   때문이다.
   - JS: `Validator.tryEvaluateTernary` + `findTernaryOperator`
     (`Validator.ts:49-126, 730-771`)
   - Go: `ConditionParser.EvaluateTernaryString` (`validator/ternary.go`)
   - PHP: `ConditionParser::evaluateTernary` (`ConditionParser.php:66`)

ternary 판별 가드: `?` 앞부분이 실제 조건식으로 파싱돼야만 ternary로
취급한다. `^https?://...` 같은 정규식의 `?`(수량자)는 ternary가 아니다
(JS `Validator.ts:744-755`, PHP `Validator.php` `isTernaryExpression`,
Go `ternary.go` `IsTernaryExpression`).

분기 값 파싱: 따옴표 문자열, `true`/`false`/`null`, 숫자, 그 외 원문 문자열
(`Validator.ts:101-126` `parseTernaryBranchValue`).

---

## 값 비교 의미론

출처: `PathResolver.ts` `compare`/`looseEquals`/`coerceNumber`.

- `==`/`!=`는 **느슨한 비교**: 문자열↔숫자 동치 허용 (`'1' == 1` → true).
- `>`/`>=`/`<`/`<=`는 숫자 강제 변환 후 비교. 변환은 의도적으로 관대하다
  (PHP `ConditionParser::toNumber` 패리티 — `PathResolver.ts:583-605`).
- `in`/`not in` 목록 비교도 느슨한 동치를 사용한다.
- 비교 우변과 `in` 목록의 **비인용 식별자는 문자열 리터럴**이다
  (`.country == US`, `.status in draft,review`).
- `in` 목록은 대괄호 유무 모두 허용: `.x in 2,3` ≡ `.x in [2, 3]`.

---

## 조건식 판별 휴리스틱

문자열 규칙 파라미터가 조건식인지 판별하는 함수
`isConditionExpression(value)` (`ConditionParser.ts:1251-1268`):

다음 중 하나면 조건식으로 간주한다.

1. `.`로 시작 (`.field ...`)
2. `식별자.` 패턴으로 시작 (`items.*.x ...`)
3. 공백으로 둘러싸인 연산자 포함 (`==`, `!=`, `>`, `>=`, `<`, `<=`, `&&`, `||`, `in`, `not in`)
4. ternary 패턴 (`?...:`)

PHP `Validator::looksLikeCondition`, Go `ternary.go` `IsConditionExpression`이 대응.

---

## 캐싱

파싱된 AST는 표현식 문자열을 키로 캐시된다.

- JS: `ConditionCache` (`packages/validator-js/src/parser/ConditionCache.ts`),
  `parseCondition()`이 기본 캐시 사용. `clearConditionCache()`,
  `getConditionCacheStats()`, `setConditionCache()`, `getConditionCache()` 제공.
- Go: `ConditionParser` 내부 캐시 (`condition_parser.go` `Parse`).

---

## 에러 처리

- JS는 파싱 실패 시 위치·기대 토큰·힌트를 담은 `ParseError`를 던진다
  (`ConditionParser.ts:50-212`). `tryParseCondition()`은 던지지 않고
  partial AST를 포함한 결과 객체를 반환한다.
- **검증기 레벨에서는 조건식 파싱/평가 실패 = 조건 false**다
  (필드 숨김·규칙 비활성 방향으로 처리, `Validator.ts:776-791`).
  JS는 `new Validator(spec, { debug: true })`일 때만 `console.warn`으로
  실패를 출력한다.

---

## 관련 문서

- [VALIDATION-RULES.md](./VALIDATION-RULES.md) — 조건부 규칙 파라미터
- [DISPLAY-CONDITIONS.md](./DISPLAY-CONDITIONS.md) — display_switch/display_target
