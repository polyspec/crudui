# 조건식 파서 (Condition Expression Parser) 기술 명세서

> 이 문서는 Limepie 폼 검증 시스템에서 사용되는 조건식 파서의 완전한 기술 명세를 제공합니다.

## 목차

1. [개요](#개요)
2. [BNF 문법 정의](#bnf-문법-정의)
3. [토큰 타입](#토큰-타입)
4. [연산자 우선순위](#연산자-우선순위)
5. [경로 해석 규칙](#경로-해석-규칙)
6. [AST 구조](#ast-구조)
7. [구현 의사코드](#구현-의사코드)
8. [테스트 케이스](#테스트-케이스)
9. [에러 처리](#에러-처리)

---

## 개요

조건식 파서는 YAML 스펙 내에서 정의된 조건 표현식을 파싱하여 런타임에 평가할 수 있는 추상 구문 트리(AST)로 변환합니다. 이 파서는 다음과 같은 사용 사례를 지원합니다:

### 주요 사용 사례

1. **조건부 필수 필드 (Conditional Required)**
```yaml
rules:
  required: ".payment_type == 'card'"
```

2. **조건부 표시 (Display Switch)**
```yaml
display_switch: ".is_display in 2,3"
```

3. **복합 조건**
```yaml
rules:
  required: ".user_type == 'business' && .employee_count >= 5"
```

### 지원 표현식 패턴

| 패턴 | 설명 | 예시 |
|------|------|------|
| 형제 필드 참조 | 같은 그룹 내 필드 | `.field_name == 'value'` |
| 부모 필드 참조 | 상위 그룹 필드 | `..parent_field == 1` |
| 조상 필드 참조 | N단계 상위 필드 | `...grandparent == 'x'` |
| 배열 와일드카드 | 배열 내 모든 항목 | `items.*.is_close == 0` |
| 절대 경로 | 루트부터 경로 지정 | `common.settings.enabled == true` |
| 논리 연산 | AND/OR 조합 | `.a == 1 && .b == 2` |
| IN 연산 | 값 목록 포함 | `.status in active,pending` |

---

## BNF 문법 정의

### 완전한 BNF 문법

```bnf
<expression>      ::= <or_expression>

<or_expression>   ::= <and_expression> ( '||' <and_expression> )*

<and_expression>  ::= <not_expression> ( '&&' <not_expression> )*

<not_expression>  ::= '!' <not_expression>
                    | <comparison>

<comparison>      ::= <primary> <comparison_op> <value>
                    | <primary> <in_op> <value_list>
                    | <primary>

<comparison_op>   ::= '==' | '!=' | '>' | '>=' | '<' | '<='

<in_op>           ::= 'in' | 'not' 'in'

<primary>         ::= <path>
                    | <literal>
                    | '(' <expression> ')'

<path>            ::= <relative_path>
                    | <absolute_path>

<relative_path>   ::= <dot_prefix> <identifier> ( '.' <path_segment> )*

<dot_prefix>      ::= '.'      (* 현재 그룹 - 형제 필드 *)
                    | '..'     (* 부모 그룹 *)
                    | '...'    (* 조부모 그룹 *)
                    | '....'   (* N단계 상위 그룹, ... 반복 가능 *)

<absolute_path>   ::= <identifier> ( '.' <path_segment> )*

<path_segment>    ::= <identifier>
                    | '*'      (* 배열 와일드카드 *)
                    | <integer>  (* 배열 인덱스 *)

<identifier>      ::= <letter> ( <letter> | <digit> | '_' )*

<value_list>      ::= <value> ( ',' <value> )*

<value>           ::= <literal>
                    | <path>

<literal>         ::= <string_literal>
                    | <number_literal>
                    | <boolean_literal>
                    | <null_literal>

<string_literal>  ::= "'" <string_content> "'"
                    | '"' <string_content> '"'

<number_literal>  ::= <integer>
                    | <float>

<integer>         ::= ['-'] <digit>+

<float>           ::= ['-'] <digit>+ '.' <digit>+

<boolean_literal> ::= 'true' | 'false'

<null_literal>    ::= 'null'

<letter>          ::= [a-zA-Z]

<digit>           ::= [0-9]

<string_content>  ::= (* 이스케이프된 따옴표를 제외한 모든 문자 *)
```

### EBNF 확장 표기

```ebnf
(* 메인 진입점 *)
expression = or_expression ;

(* 논리 연산 - 왼쪽 결합 *)
or_expression = and_expression , { "||" , and_expression } ;
and_expression = not_expression , { "&&" , not_expression } ;
not_expression = "!" , not_expression | comparison ;

(* 비교 연산 *)
comparison = primary , [ comparison_operator , value ]
           | primary , [ in_operator , value_list ] ;

comparison_operator = "==" | "!=" | ">" | ">=" | "<" | "<=" ;
in_operator = "in" | "not" , "in" ;

(* 기본 요소 *)
primary = path | literal | "(" , expression , ")" ;

(* 경로 표현식 *)
path = relative_path | absolute_path ;
relative_path = dot_prefix , identifier , { "." , path_segment } ;
absolute_path = identifier , { "." , path_segment } ;

dot_prefix = "." | ".." | "..." | "...." (* 무한 확장 가능 *) ;
path_segment = identifier | "*" | integer ;

(* 리터럴 *)
literal = string_literal | number_literal | boolean_literal | null_literal ;
string_literal = ( "'" , { string_char } , "'" )
               | ( '"' , { string_char } , '"' ) ;
number_literal = integer | float ;
integer = [ "-" ] , digit , { digit } ;
float = [ "-" ] , digit , { digit } , "." , digit , { digit } ;
boolean_literal = "true" | "false" ;
null_literal = "null" ;

(* 값 목록 (in 연산자용) *)
value_list = value , { "," , value } ;
value = literal | identifier (* 인용 없는 문자열로 처리 *) ;
```

---

## 토큰 타입

### 토큰 열거형 정의

```typescript
enum TokenType {
  // 리터럴
  STRING,           // 'value' 또는 "value"
  NUMBER,           // 123, 123.45, -123
  BOOLEAN,          // true, false
  NULL,             // null

  // 식별자 및 경로
  IDENTIFIER,       // field_name, userName 등
  DOT,              // .
  DOT_DOT,          // ..
  ASTERISK,         // *

  // 연산자 - 비교
  EQ,               // ==
  NE,               // !=
  GT,               // >
  GE,               // >=
  LT,               // <
  LE,               // <=

  // 연산자 - 논리
  AND,              // &&
  OR,               // ||
  NOT,              // !

  // 연산자 - 포함
  IN,               // in
  NOT_IN,           // not in

  // 구분자
  LPAREN,           // (
  RPAREN,           // )
  COMMA,            // ,

  // 특수
  EOF,              // 입력 끝
  WHITESPACE,       // 공백 (무시됨)
  INVALID           // 잘못된 토큰
}
```

### 토큰 구조체

```typescript
interface Token {
  type: TokenType;
  value: string;           // 원본 문자열 값
  literal: any;            // 파싱된 실제 값 (문자열, 숫자 등)
  position: {
    start: number;         // 시작 위치 (0-indexed)
    end: number;           // 끝 위치
    line: number;          // 줄 번호 (1-indexed)
    column: number;        // 열 번호 (1-indexed)
  };
}
```

### 토큰 패턴 정규식

```typescript
const TOKEN_PATTERNS: Record<TokenType, RegExp> = {
  // 문자열 리터럴 (작은따옴표 또는 큰따옴표)
  STRING: /^(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/,

  // 숫자 리터럴 (정수 및 부동소수점)
  NUMBER: /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/,

  // 불리언 리터럴
  BOOLEAN: /^(?:true|false)\b/,

  // null 리터럴
  NULL: /^null\b/,

  // 식별자 (필드명)
  IDENTIFIER: /^[a-zA-Z_][a-zA-Z0-9_]*/,

  // 다중 점 (.. 또는 ...)
  DOT_DOT: /^\.{2,}/,

  // 단일 점
  DOT: /^\./,

  // 별표 (와일드카드)
  ASTERISK: /^\*/,

  // 비교 연산자
  EQ: /^==/,
  NE: /^!=/,
  GE: /^>=/,
  LE: /^<=/,
  GT: /^>/,
  LT: /^</,

  // 논리 연산자
  AND: /^&&/,
  OR: /^\|\|/,
  NOT: /^!/,

  // in 연산자
  NOT_IN: /^not\s+in\b/,
  IN: /^in\b/,

  // 구분자
  LPAREN: /^\(/,
  RPAREN: /^\)/,
  COMMA: /^,/,

  // 공백 (무시됨)
  WHITESPACE: /^\s+/
};
```

### 토큰화 예시

**입력 표현식:**
```
.payment_type == 'card' && .amount >= 1000
```

**토큰 시퀀스:**
```
[
  { type: DOT, value: ".", position: { start: 0, end: 1 } },
  { type: IDENTIFIER, value: "payment_type", position: { start: 1, end: 13 } },
  { type: EQ, value: "==", position: { start: 14, end: 16 } },
  { type: STRING, value: "'card'", literal: "card", position: { start: 17, end: 23 } },
  { type: AND, value: "&&", position: { start: 24, end: 26 } },
  { type: DOT, value: ".", position: { start: 27, end: 28 } },
  { type: IDENTIFIER, value: "amount", position: { start: 28, end: 34 } },
  { type: GE, value: ">=", position: { start: 35, end: 37 } },
  { type: NUMBER, value: "1000", literal: 1000, position: { start: 38, end: 42 } },
  { type: EOF, value: "", position: { start: 42, end: 42 } }
]
```

---

## 연산자 우선순위

### 우선순위 테이블

| 우선순위 | 연산자 | 결합 방향 | 설명 |
|----------|--------|-----------|------|
| 1 (최고) | `()` | - | 괄호 (그룹화) |
| 2 | `!` | 오른쪽 | 논리 NOT |
| 3 | `>`, `>=`, `<`, `<=` | 왼쪽 | 크기 비교 |
| 4 | `==`, `!=` | 왼쪽 | 동등 비교 |
| 5 | `in`, `not in` | 왼쪽 | 포함 여부 |
| 6 | `&&` | 왼쪽 | 논리 AND |
| 7 (최저) | `\|\|` | 왼쪽 | 논리 OR |

### 우선순위 상수 정의

```typescript
const PRECEDENCE = {
  LOWEST: 0,
  OR: 1,          // ||
  AND: 2,         // &&
  IN: 3,          // in, not in
  EQUALS: 4,      // ==, !=
  COMPARE: 5,     // >, >=, <, <=
  NOT: 6,         // !
  PRIMARY: 7      // 리터럴, 경로, ()
} as const;

const TOKEN_PRECEDENCE: Record<TokenType, number> = {
  [TokenType.OR]: PRECEDENCE.OR,
  [TokenType.AND]: PRECEDENCE.AND,
  [TokenType.IN]: PRECEDENCE.IN,
  [TokenType.NOT_IN]: PRECEDENCE.IN,
  [TokenType.EQ]: PRECEDENCE.EQUALS,
  [TokenType.NE]: PRECEDENCE.EQUALS,
  [TokenType.GT]: PRECEDENCE.COMPARE,
  [TokenType.GE]: PRECEDENCE.COMPARE,
  [TokenType.LT]: PRECEDENCE.COMPARE,
  [TokenType.LE]: PRECEDENCE.COMPARE,
};
```

### 우선순위 적용 예시

**표현식:**
```
.a == 1 || .b == 2 && .c == 3
```

**파싱 결과 (AST):**
```
OR
├── EQ(.a, 1)
└── AND
    ├── EQ(.b, 2)
    └── EQ(.c, 3)
```

`&&`가 `||`보다 높은 우선순위를 가지므로, 위 표현식은 다음과 동일합니다:
```
.a == 1 || (.b == 2 && .c == 3)
```

**명시적 괄호 사용:**
```
(.a == 1 || .b == 2) && .c == 3
```

**파싱 결과 (AST):**
```
AND
├── OR
│   ├── EQ(.a, 1)
│   └── EQ(.b, 2)
└── EQ(.c, 3)
```

---

## 경로 해석 규칙

### 경로 타입 분류

| 접두사 | 타입 | 설명 | 예시 |
|--------|------|------|------|
| `.` | 상대 (형제) | 현재 그룹 내 필드 | `.field_name` |
| `..` | 상대 (부모) | 부모 그룹 필드 | `..parent_field` |
| `...` | 상대 (조부모) | 조부모 그룹 필드 | `...grandparent` |
| `....` | 상대 (N단계) | N-1 단계 상위 | `....ancestor` |
| (없음) | 절대 | 루트부터 경로 | `user.profile.name` |

### 상대 경로 해석 알고리즘

```typescript
interface PathContext {
  currentPath: string[];   // 현재 필드의 절대 경로
  formData: object;        // 전체 폼 데이터
}

function resolveRelativePath(
  relativePath: string,
  context: PathContext
): string[] {
  const parts = relativePath.split('.');
  const currentPath = [...context.currentPath];

  // 점 접두사 개수 세기
  let dotCount = 0;
  while (parts[0] === '' || parts[0] === undefined) {
    dotCount++;
    parts.shift();
  }

  // 부모로 이동 (dotCount - 1만큼)
  // . = 1개 점 = 형제 (부모로 0번 이동)
  // .. = 2개 점 = 부모 (부모로 1번 이동)
  // ... = 3개 점 = 조부모 (부모로 2번 이동)
  const levelsUp = dotCount - 1;

  // 현재 필드를 제외하고 부모 경로 계산
  const basePath = currentPath.slice(0, -(levelsUp + 1));

  // 나머지 경로 세그먼트 추가
  return [...basePath, ...parts];
}
```

### 상대 경로 해석 예시

**폼 구조:**
```yaml
properties:
  common:                    # 경로: ['common']
    type: group
    properties:
      is_option:             # 경로: ['common', 'is_option']
        type: checkbox
      settings:              # 경로: ['common', 'settings']
        type: group
        properties:
          max_count:         # 경로: ['common', 'settings', 'max_count']
            type: number
          items:             # 경로: ['common', 'settings', 'items']
            type: group
            multiple: true
            properties:
              name:          # 경로: ['common', 'settings', 'items', 0, 'name']
                type: text
              is_active:     # 경로: ['common', 'settings', 'items', 0, 'is_active']
                type: checkbox
              detail:        # 경로: ['common', 'settings', 'items', 0, 'detail']
                type: group
                properties:
                  value:     # 경로: ['common', 'settings', 'items', 0, 'detail', 'value']
                    type: text
```

**현재 필드: `common.settings.items.0.detail.value`**

| 표현식 | 상대 경로 해석 | 해석된 절대 경로 |
|--------|----------------|------------------|
| `.value` | 형제 필드 | `common.settings.items.0.detail.value` |
| `..is_active` | 부모 그룹의 필드 | `common.settings.items.0.is_active` |
| `...max_count` | 조부모 그룹의 필드 | `common.settings.max_count` |
| `....is_option` | 3단계 상위 그룹의 필드 | `common.is_option` |

### 배열 와일드카드 (*) 해석

배열 와일드카드 `*`는 배열의 모든 요소를 순회하며 조건을 평가합니다.

```typescript
interface WildcardContext {
  currentIndex: number;     // 현재 처리 중인 배열 인덱스
  arrayPath: string[];      // 배열까지의 경로
}

function resolveWildcardPath(
  path: string[],
  context: PathContext,
  wildcardContext?: WildcardContext
): any[] {
  const results: any[] = [];

  for (let i = 0; i < path.length; i++) {
    if (path[i] === '*') {
      // 와일드카드 발견: 배열 순회
      const arrayPath = path.slice(0, i);
      const arrayData = getValueByPath(context.formData, arrayPath);

      if (!Array.isArray(arrayData)) {
        return [];
      }

      // 각 배열 요소에 대해 나머지 경로 해석
      const remainingPath = path.slice(i + 1);
      for (let j = 0; j < arrayData.length; j++) {
        const elementPath = [...arrayPath, j, ...remainingPath];
        const value = resolveWildcardPath(
          elementPath,
          context,
          { currentIndex: j, arrayPath }
        );
        results.push(...value);
      }

      return results;
    }
  }

  // 와일드카드 없음: 단일 값 반환
  return [getValueByPath(context.formData, path)];
}
```

### 와일드카드 평가 전략

| 전략 | 설명 | 용도 |
|------|------|------|
| `ANY` | 하나라도 참이면 참 | 기본값, 일반 조건 |
| `ALL` | 모두 참이어야 참 | 전체 검증 |
| `NONE` | 모두 거짓이어야 참 | 배제 조건 |
| `CURRENT` | 현재 인덱스만 검사 | 같은 배열 항목 내 조건 |

**CURRENT 전략 상세:**

배열 내부 필드에서 같은 배열 항목의 다른 필드를 참조할 때:

```yaml
items:
  type: group
  multiple: true
  properties:
    is_close:
      type: checkbox
    close_reason:
      type: textarea
      rules:
        # 이 표현식에서 *는 현재 항목의 is_close를 참조
        required: "items.*.is_close == 1"
```

현재 필드가 `items.2.close_reason`일 때:
- `items.*.is_close`는 `items.2.is_close`로 해석됨 (CURRENT 전략)

```typescript
function evaluateWithWildcard(
  expression: ASTNode,
  context: PathContext,
  strategy: 'ANY' | 'ALL' | 'NONE' | 'CURRENT' = 'CURRENT'
): boolean {
  const values = resolveWildcardPath(expression.path, context);

  switch (strategy) {
    case 'ANY':
      return values.some(v => evaluateComparison(expression, v));
    case 'ALL':
      return values.every(v => evaluateComparison(expression, v));
    case 'NONE':
      return values.every(v => !evaluateComparison(expression, v));
    case 'CURRENT':
      // 현재 인덱스에 해당하는 값만 평가
      const currentIndex = extractCurrentIndex(context.currentPath);
      const currentValue = values[currentIndex];
      return evaluateComparison(expression, currentValue);
  }
}
```

---

## AST 구조

### AST 노드 타입 정의

```typescript
// 기본 노드 인터페이스
interface ASTNode {
  type: string;
  position: {
    start: number;
    end: number;
  };
}

// 이진 연산 노드 (&&, ||, ==, != 등)
interface BinaryNode extends ASTNode {
  type: 'Binary';
  operator: '&&' | '||' | '==' | '!=' | '>' | '>=' | '<' | '<=';
  left: ASTNode;
  right: ASTNode;
}

// 단항 연산 노드 (!)
interface UnaryNode extends ASTNode {
  type: 'Unary';
  operator: '!';
  operand: ASTNode;
}

// IN 연산 노드
interface InNode extends ASTNode {
  type: 'In';
  negated: boolean;      // not in이면 true
  value: ASTNode;        // 검사할 값 (보통 PathNode)
  list: ASTNode[];       // 값 목록
}

// 경로 참조 노드
interface PathNode extends ASTNode {
  type: 'Path';
  relative: boolean;          // 상대 경로 여부
  levelsUp: number;           // 부모로 올라가는 단계 수 (상대 경로일 때)
  segments: PathSegment[];    // 경로 세그먼트
}

// 경로 세그먼트
type PathSegment =
  | { type: 'identifier'; value: string }      // 필드명
  | { type: 'wildcard' }                        // *
  | { type: 'index'; value: number };           // 배열 인덱스

// 리터럴 노드
interface LiteralNode extends ASTNode {
  type: 'Literal';
  valueType: 'string' | 'number' | 'boolean' | 'null';
  value: string | number | boolean | null;
}

// 그룹 노드 (괄호)
interface GroupNode extends ASTNode {
  type: 'Group';
  expression: ASTNode;
}
```

### AST 생성 예시

**표현식:**
```
.payment_type == 'card' && .amount >= 1000
```

**AST:**
```typescript
{
  type: 'Binary',
  operator: '&&',
  position: { start: 0, end: 42 },
  left: {
    type: 'Binary',
    operator: '==',
    position: { start: 0, end: 23 },
    left: {
      type: 'Path',
      relative: true,
      levelsUp: 0,
      segments: [
        { type: 'identifier', value: 'payment_type' }
      ],
      position: { start: 0, end: 13 }
    },
    right: {
      type: 'Literal',
      valueType: 'string',
      value: 'card',
      position: { start: 17, end: 23 }
    }
  },
  right: {
    type: 'Binary',
    operator: '>=',
    position: { start: 27, end: 42 },
    left: {
      type: 'Path',
      relative: true,
      levelsUp: 0,
      segments: [
        { type: 'identifier', value: 'amount' }
      ],
      position: { start: 27, end: 34 }
    },
    right: {
      type: 'Literal',
      valueType: 'number',
      value: 1000,
      position: { start: 38, end: 42 }
    }
  }
}
```

**표현식:**
```
items.*.is_close == 1
```

**AST:**
```typescript
{
  type: 'Binary',
  operator: '==',
  position: { start: 0, end: 21 },
  left: {
    type: 'Path',
    relative: false,
    levelsUp: 0,
    segments: [
      { type: 'identifier', value: 'items' },
      { type: 'wildcard' },
      { type: 'identifier', value: 'is_close' }
    ],
    position: { start: 0, end: 16 }
  },
  right: {
    type: 'Literal',
    valueType: 'number',
    value: 1,
    position: { start: 20, end: 21 }
  }
}
```

**표현식:**
```
.status in active,pending,draft
```

**AST:**
```typescript
{
  type: 'In',
  negated: false,
  position: { start: 0, end: 31 },
  value: {
    type: 'Path',
    relative: true,
    levelsUp: 0,
    segments: [
      { type: 'identifier', value: 'status' }
    ],
    position: { start: 0, end: 7 }
  },
  list: [
    {
      type: 'Literal',
      valueType: 'string',
      value: 'active',
      position: { start: 11, end: 17 }
    },
    {
      type: 'Literal',
      valueType: 'string',
      value: 'pending',
      position: { start: 18, end: 25 }
    },
    {
      type: 'Literal',
      valueType: 'string',
      value: 'draft',
      position: { start: 26, end: 31 }
    }
  ]
}
```

---

## 구현 의사코드

### 1. Lexer (토크나이저) 구현

```typescript
class Lexer {
  private input: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;

  constructor(input: string) {
    this.input = input;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      const token = this.nextToken();
      if (token.type !== TokenType.WHITESPACE) {
        tokens.push(token);
      }
    }

    tokens.push(this.makeToken(TokenType.EOF, ''));
    return tokens;
  }

  private nextToken(): Token {
    const start = this.position;
    const startColumn = this.column;

    // 공백 건너뛰기
    if (this.matchPattern(TOKEN_PATTERNS.WHITESPACE)) {
      return this.makeToken(TokenType.WHITESPACE,
        this.input.slice(start, this.position));
    }

    // 연산자 (긴 것부터 매칭)
    if (this.matchPattern(TOKEN_PATTERNS.NOT_IN)) {
      return this.makeToken(TokenType.NOT_IN, 'not in');
    }
    if (this.matchPattern(TOKEN_PATTERNS.AND)) {
      return this.makeToken(TokenType.AND, '&&');
    }
    if (this.matchPattern(TOKEN_PATTERNS.OR)) {
      return this.makeToken(TokenType.OR, '||');
    }
    if (this.matchPattern(TOKEN_PATTERNS.EQ)) {
      return this.makeToken(TokenType.EQ, '==');
    }
    if (this.matchPattern(TOKEN_PATTERNS.NE)) {
      return this.makeToken(TokenType.NE, '!=');
    }
    if (this.matchPattern(TOKEN_PATTERNS.GE)) {
      return this.makeToken(TokenType.GE, '>=');
    }
    if (this.matchPattern(TOKEN_PATTERNS.LE)) {
      return this.makeToken(TokenType.LE, '<=');
    }
    if (this.matchPattern(TOKEN_PATTERNS.GT)) {
      return this.makeToken(TokenType.GT, '>');
    }
    if (this.matchPattern(TOKEN_PATTERNS.LT)) {
      return this.makeToken(TokenType.LT, '<');
    }
    if (this.matchPattern(TOKEN_PATTERNS.NOT)) {
      return this.makeToken(TokenType.NOT, '!');
    }

    // 다중 점 (.. 또는 ...)
    if (this.matchPattern(TOKEN_PATTERNS.DOT_DOT)) {
      return this.makeToken(TokenType.DOT_DOT,
        this.input.slice(start, this.position));
    }

    // 단일 점
    if (this.matchPattern(TOKEN_PATTERNS.DOT)) {
      return this.makeToken(TokenType.DOT, '.');
    }

    // 별표
    if (this.matchPattern(TOKEN_PATTERNS.ASTERISK)) {
      return this.makeToken(TokenType.ASTERISK, '*');
    }

    // 구분자
    if (this.matchPattern(TOKEN_PATTERNS.LPAREN)) {
      return this.makeToken(TokenType.LPAREN, '(');
    }
    if (this.matchPattern(TOKEN_PATTERNS.RPAREN)) {
      return this.makeToken(TokenType.RPAREN, ')');
    }
    if (this.matchPattern(TOKEN_PATTERNS.COMMA)) {
      return this.makeToken(TokenType.COMMA, ',');
    }

    // 문자열 리터럴
    if (this.matchPattern(TOKEN_PATTERNS.STRING)) {
      const value = this.input.slice(start, this.position);
      const literal = value.slice(1, -1); // 따옴표 제거
      return this.makeToken(TokenType.STRING, value, literal);
    }

    // 불리언
    if (this.matchPattern(TOKEN_PATTERNS.BOOLEAN)) {
      const value = this.input.slice(start, this.position);
      return this.makeToken(TokenType.BOOLEAN, value, value === 'true');
    }

    // null
    if (this.matchPattern(TOKEN_PATTERNS.NULL)) {
      return this.makeToken(TokenType.NULL, 'null', null);
    }

    // in 키워드
    if (this.matchPattern(TOKEN_PATTERNS.IN)) {
      return this.makeToken(TokenType.IN, 'in');
    }

    // 숫자
    if (this.matchPattern(TOKEN_PATTERNS.NUMBER)) {
      const value = this.input.slice(start, this.position);
      return this.makeToken(TokenType.NUMBER, value, parseFloat(value));
    }

    // 식별자
    if (this.matchPattern(TOKEN_PATTERNS.IDENTIFIER)) {
      return this.makeToken(TokenType.IDENTIFIER,
        this.input.slice(start, this.position));
    }

    // 알 수 없는 문자
    const char = this.input[this.position];
    this.position++;
    this.column++;
    return this.makeToken(TokenType.INVALID, char);
  }

  private matchPattern(pattern: RegExp): boolean {
    const remaining = this.input.slice(this.position);
    const match = remaining.match(pattern);

    if (match) {
      this.position += match[0].length;
      this.column += match[0].length;
      return true;
    }

    return false;
  }

  private makeToken(type: TokenType, value: string, literal?: any): Token {
    return {
      type,
      value,
      literal: literal !== undefined ? literal : value,
      position: {
        start: this.position - value.length,
        end: this.position,
        line: this.line,
        column: this.column - value.length
      }
    };
  }

  private isAtEnd(): boolean {
    return this.position >= this.input.length;
  }
}
```

### 2. Parser (파서) 구현

```typescript
class Parser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ASTNode {
    const expression = this.parseOrExpression();

    if (!this.isAtEnd()) {
      throw new ParseError(
        `예상치 못한 토큰: ${this.peek().value}`,
        this.peek().position
      );
    }

    return expression;
  }

  // or_expression = and_expression { "||" and_expression }
  private parseOrExpression(): ASTNode {
    let left = this.parseAndExpression();

    while (this.match(TokenType.OR)) {
      const operator = this.previous();
      const right = this.parseAndExpression();
      left = {
        type: 'Binary',
        operator: '||',
        left,
        right,
        position: {
          start: (left as any).position.start,
          end: (right as any).position.end
        }
      } as BinaryNode;
    }

    return left;
  }

  // and_expression = not_expression { "&&" not_expression }
  private parseAndExpression(): ASTNode {
    let left = this.parseNotExpression();

    while (this.match(TokenType.AND)) {
      const operator = this.previous();
      const right = this.parseNotExpression();
      left = {
        type: 'Binary',
        operator: '&&',
        left,
        right,
        position: {
          start: (left as any).position.start,
          end: (right as any).position.end
        }
      } as BinaryNode;
    }

    return left;
  }

  // not_expression = "!" not_expression | comparison
  private parseNotExpression(): ASTNode {
    if (this.match(TokenType.NOT)) {
      const operator = this.previous();
      const operand = this.parseNotExpression();
      return {
        type: 'Unary',
        operator: '!',
        operand,
        position: {
          start: operator.position.start,
          end: (operand as any).position.end
        }
      } as UnaryNode;
    }

    return this.parseComparison();
  }

  // comparison = primary [ comparison_op value | in_op value_list ]
  private parseComparison(): ASTNode {
    const left = this.parsePrimary();

    // IN 연산자 처리
    if (this.match(TokenType.IN, TokenType.NOT_IN)) {
      const negated = this.previous().type === TokenType.NOT_IN;
      const list = this.parseValueList();
      return {
        type: 'In',
        negated,
        value: left,
        list,
        position: {
          start: (left as any).position.start,
          end: list[list.length - 1].position.end
        }
      } as InNode;
    }

    // 비교 연산자 처리
    if (this.match(
      TokenType.EQ, TokenType.NE,
      TokenType.GT, TokenType.GE,
      TokenType.LT, TokenType.LE
    )) {
      const operator = this.previous();
      const right = this.parsePrimary();
      return {
        type: 'Binary',
        operator: this.operatorFromToken(operator.type),
        left,
        right,
        position: {
          start: (left as any).position.start,
          end: (right as any).position.end
        }
      } as BinaryNode;
    }

    return left;
  }

  // value_list = value { "," value }
  private parseValueList(): ASTNode[] {
    const values: ASTNode[] = [];

    do {
      values.push(this.parseValue());
    } while (this.match(TokenType.COMMA));

    return values;
  }

  // value = literal | identifier (인용 없는 문자열로 처리)
  private parseValue(): ASTNode {
    if (this.match(TokenType.STRING, TokenType.NUMBER,
                   TokenType.BOOLEAN, TokenType.NULL)) {
      return this.parseLiteral(this.previous());
    }

    // 인용 없는 식별자는 문자열로 처리
    if (this.match(TokenType.IDENTIFIER)) {
      const token = this.previous();
      return {
        type: 'Literal',
        valueType: 'string',
        value: token.value,
        position: token.position
      } as LiteralNode;
    }

    // 숫자 처리 (음수 포함)
    if (this.check(TokenType.NUMBER)) {
      const token = this.advance();
      return this.parseLiteral(token);
    }

    throw new ParseError(
      `값이 필요합니다`,
      this.peek().position
    );
  }

  // primary = path | literal | "(" expression ")"
  private parsePrimary(): ASTNode {
    // 그룹화된 표현식
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseOrExpression();
      this.consume(TokenType.RPAREN, "')' 가 필요합니다");
      return {
        type: 'Group',
        expression: expr,
        position: expr.position
      } as GroupNode;
    }

    // 경로 (상대 또는 절대)
    if (this.check(TokenType.DOT) || this.check(TokenType.DOT_DOT) ||
        this.check(TokenType.IDENTIFIER)) {
      return this.parsePath();
    }

    // 리터럴
    if (this.match(TokenType.STRING, TokenType.NUMBER,
                   TokenType.BOOLEAN, TokenType.NULL)) {
      return this.parseLiteral(this.previous());
    }

    throw new ParseError(
      `표현식이 필요합니다`,
      this.peek().position
    );
  }

  // path = relative_path | absolute_path
  private parsePath(): PathNode {
    const startPosition = this.peek().position.start;
    let relative = false;
    let levelsUp = 0;

    // 상대 경로 접두사 처리
    if (this.match(TokenType.DOT_DOT)) {
      relative = true;
      const dots = this.previous().value;
      levelsUp = dots.length - 1; // .. = 1, ... = 2, etc.
    } else if (this.match(TokenType.DOT)) {
      relative = true;
      levelsUp = 0;
    }

    // 경로 세그먼트 파싱
    const segments: PathSegment[] = [];

    // 첫 번째 세그먼트 (필수)
    segments.push(this.parsePathSegment());

    // 추가 세그먼트
    while (this.match(TokenType.DOT)) {
      segments.push(this.parsePathSegment());
    }

    return {
      type: 'Path',
      relative,
      levelsUp,
      segments,
      position: {
        start: startPosition,
        end: this.previous().position.end
      }
    };
  }

  // path_segment = identifier | "*" | integer
  private parsePathSegment(): PathSegment {
    if (this.match(TokenType.ASTERISK)) {
      return { type: 'wildcard' };
    }

    if (this.match(TokenType.NUMBER)) {
      const value = this.previous().literal as number;
      if (!Number.isInteger(value) || value < 0) {
        throw new ParseError(
          `배열 인덱스는 음이 아닌 정수여야 합니다`,
          this.previous().position
        );
      }
      return { type: 'index', value };
    }

    if (this.match(TokenType.IDENTIFIER)) {
      return { type: 'identifier', value: this.previous().value };
    }

    throw new ParseError(
      `경로 세그먼트가 필요합니다`,
      this.peek().position
    );
  }

  private parseLiteral(token: Token): LiteralNode {
    let valueType: 'string' | 'number' | 'boolean' | 'null';

    switch (token.type) {
      case TokenType.STRING:
        valueType = 'string';
        break;
      case TokenType.NUMBER:
        valueType = 'number';
        break;
      case TokenType.BOOLEAN:
        valueType = 'boolean';
        break;
      case TokenType.NULL:
        valueType = 'null';
        break;
      default:
        throw new ParseError(`알 수 없는 리터럴 타입`, token.position);
    }

    return {
      type: 'Literal',
      valueType,
      value: token.literal,
      position: token.position
    };
  }

  private operatorFromToken(type: TokenType): string {
    const map: Record<TokenType, string> = {
      [TokenType.EQ]: '==',
      [TokenType.NE]: '!=',
      [TokenType.GT]: '>',
      [TokenType.GE]: '>=',
      [TokenType.LT]: '<',
      [TokenType.LE]: '<='
    };
    return map[type] || '';
  }

  // 유틸리티 메서드
  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new ParseError(message, this.peek().position);
  }
}
```

### 3. Evaluator (평가기) 구현

```typescript
class Evaluator {
  private formData: any;
  private currentPath: string[];

  constructor(formData: any, currentPath: string[]) {
    this.formData = formData;
    this.currentPath = currentPath;
  }

  evaluate(node: ASTNode): any {
    switch (node.type) {
      case 'Binary':
        return this.evaluateBinary(node as BinaryNode);
      case 'Unary':
        return this.evaluateUnary(node as UnaryNode);
      case 'In':
        return this.evaluateIn(node as InNode);
      case 'Path':
        return this.evaluatePath(node as PathNode);
      case 'Literal':
        return (node as LiteralNode).value;
      case 'Group':
        return this.evaluate((node as GroupNode).expression);
      default:
        throw new EvaluationError(`알 수 없는 노드 타입: ${node.type}`);
    }
  }

  private evaluateBinary(node: BinaryNode): any {
    const left = this.evaluate(node.left);

    // 단락 평가 (short-circuit evaluation)
    if (node.operator === '&&') {
      if (!this.isTruthy(left)) return false;
      return this.isTruthy(this.evaluate(node.right));
    }

    if (node.operator === '||') {
      if (this.isTruthy(left)) return true;
      return this.isTruthy(this.evaluate(node.right));
    }

    const right = this.evaluate(node.right);

    switch (node.operator) {
      case '==':
        return this.isEqual(left, right);
      case '!=':
        return !this.isEqual(left, right);
      case '>':
        return this.compare(left, right) > 0;
      case '>=':
        return this.compare(left, right) >= 0;
      case '<':
        return this.compare(left, right) < 0;
      case '<=':
        return this.compare(left, right) <= 0;
      default:
        throw new EvaluationError(`알 수 없는 연산자: ${node.operator}`);
    }
  }

  private evaluateUnary(node: UnaryNode): any {
    const value = this.evaluate(node.operand);

    switch (node.operator) {
      case '!':
        return !this.isTruthy(value);
      default:
        throw new EvaluationError(`알 수 없는 단항 연산자: ${node.operator}`);
    }
  }

  private evaluateIn(node: InNode): boolean {
    const value = this.evaluate(node.value);
    const listValues = node.list.map(item => this.evaluate(item));

    const found = listValues.some(listValue => this.isEqual(value, listValue));

    return node.negated ? !found : found;
  }

  private evaluatePath(node: PathNode): any {
    const absolutePath = this.resolvePath(node);
    return this.getValueByPath(absolutePath);
  }

  private resolvePath(node: PathNode): string[] {
    if (!node.relative) {
      // 절대 경로: 세그먼트를 직접 사용
      return node.segments.map(seg => {
        if (seg.type === 'identifier') return seg.value;
        if (seg.type === 'index') return seg.value.toString();
        if (seg.type === 'wildcard') return '*';
        return '';
      });
    }

    // 상대 경로 계산
    const basePath = this.currentPath.slice(0, -(node.levelsUp + 1));

    const segmentPath = node.segments.map(seg => {
      if (seg.type === 'identifier') return seg.value;
      if (seg.type === 'index') return seg.value.toString();
      if (seg.type === 'wildcard') return '*';
      return '';
    });

    return [...basePath, ...segmentPath];
  }

  private getValueByPath(path: string[]): any {
    // 와일드카드 처리
    const wildcardIndex = path.indexOf('*');

    if (wildcardIndex !== -1) {
      return this.getValueWithWildcard(path, wildcardIndex);
    }

    // 일반 경로 탐색
    let current = this.formData;

    for (const segment of path) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (typeof current === 'object') {
        current = current[segment];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private getValueWithWildcard(path: string[], wildcardIndex: number): any {
    // 현재 경로에서 배열 인덱스 추출
    const arrayPath = path.slice(0, wildcardIndex);
    const remainingPath = path.slice(wildcardIndex + 1);

    // 현재 필드가 같은 배열 내에 있는지 확인
    const currentArrayPath = this.currentPath.slice(0, wildcardIndex);

    if (this.pathEquals(arrayPath, currentArrayPath)) {
      // 같은 배열 내: 현재 인덱스 사용
      const currentIndex = this.currentPath[wildcardIndex];
      const resolvedPath = [...arrayPath, currentIndex, ...remainingPath];
      return this.getValueByPath(resolvedPath);
    }

    // 다른 배열: 모든 항목 수집 (ANY 전략)
    const arrayData = this.getValueByPath(arrayPath);

    if (!Array.isArray(arrayData)) {
      return undefined;
    }

    // 첫 번째 일치하는 값 반환 (ANY 전략)
    for (let i = 0; i < arrayData.length; i++) {
      const resolvedPath = [...arrayPath, i.toString(), ...remainingPath];
      const value = this.getValueByPath(resolvedPath);
      if (value !== undefined) {
        return value;
      }
    }

    return undefined;
  }

  private pathEquals(path1: string[], path2: string[]): boolean {
    if (path1.length !== path2.length) return false;
    return path1.every((seg, i) => seg === path2[i]);
  }

  // 느슨한 동등 비교 (타입 변환 포함)
  private isEqual(a: any, b: any): boolean {
    // null/undefined 처리
    if (a === null || a === undefined) {
      return b === null || b === undefined;
    }
    if (b === null || b === undefined) {
      return false;
    }

    // 숫자 비교 (문자열 숫자 허용)
    if (typeof a === 'number' || typeof b === 'number') {
      const numA = Number(a);
      const numB = Number(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA === numB;
      }
    }

    // 불리언 비교 (문자열 불리언 허용)
    if (typeof a === 'boolean' || typeof b === 'boolean') {
      return this.toBoolean(a) === this.toBoolean(b);
    }

    // 문자열 비교
    return String(a) === String(b);
  }

  private compare(a: any, b: any): number {
    const numA = Number(a);
    const numB = Number(b);

    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }

    return String(a).localeCompare(String(b));
  }

  private isTruthy(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      return value !== '' && value !== '0' && value.toLowerCase() !== 'false';
    }
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  private toBoolean(value: any): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      return lower === 'true' || lower === '1' || lower === 'yes';
    }
    if (typeof value === 'number') return value !== 0;
    return Boolean(value);
  }
}
```

### 4. 통합 API

```typescript
class ConditionParser {
  private cache: Map<string, ASTNode> = new Map();

  /**
   * 조건식을 파싱합니다.
   */
  parse(expression: string): ASTNode {
    // 캐시 확인
    if (this.cache.has(expression)) {
      return this.cache.get(expression)!;
    }

    // 토큰화
    const lexer = new Lexer(expression);
    const tokens = lexer.tokenize();

    // 파싱
    const parser = new Parser(tokens);
    const ast = parser.parse();

    // 캐시 저장
    this.cache.set(expression, ast);

    return ast;
  }

  /**
   * 조건식을 평가합니다.
   */
  evaluate(
    expression: string | ASTNode,
    formData: any,
    currentPath: string[]
  ): boolean {
    const ast = typeof expression === 'string'
      ? this.parse(expression)
      : expression;

    const evaluator = new Evaluator(formData, currentPath);
    const result = evaluator.evaluate(ast);

    return Boolean(result);
  }

  /**
   * 조건식의 유효성을 검사합니다.
   */
  validate(expression: string): ValidationResult {
    try {
      this.parse(expression);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof ParseError) {
        return {
          valid: false,
          errors: [{
            message: error.message,
            position: error.position
          }]
        };
      }
      throw error;
    }
  }

  /**
   * 캐시를 초기화합니다.
   */
  clearCache(): void {
    this.cache.clear();
  }
}

interface ValidationResult {
  valid: boolean;
  errors: Array<{
    message: string;
    position: { start: number; end: number };
  }>;
}
```

---

## 테스트 케이스

### 1. 토크나이저 테스트

```typescript
describe('Lexer', () => {
  describe('기본 토큰화', () => {
    test('단순 형제 필드 비교', () => {
      const lexer = new Lexer(".field == 'value'");
      const tokens = lexer.tokenize();

      expect(tokens).toEqual([
        { type: TokenType.DOT, value: '.', ... },
        { type: TokenType.IDENTIFIER, value: 'field', ... },
        { type: TokenType.EQ, value: '==', ... },
        { type: TokenType.STRING, value: "'value'", literal: 'value', ... },
        { type: TokenType.EOF, ... }
      ]);
    });

    test('부모 필드 참조', () => {
      const lexer = new Lexer("..parent_field == 1");
      const tokens = lexer.tokenize();

      expect(tokens[0]).toMatchObject({
        type: TokenType.DOT_DOT,
        value: '..'
      });
    });

    test('조부모 필드 참조', () => {
      const lexer = new Lexer("...grandparent == 2");
      const tokens = lexer.tokenize();

      expect(tokens[0]).toMatchObject({
        type: TokenType.DOT_DOT,
        value: '...'
      });
    });

    test('와일드카드 경로', () => {
      const lexer = new Lexer("items.*.is_close == 0");
      const tokens = lexer.tokenize();

      expect(tokens).toContainEqual(
        expect.objectContaining({ type: TokenType.ASTERISK })
      );
    });

    test('복합 AND 표현식', () => {
      const lexer = new Lexer(".a == 1 && .b == 2");
      const tokens = lexer.tokenize();

      expect(tokens).toContainEqual(
        expect.objectContaining({ type: TokenType.AND, value: '&&' })
      );
    });

    test('in 연산자', () => {
      const lexer = new Lexer(".status in active,pending");
      const tokens = lexer.tokenize();

      expect(tokens).toContainEqual(
        expect.objectContaining({ type: TokenType.IN, value: 'in' })
      );
    });

    test('not in 연산자', () => {
      const lexer = new Lexer(".status not in deleted,archived");
      const tokens = lexer.tokenize();

      expect(tokens).toContainEqual(
        expect.objectContaining({ type: TokenType.NOT_IN, value: 'not in' })
      );
    });

    test('숫자 in 연산자', () => {
      const lexer = new Lexer(".is_display in 2,3");
      const tokens = lexer.tokenize();

      expect(tokens.filter(t => t.type === TokenType.NUMBER)).toHaveLength(2);
    });
  });

  describe('리터럴 토큰화', () => {
    test('작은따옴표 문자열', () => {
      const lexer = new Lexer("'hello world'");
      const tokens = lexer.tokenize();

      expect(tokens[0]).toMatchObject({
        type: TokenType.STRING,
        value: "'hello world'",
        literal: 'hello world'
      });
    });

    test('큰따옴표 문자열', () => {
      const lexer = new Lexer('"hello world"');
      const tokens = lexer.tokenize();

      expect(tokens[0]).toMatchObject({
        type: TokenType.STRING,
        literal: 'hello world'
      });
    });

    test('정수', () => {
      const lexer = new Lexer('12345');
      const tokens = lexer.tokenize();

      expect(tokens[0]).toMatchObject({
        type: TokenType.NUMBER,
        literal: 12345
      });
    });

    test('음수', () => {
      const lexer = new Lexer('-42');
      const tokens = lexer.tokenize();

      expect(tokens[0]).toMatchObject({
        type: TokenType.NUMBER,
        literal: -42
      });
    });

    test('부동소수점', () => {
      const lexer = new Lexer('3.14159');
      const tokens = lexer.tokenize();

      expect(tokens[0]).toMatchObject({
        type: TokenType.NUMBER,
        literal: 3.14159
      });
    });

    test('불리언 true', () => {
      const lexer = new Lexer('true');
      const tokens = lexer.tokenize();

      expect(tokens[0]).toMatchObject({
        type: TokenType.BOOLEAN,
        literal: true
      });
    });

    test('불리언 false', () => {
      const lexer = new Lexer('false');
      const tokens = lexer.tokenize();

      expect(tokens[0]).toMatchObject({
        type: TokenType.BOOLEAN,
        literal: false
      });
    });

    test('null', () => {
      const lexer = new Lexer('null');
      const tokens = lexer.tokenize();

      expect(tokens[0]).toMatchObject({
        type: TokenType.NULL,
        literal: null
      });
    });
  });
});
```

### 2. 파서 테스트

```typescript
describe('Parser', () => {
  const parser = new ConditionParser();

  describe('단순 비교 표현식', () => {
    test('형제 필드 문자열 비교', () => {
      const ast = parser.parse(".field == 'value'");

      expect(ast).toMatchObject({
        type: 'Binary',
        operator: '==',
        left: {
          type: 'Path',
          relative: true,
          levelsUp: 0,
          segments: [{ type: 'identifier', value: 'field' }]
        },
        right: {
          type: 'Literal',
          valueType: 'string',
          value: 'value'
        }
      });
    });

    test('부모 필드 숫자 비교', () => {
      const ast = parser.parse("..is_display == 2");

      expect(ast).toMatchObject({
        type: 'Binary',
        operator: '==',
        left: {
          type: 'Path',
          relative: true,
          levelsUp: 1,
          segments: [{ type: 'identifier', value: 'is_display' }]
        },
        right: {
          type: 'Literal',
          valueType: 'number',
          value: 2
        }
      });
    });

    test('조부모 필드 참조', () => {
      const ast = parser.parse("...root_field == 'test'");

      expect(ast.left).toMatchObject({
        type: 'Path',
        relative: true,
        levelsUp: 2
      });
    });

    test('4단계 상위 필드 참조', () => {
      const ast = parser.parse("....ancestor == 1");

      expect(ast.left).toMatchObject({
        type: 'Path',
        relative: true,
        levelsUp: 3
      });
    });
  });

  describe('와일드카드 경로', () => {
    test('배열 와일드카드', () => {
      const ast = parser.parse("items.*.is_close == 0");

      expect(ast).toMatchObject({
        type: 'Binary',
        operator: '==',
        left: {
          type: 'Path',
          relative: false,
          segments: [
            { type: 'identifier', value: 'items' },
            { type: 'wildcard' },
            { type: 'identifier', value: 'is_close' }
          ]
        }
      });
    });

    test('중첩 와일드카드', () => {
      const ast = parser.parse("orders.*.items.*.quantity > 0");

      expect(ast.left.segments).toEqual([
        { type: 'identifier', value: 'orders' },
        { type: 'wildcard' },
        { type: 'identifier', value: 'items' },
        { type: 'wildcard' },
        { type: 'identifier', value: 'quantity' }
      ]);
    });
  });

  describe('논리 연산자', () => {
    test('AND 연산', () => {
      const ast = parser.parse(".a == 1 && .b == 2");

      expect(ast).toMatchObject({
        type: 'Binary',
        operator: '&&',
        left: { type: 'Binary', operator: '==' },
        right: { type: 'Binary', operator: '==' }
      });
    });

    test('OR 연산', () => {
      const ast = parser.parse(".a == 1 || .b == 2");

      expect(ast).toMatchObject({
        type: 'Binary',
        operator: '||'
      });
    });

    test('복합 논리 연산 (우선순위)', () => {
      const ast = parser.parse(".a == 1 || .b == 2 && .c == 3");

      // && 가 || 보다 높은 우선순위
      expect(ast).toMatchObject({
        type: 'Binary',
        operator: '||',
        left: { type: 'Binary', operator: '==' },
        right: {
          type: 'Binary',
          operator: '&&'
        }
      });
    });

    test('괄호로 우선순위 변경', () => {
      const ast = parser.parse("(.a == 1 || .b == 2) && .c == 3");

      expect(ast).toMatchObject({
        type: 'Binary',
        operator: '&&',
        left: {
          type: 'Group',
          expression: {
            type: 'Binary',
            operator: '||'
          }
        }
      });
    });

    test('NOT 연산', () => {
      const ast = parser.parse("!.is_active");

      expect(ast).toMatchObject({
        type: 'Unary',
        operator: '!',
        operand: {
          type: 'Path',
          segments: [{ type: 'identifier', value: 'is_active' }]
        }
      });
    });

    test('중첩 NOT 연산', () => {
      const ast = parser.parse("!!.is_active");

      expect(ast).toMatchObject({
        type: 'Unary',
        operator: '!',
        operand: {
          type: 'Unary',
          operator: '!'
        }
      });
    });
  });

  describe('IN 연산자', () => {
    test('문자열 목록 in', () => {
      const ast = parser.parse(".status in active,pending,draft");

      expect(ast).toMatchObject({
        type: 'In',
        negated: false,
        value: {
          type: 'Path',
          segments: [{ type: 'identifier', value: 'status' }]
        },
        list: [
          { type: 'Literal', value: 'active' },
          { type: 'Literal', value: 'pending' },
          { type: 'Literal', value: 'draft' }
        ]
      });
    });

    test('숫자 목록 in', () => {
      const ast = parser.parse(".is_display in 2,3");

      expect(ast).toMatchObject({
        type: 'In',
        negated: false,
        list: [
          { type: 'Literal', valueType: 'number', value: 2 },
          { type: 'Literal', valueType: 'number', value: 3 }
        ]
      });
    });

    test('not in 연산', () => {
      const ast = parser.parse(".status not in deleted,archived");

      expect(ast).toMatchObject({
        type: 'In',
        negated: true,
        list: [
          { type: 'Literal', value: 'deleted' },
          { type: 'Literal', value: 'archived' }
        ]
      });
    });

    test('따옴표 문자열 in', () => {
      const ast = parser.parse(".category in 'electronics','clothing'");

      expect(ast.list).toEqual([
        expect.objectContaining({ value: 'electronics' }),
        expect.objectContaining({ value: 'clothing' })
      ]);
    });
  });

  describe('비교 연산자', () => {
    test.each([
      ['==', '.a == 1'],
      ['!=', '.a != 1'],
      ['>', '.a > 1'],
      ['>=', '.a >= 1'],
      ['<', '.a < 1'],
      ['<=', '.a <= 1']
    ])('%s 연산자', (operator, expression) => {
      const ast = parser.parse(expression);

      expect(ast).toMatchObject({
        type: 'Binary',
        operator
      });
    });
  });

  describe('복합 표현식', () => {
    test('실제 사용 예: 조건부 필수', () => {
      const ast = parser.parse(
        ".user_type == 'business' && .employee_count >= 5"
      );

      expect(ast).toMatchObject({
        type: 'Binary',
        operator: '&&',
        left: {
          type: 'Binary',
          operator: '==',
          left: {
            type: 'Path',
            segments: [{ type: 'identifier', value: 'user_type' }]
          },
          right: {
            type: 'Literal',
            value: 'business'
          }
        },
        right: {
          type: 'Binary',
          operator: '>=',
          left: {
            type: 'Path',
            segments: [{ type: 'identifier', value: 'employee_count' }]
          },
          right: {
            type: 'Literal',
            value: 5
          }
        }
      });
    });

    test('실제 사용 예: 다중 조건 OR', () => {
      const ast = parser.parse(
        ".membership == 'vip' || .membership == 'premium' || .is_partner == '1'"
      );

      expect(ast.type).toBe('Binary');
      expect(ast.operator).toBe('||');
    });

    test('실제 사용 예: 복합 in 조건', () => {
      const ast = parser.parse(
        ".is_display in 2,3 && .has_schedule == 1"
      );

      expect(ast).toMatchObject({
        type: 'Binary',
        operator: '&&',
        left: { type: 'In' },
        right: { type: 'Binary' }
      });
    });
  });
});
```

### 3. 평가기 테스트

```typescript
describe('Evaluator', () => {
  const parser = new ConditionParser();

  describe('단순 비교 평가', () => {
    const formData = {
      payment_type: 'card',
      amount: 1500,
      is_active: true,
      status: 'pending'
    };

    test('문자열 동등 비교 - 참', () => {
      const result = parser.evaluate(
        ".payment_type == 'card'",
        formData,
        ['payment_type']
      );
      expect(result).toBe(true);
    });

    test('문자열 동등 비교 - 거짓', () => {
      const result = parser.evaluate(
        ".payment_type == 'bank'",
        formData,
        ['payment_type']
      );
      expect(result).toBe(false);
    });

    test('숫자 비교 >=', () => {
      const result = parser.evaluate(
        ".amount >= 1000",
        formData,
        ['amount']
      );
      expect(result).toBe(true);
    });

    test('숫자 비교 <', () => {
      const result = parser.evaluate(
        ".amount < 1000",
        formData,
        ['amount']
      );
      expect(result).toBe(false);
    });

    test('불리언 비교', () => {
      const result = parser.evaluate(
        ".is_active == true",
        formData,
        ['is_active']
      );
      expect(result).toBe(true);
    });
  });

  describe('상대 경로 평가', () => {
    const formData = {
      common: {
        is_option: '1',
        settings: {
          max_count: 10,
          items: [
            { name: 'item1', is_close: '0' },
            { name: 'item2', is_close: '1' }
          ]
        }
      }
    };

    test('형제 필드 참조', () => {
      const result = parser.evaluate(
        ".name == 'item1'",
        formData,
        ['common', 'settings', 'items', '0', 'name']
      );
      expect(result).toBe(true);
    });

    test('부모 필드 참조', () => {
      const result = parser.evaluate(
        "..max_count == 10",
        formData,
        ['common', 'settings', 'items', '0', 'name']
      );
      expect(result).toBe(true);
    });

    test('조부모 필드 참조', () => {
      const result = parser.evaluate(
        "...is_option == '1'",
        formData,
        ['common', 'settings', 'items', '0', 'name']
      );
      expect(result).toBe(true);
    });
  });

  describe('와일드카드 평가', () => {
    const formData = {
      items: [
        { name: 'item1', is_close: '0', quantity: 5 },
        { name: 'item2', is_close: '1', quantity: 0 },
        { name: 'item3', is_close: '0', quantity: 3 }
      ]
    };

    test('같은 배열 항목 내 필드 참조 (CURRENT 전략)', () => {
      // items[1].close_reason 필드에서 items.*.is_close 평가
      const result = parser.evaluate(
        "items.*.is_close == '1'",
        formData,
        ['items', '1', 'close_reason']
      );
      expect(result).toBe(true);  // items[1].is_close == '1'
    });

    test('다른 인덱스에서 평가', () => {
      // items[0] 에서는 is_close가 '0'
      const result = parser.evaluate(
        "items.*.is_close == '1'",
        formData,
        ['items', '0', 'close_reason']
      );
      expect(result).toBe(false);  // items[0].is_close == '0'
    });
  });

  describe('논리 연산 평가', () => {
    const formData = {
      a: 1,
      b: 2,
      c: 3,
      is_active: true,
      is_verified: false
    };

    test('AND - 모두 참', () => {
      const result = parser.evaluate(
        ".a == 1 && .b == 2",
        formData,
        ['a']
      );
      expect(result).toBe(true);
    });

    test('AND - 하나 거짓', () => {
      const result = parser.evaluate(
        ".a == 1 && .b == 3",
        formData,
        ['a']
      );
      expect(result).toBe(false);
    });

    test('OR - 하나 참', () => {
      const result = parser.evaluate(
        ".a == 1 || .b == 3",
        formData,
        ['a']
      );
      expect(result).toBe(true);
    });

    test('OR - 모두 거짓', () => {
      const result = parser.evaluate(
        ".a == 2 || .b == 3",
        formData,
        ['a']
      );
      expect(result).toBe(false);
    });

    test('NOT', () => {
      const result = parser.evaluate(
        "!.is_verified",
        formData,
        ['is_verified']
      );
      expect(result).toBe(true);
    });

    test('복합 논리 연산', () => {
      const result = parser.evaluate(
        ".a == 1 && (.b == 2 || .c == 4)",
        formData,
        ['a']
      );
      expect(result).toBe(true);
    });

    test('단락 평가 (AND)', () => {
      // 첫 조건이 거짓이면 두 번째는 평가하지 않음
      const result = parser.evaluate(
        ".a == 2 && .nonexistent == 1",
        formData,
        ['a']
      );
      expect(result).toBe(false);
    });

    test('단락 평가 (OR)', () => {
      // 첫 조건이 참이면 두 번째는 평가하지 않음
      const result = parser.evaluate(
        ".a == 1 || .nonexistent == 1",
        formData,
        ['a']
      );
      expect(result).toBe(true);
    });
  });

  describe('IN 연산 평가', () => {
    const formData = {
      status: 'pending',
      is_display: 2,
      category: 'electronics'
    };

    test('문자열 in - 포함', () => {
      const result = parser.evaluate(
        ".status in active,pending,draft",
        formData,
        ['status']
      );
      expect(result).toBe(true);
    });

    test('문자열 in - 미포함', () => {
      const result = parser.evaluate(
        ".status in active,completed",
        formData,
        ['status']
      );
      expect(result).toBe(false);
    });

    test('숫자 in - 포함', () => {
      const result = parser.evaluate(
        ".is_display in 2,3",
        formData,
        ['is_display']
      );
      expect(result).toBe(true);
    });

    test('숫자 in - 미포함', () => {
      const result = parser.evaluate(
        ".is_display in 1,4,5",
        formData,
        ['is_display']
      );
      expect(result).toBe(false);
    });

    test('not in - 미포함', () => {
      const result = parser.evaluate(
        ".status not in deleted,archived",
        formData,
        ['status']
      );
      expect(result).toBe(true);
    });

    test('not in - 포함', () => {
      const result = parser.evaluate(
        ".status not in pending,active",
        formData,
        ['status']
      );
      expect(result).toBe(false);
    });
  });

  describe('타입 변환 및 느슨한 비교', () => {
    const formData = {
      string_number: '42',
      number: 42,
      string_bool: '1',
      bool: true,
      empty: '',
      zero: 0,
      null_value: null
    };

    test('문자열 숫자와 숫자 비교', () => {
      const result = parser.evaluate(
        ".string_number == 42",
        formData,
        ['string_number']
      );
      expect(result).toBe(true);
    });

    test('숫자와 문자열 숫자 비교', () => {
      const result = parser.evaluate(
        ".number == '42'",
        formData,
        ['number']
      );
      expect(result).toBe(true);
    });

    test("'1'과 true 비교", () => {
      const result = parser.evaluate(
        ".string_bool == true",
        formData,
        ['string_bool']
      );
      expect(result).toBe(true);
    });

    test('빈 문자열 truthy 평가', () => {
      const result = parser.evaluate(
        ".empty && .number == 42",
        formData,
        ['empty']
      );
      expect(result).toBe(false);  // 빈 문자열은 falsy
    });

    test('0 truthy 평가', () => {
      const result = parser.evaluate(
        ".zero || .number == 42",
        formData,
        ['zero']
      );
      expect(result).toBe(true);  // 0은 falsy지만 OR의 두 번째가 참
    });

    test('null 비교', () => {
      const result = parser.evaluate(
        ".null_value == null",
        formData,
        ['null_value']
      );
      expect(result).toBe(true);
    });

    test('undefined 필드', () => {
      const result = parser.evaluate(
        ".nonexistent == null",
        formData,
        ['nonexistent']
      );
      expect(result).toBe(true);  // undefined는 null과 동등
    });
  });

  describe('실제 사용 시나리오', () => {
    test('조건부 필수 필드 - 기업 사용자', () => {
      const formData = {
        user_type: 'business',
        employee_count: 10,
        business_license: ''  // 비어있음
      };

      // 기업이면서 직원 5명 이상일 때 필수
      const isRequired = parser.evaluate(
        ".user_type == 'business' && .employee_count >= 5",
        formData,
        ['business_license']
      );

      expect(isRequired).toBe(true);
    });

    test('조건부 필수 필드 - 개인 사용자', () => {
      const formData = {
        user_type: 'personal',
        employee_count: 0,
        business_license: ''
      };

      const isRequired = parser.evaluate(
        ".user_type == 'business' && .employee_count >= 5",
        formData,
        ['business_license']
      );

      expect(isRequired).toBe(false);
    });

    test('디스플레이 스위치 - 결제 유형별 필드', () => {
      const formData = {
        payment_type: 'card',
        card_number: '',
        bank_account: ''
      };

      const showCardField = parser.evaluate(
        ".payment_type == 'card'",
        formData,
        ['card_number']
      );

      const showBankField = parser.evaluate(
        ".payment_type == 'bank'",
        formData,
        ['bank_account']
      );

      expect(showCardField).toBe(true);
      expect(showBankField).toBe(false);
    });

    test('배열 항목 조건부 필수', () => {
      const formData = {
        items: [
          { is_close: '0', close_reason: '' },
          { is_close: '1', close_reason: '' },  // close_reason 필요
          { is_close: '0', close_reason: '' }
        ]
      };

      // items[1].close_reason 검증
      const isRequired = parser.evaluate(
        "items.*.is_close == '1'",
        formData,
        ['items', '1', 'close_reason']
      );

      expect(isRequired).toBe(true);

      // items[0].close_reason 검증
      const isNotRequired = parser.evaluate(
        "items.*.is_close == '1'",
        formData,
        ['items', '0', 'close_reason']
      );

      expect(isNotRequired).toBe(false);
    });

    test('복합 멤버십 조건', () => {
      const formData = {
        membership: 'premium',
        purchase_count: 15
      };

      const showDiscount = parser.evaluate(
        ".membership in premium,vip && .purchase_count >= 10",
        formData,
        ['special_discount']
      );

      expect(showDiscount).toBe(true);
    });
  });
});
```

### 4. 통합 테스트

```typescript
describe('ConditionParser Integration', () => {
  const parser = new ConditionParser();

  describe('ProductNft/Spec/Create.yml 시나리오', () => {
    const formData = {
      common: {
        is_option: '1',
        is_quantity: 1,
        option: [
          { name: '색상', values: ['빨강', '파랑'] },
          { name: '사이즈', values: ['S', 'M', 'L'] }
        ]
      },
      items: [
        {
          is_display: 2,
          display_sdate: '',
          display_edate: '',
          is_close: '0',
          close_reason: ''
        },
        {
          is_display: 1,
          display_sdate: '2024-01-01',
          display_edate: '2024-12-31',
          is_close: '1',
          close_reason: '재고 소진'
        }
      ]
    };

    test('옵션 활성화 조건', () => {
      const result = parser.evaluate(
        "common.is_option == 1 && common.is_quantity > 0",
        formData,
        ['common', 'option', '0', 'name']
      );

      expect(result).toBe(true);
    });

    test('디스플레이 날짜 필수 조건', () => {
      // items[0]: is_display가 2이므로 날짜 필수
      const result0 = parser.evaluate(
        ".is_display in 2,3",
        formData,
        ['items', '0', 'display_sdate']
      );
      expect(result0).toBe(true);

      // items[1]: is_display가 1이므로 날짜 불필요
      const result1 = parser.evaluate(
        ".is_display in 2,3",
        formData,
        ['items', '1', 'display_sdate']
      );
      expect(result1).toBe(false);
    });

    test('종료 사유 필수 조건', () => {
      // items[0]: is_close가 0이므로 불필요
      const result0 = parser.evaluate(
        "items.*.is_close == 1",
        formData,
        ['items', '0', 'close_reason']
      );
      expect(result0).toBe(false);

      // items[1]: is_close가 1이므로 필수
      const result1 = parser.evaluate(
        "items.*.is_close == 1",
        formData,
        ['items', '1', 'close_reason']
      );
      expect(result1).toBe(true);
    });

    test('부모 참조 조건', () => {
      // option 그룹 내에서 common.is_option 참조
      const result = parser.evaluate(
        "..is_option == '1'",
        formData,
        ['common', 'option', '0', 'name']
      );

      expect(result).toBe(true);
    });
  });

  describe('에러 핸들링', () => {
    test('잘못된 구문 - 연산자 누락', () => {
      expect(() => parser.parse(".field 'value'")).toThrow();
    });

    test('잘못된 구문 - 닫는 괄호 누락', () => {
      expect(() => parser.parse("(.a == 1")).toThrow();
    });

    test('잘못된 구문 - 빈 표현식', () => {
      expect(() => parser.parse("")).toThrow();
    });

    test('잘못된 구문 - 불완전한 비교', () => {
      expect(() => parser.parse(".field ==")).toThrow();
    });

    test('유효성 검사 API', () => {
      const valid = parser.validate(".field == 'value'");
      expect(valid.valid).toBe(true);

      const invalid = parser.validate(".field ==");
      expect(invalid.valid).toBe(false);
      expect(invalid.errors.length).toBeGreaterThan(0);
    });
  });

  describe('캐싱', () => {
    test('동일 표현식 캐시 재사용', () => {
      const expression = ".field == 'value'";

      const ast1 = parser.parse(expression);
      const ast2 = parser.parse(expression);

      expect(ast1).toBe(ast2);  // 동일 객체 참조
    });

    test('캐시 초기화', () => {
      const expression = ".field == 'value'";

      const ast1 = parser.parse(expression);
      parser.clearCache();
      const ast2 = parser.parse(expression);

      expect(ast1).not.toBe(ast2);  // 다른 객체
      expect(ast1).toEqual(ast2);   // 동일한 구조
    });
  });

  describe('성능 테스트', () => {
    test('복잡한 표현식 파싱 성능', () => {
      const complexExpression = `
        .a == 1 && .b == 2 && .c == 3 &&
        (.d in 1,2,3 || .e in 4,5,6) &&
        !.f && ..parent == 'value' &&
        items.*.active == true
      `.replace(/\s+/g, ' ').trim();

      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        parser.parse(complexExpression);
      }

      const elapsed = performance.now() - start;

      // 1000회 파싱이 100ms 이내여야 함
      expect(elapsed).toBeLessThan(100);
    });

    test('평가 성능', () => {
      const formData = {
        a: 1, b: 2, c: 3, d: 2, e: 5, f: false,
        parent: 'value',
        items: Array(100).fill({ active: true })
      };

      const expression = ".a == 1 && .b == 2 && .d in 1,2,3";
      const ast = parser.parse(expression);

      const start = performance.now();

      for (let i = 0; i < 10000; i++) {
        parser.evaluate(ast, formData, ['a']);
      }

      const elapsed = performance.now() - start;

      // 10000회 평가가 100ms 이내여야 함
      expect(elapsed).toBeLessThan(100);
    });
  });
});
```

---

## 에러 처리

### 에러 클래스 정의

```typescript
class ConditionParserError extends Error {
  constructor(message: string, public position?: TokenPosition) {
    super(message);
    this.name = 'ConditionParserError';
  }
}

class LexerError extends ConditionParserError {
  constructor(message: string, position?: TokenPosition) {
    super(message, position);
    this.name = 'LexerError';
  }
}

class ParseError extends ConditionParserError {
  constructor(message: string, position?: TokenPosition) {
    super(message, position);
    this.name = 'ParseError';
  }
}

class EvaluationError extends ConditionParserError {
  constructor(message: string, position?: TokenPosition) {
    super(message, position);
    this.name = 'EvaluationError';
  }
}

interface TokenPosition {
  start: number;
  end: number;
  line?: number;
  column?: number;
}
```

### 에러 메시지 카탈로그

| 에러 코드 | 메시지 | 원인 |
|-----------|--------|------|
| `E001` | `예상치 못한 문자: {char}` | 토큰화 중 알 수 없는 문자 발견 |
| `E002` | `문자열이 닫히지 않았습니다` | 따옴표로 시작했지만 닫히지 않음 |
| `E003` | `예상치 못한 토큰: {token}` | 문법에 맞지 않는 토큰 위치 |
| `E004` | `'{char}' 가 필요합니다` | 예상된 토큰이 없음 (예: 닫는 괄호) |
| `E005` | `표현식이 필요합니다` | 비어있는 표현식 |
| `E006` | `값이 필요합니다` | 비교 연산자 뒤에 값이 없음 |
| `E007` | `경로 세그먼트가 필요합니다` | 점(.) 뒤에 식별자가 없음 |
| `E008` | `배열 인덱스는 음이 아닌 정수여야 합니다` | 잘못된 배열 인덱스 |
| `E009` | `알 수 없는 연산자: {op}` | 지원하지 않는 연산자 |
| `E010` | `경로를 해석할 수 없습니다: {path}` | 잘못된 경로 참조 |

### 에러 복구 전략

```typescript
class ErrorRecoveryParser extends Parser {
  private errors: ParseError[] = [];

  parse(): ASTNode | null {
    try {
      return super.parse();
    } catch (error) {
      if (error instanceof ParseError) {
        this.errors.push(error);
        return this.attemptRecovery();
      }
      throw error;
    }
  }

  private attemptRecovery(): ASTNode | null {
    // 다음 유효한 토큰까지 건너뛰기
    this.synchronize();

    if (this.isAtEnd()) {
      return null;
    }

    // 다시 파싱 시도
    try {
      return this.parseOrExpression();
    } catch {
      return null;
    }
  }

  private synchronize(): void {
    this.advance();

    while (!this.isAtEnd()) {
      // 논리 연산자는 새로운 표현식의 시작점이 될 수 있음
      if (this.check(TokenType.AND) || this.check(TokenType.OR)) {
        return;
      }

      this.advance();
    }
  }

  getErrors(): ParseError[] {
    return this.errors;
  }
}
```

---

## 부록: 언어별 구현 가이드

### JavaScript/TypeScript

위의 의사코드는 TypeScript로 작성되어 있으므로 그대로 사용할 수 있습니다.

### PHP

```php
<?php

namespace FormGenerator\Condition;

class ConditionParser
{
    private array $cache = [];

    public function parse(string $expression): ASTNode
    {
        if (isset($this->cache[$expression])) {
            return $this->cache[$expression];
        }

        $lexer = new Lexer($expression);
        $tokens = $lexer->tokenize();

        $parser = new Parser($tokens);
        $ast = $parser->parse();

        $this->cache[$expression] = $ast;

        return $ast;
    }

    public function evaluate(
        string|ASTNode $expression,
        array $formData,
        array $currentPath
    ): bool {
        $ast = is_string($expression)
            ? $this->parse($expression)
            : $expression;

        $evaluator = new Evaluator($formData, $currentPath);
        return (bool) $evaluator->evaluate($ast);
    }
}
```

### Go

```go
package condition

type ConditionParser struct {
    cache map[string]*ASTNode
    mu    sync.RWMutex
}

func NewConditionParser() *ConditionParser {
    return &ConditionParser{
        cache: make(map[string]*ASTNode),
    }
}

func (p *ConditionParser) Parse(expression string) (*ASTNode, error) {
    p.mu.RLock()
    if ast, ok := p.cache[expression]; ok {
        p.mu.RUnlock()
        return ast, nil
    }
    p.mu.RUnlock()

    lexer := NewLexer(expression)
    tokens, err := lexer.Tokenize()
    if err != nil {
        return nil, err
    }

    parser := NewParser(tokens)
    ast, err := parser.Parse()
    if err != nil {
        return nil, err
    }

    p.mu.Lock()
    p.cache[expression] = ast
    p.mu.Unlock()

    return ast, nil
}

func (p *ConditionParser) Evaluate(
    expression interface{},
    formData map[string]interface{},
    currentPath []string,
) (bool, error) {
    var ast *ASTNode
    var err error

    switch e := expression.(type) {
    case string:
        ast, err = p.Parse(e)
        if err != nil {
            return false, err
        }
    case *ASTNode:
        ast = e
    default:
        return false, fmt.Errorf("invalid expression type")
    }

    evaluator := NewEvaluator(formData, currentPath)
    result := evaluator.Evaluate(ast)

    return result.(bool), nil
}
```

---

## 참고 자료

- [YAML 스펙 형식 명세서](./SPEC.md)
- [검증 규칙 상세 가이드](./VALIDATION-RULES.md)
- [프로젝트 개요](./README.md)

---

*이 문서는 Limepie 폼 검증 시스템의 조건식 파서에 대한 공식 기술 명세서입니다.*
*버전: 1.0.0*
*최종 수정: 2026-01-04*
