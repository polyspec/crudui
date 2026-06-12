# 조건부 표시 (Conditional Display)

`display_switch` / `display_target`의 기준(canonical) 의미론.
두 속성 모두 **숨김 대상 필드 자신에** 선언하며, 3개 언어 검증기
(JS/PHP/Go)가 동일하게 평가한다. 숨겨진 필드는 **검증이 스킵된다**.

검증기 구현 출처:

- JS: `packages/validator-js/src/legacy/Validator.ts` `shouldValidateField()` (L395-448)
- PHP: `packages/validator-php/src/Legacy/Validator.php` `shouldValidateField()` (L441-473)
- Go: `packages/validator-go/validator/legacy/validator.go` `shouldDisplay()` (L361-407)

> **구버전 문서 교정**: 이 문서의 과거 버전은 `display_switch`를
> "소스 필드에 값→타깃 필드 목록 맵"(`display_switch: { value1: [target1, ...] }`)
> 으로 기술했다. **그 형식은 어떤 코드에도 구현된 적이 없다.** 사용하지 마라.
> 기준 형식은 아래와 같이 대상 필드 자신에 붙는 조건식 문자열 또는 boolean이다.

## 목차

1. [display_switch](#display_switch)
2. [display_target](#display_target)
3. [그룹과 중첩](#그룹과-중첩)
4. [표시 상태와 검증](#표시-상태와-검증)
5. [React 렌더러의 element.all_of](#react-렌더러의-elementall_of)

---

## display_switch

**대상 필드 자신에** 조건식 문자열 또는 boolean을 선언한다.

```yaml
card_number:
  type: text
  label: 카드 번호
  display_switch: ".payment_type == 'card'"   # 조건 충족 시에만 표시·검증
  rules:
    required: true

debug_field:
  type: text
  display_switch: false    # 항상 숨김 + 검증 스킵

always_on:
  type: text
  display_switch: true     # 항상 표시 (선언 안 한 것과 동일)
```

### 값별 의미

| 값 | 동작 |
|----|------|
| (없음) | 항상 표시 |
| `true` | 항상 표시 |
| `false` | **항상 숨김 — 검증 스킵** |
| 조건식 문자열 | 평가 결과 true면 표시, false면 숨김+검증 스킵 |
| `""` (빈 문자열) | 표시 (평가하지 않음 — JS `Validator.ts:408`, Go `validator.go:370`) |

- 조건식 문법·상대 경로(`.x` 형제, `..x` 부모 형제)는
  [CONDITION-PARSER.md](./CONDITION-PARSER.md) 참조.
- 조건식 파싱/평가 실패는 **false(숨김)** 로 처리된다
  (JS `Validator.ts:776-791`, Go `validator.go:371-374`).

### 복합 조건 예

```yaml
advanced_settings:
  type: group
  display_switch: ".user_type == 'admin' || .user_type == 'manager'"
  properties: { ... }

display_date:
  type: datetime
  display_switch: ".is_display in 2,3"
```

---

## display_target

**대상 필드 자신에** 다른 필드의 참조(문자열)를 선언한다.
**타깃 필드의 값이 "비어 있으면" 숨김 + 검증 스킵**이다.

```yaml
has_options:
  type: checkbox
  label: 옵션 사용

options:
  type: group
  display_target: has_options   # has_options 값이 비어있지 않을 때만 표시·검증
  multiple: true
  properties: { ... }
```

### 빈 값 판정 (3개 언어 공통)

| 타깃 값 | 판정 |
|---------|------|
| `null` / 없음 | 숨김 |
| `false` | 숨김 |
| `''` (빈 문자열) | 숨김 |
| `[]` (빈 배열) | 숨김 |
| `{}` (빈 객체) | 숨김 |
| **`0` (숫자)** | **표시 (존재로 취급)** |
| **`'0'` (문자열)** | **표시 (존재로 취급)** |
| 그 외 값 | 표시 |

출처: JS `Validator.ts:423-445`, PHP `Validator.php:464-469`
(`empty($targetValue) && $targetValue !== '0' && $targetValue !== 0`),
Go `validator.go:382-404`.

### 타깃 참조 해석

`display_target` 문자열은 조건식이 아니라 **필드 참조**다
(JS `resolveFieldReference` — `PathResolver.ts:607-673`,
PHP `PathResolver::resolve`, Go `resolveFieldReference`):

- `.field` / `..field` — 상대 참조 (조건식과 동일한 의미론)
- `a.b.c` — 절대 경로 (와일드카드 지원)
- `field` (점 없음) — 형제 우선 조회, 없으면 루트에서 조회

---

## 그룹과 중첩

- `display_switch`가 **group 노드에** 붙으면 그룹이 상대 경로의 스코프 경계가
  된다: `.x`와 `..x` 모두 그룹의 형제를 가리킨다
  ([CONDITION-PARSER.md — 그룹 노드 의미론](./CONDITION-PARSER.md#그룹-노드-의미론),
  JS `Validator.ts:400-419`의 `groupNode: isGroup`, PHP `Validator.php:456`의
  `$fromGroup`).
- 그룹이 숨겨지면 그 **자식 필드 전체가 검증에서 제외**된다 — 검증기는 숨겨진
  그룹의 properties로 내려가지 않는다 (JS `Validator.ts:262-265` `continue`,
  PHP `Validator.php:211-213`, Go `validator.go:116-119`).

---

## 표시 상태와 검증

**핵심 원칙: 숨겨진 필드는 검증하지 않는다.**

| 필드 상태 | required 등 모든 규칙 |
|-----------|----------------------|
| 표시됨 | 적용 |
| `display_switch`로 숨김 | 스킵 |
| `display_target` 타깃이 빈 값 | 스킵 |
| 숨겨진 그룹의 자식 | 스킵 |

이 스킵은 클라이언트(React)와 서버(JS/PHP/Go 검증기) 모두에서 동일하게
동작한다 — 같은 스펙을 양쪽에서 평가하므로 서버 측에 별도의 조건부 필수
로직을 중복 구현할 필요가 없다.

```yaml
# 예: payment_type 이 'card' 가 아니면 card_number 의 required 는 발화하지 않는다
payment_type:
  type: select
  items: { card: 카드, bank: 계좌이체 }

card_number:
  type: text
  display_switch: ".payment_type == 'card'"
  rules:
    required: true
```

검증 케이스: `tests/cases/display-switch.json` (21 테스트).

---

## React 렌더러의 element.all_of

`element.all_of` / `element.any_of`는 **generator-react 전용 렌더링 기능**이다.
검증기(JS/PHP/Go)는 이 속성을 평가하지 않는다 — 표시 스타일/클래스에만
영향을 주고 검증 스킵과는 무관하다.

구현: `packages/generator-react/src/legacy/hooks/useConditional.ts`
(`evaluateAllOf`), `packages/generator-react/src/legacy/components/FormField.tsx`.
타입: `packages/generator-react/src/legacy/types.ts` (`AllOfCondition`, `ElementConfig`).

```yaml
special_content:
  type: group
  element:
    all_of:
      conditions:
        is_close: 0
        is_display: [2, 3]    # 배열 = OR
      inline: "display: block;"
      not:
        inline: "display: none;"
```

- `conditions`의 모든 항목을 AND 평가, 항목 값이 배열이면 그 안에서 OR.
- 충족 시 `inline`/`class` 적용, 불충족 시 `not.inline`/`not.class` 적용.

---

## 관련 문서

- [CONDITION-PARSER.md](./CONDITION-PARSER.md) — 조건식 문법·경로 해석
- [SPEC.md](./SPEC.md) — 필드 속성 전체
- [VALIDATION-RULES.md](./VALIDATION-RULES.md) — 검증 규칙
