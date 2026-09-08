# 검증 규칙 명세서

crudui 검증기에 **실제 등록된** 규칙의 목록과 동작 명세.
규칙 목록은 4개 언어 레지스트리에서 추출했으며 네 구현이 완전히 일치한다.

레지스트리 출처:

- JS: `packages/validator-ts/src/rules/index.ts` (`builtInRules`)
- PHP: `packages/validator-php/src/Legacy/Validator.php` (`registerDefaultRules()`)
- Go: `packages/validator-go/validator/legacy/rules.go` (`DefaultRules()`)
- Rust: `packages/validator-rust/src/legacy/rules.rs` (`default_rules()`)

## 목차

- [등록 규칙 목록](#등록-규칙-목록)
- [기본 에러 메시지](#기본-에러-메시지)
- [공통 평가 규칙](#공통-평가-규칙)
- [검증 의미론 원칙 (Validation Semantics Principles)](#검증-의미론-원칙-validation-semantics-principles)
- [규칙 상세](#규칙-상세)
- [조건부 규칙 파라미터](#조건부-규칙-파라미터)
- [커스텀 규칙](#커스텀-규칙)
- [Not implemented (미구현)](#not-implemented-미구현)

---

## 등록 규칙 목록

23개 규칙 + 별칭 1개 = 24개 이름. 4개 언어 공통.

| 규칙 | 파라미터 | 분류 |
|------|----------|------|
| `required` | `boolean` 또는 조건식 문자열 | 기본 |
| `email` | `boolean` | 형식 |
| `url` | `boolean` | 형식 |
| `minlength` | `number` | 문자열 |
| `maxlength` | `number` | 문자열 |
| `rangelength` | `[min, max]` | 문자열 |
| `match` | `string` (정규식) | 문자열 |
| `pattern` | `string` (정규식) — **`match`의 별칭** | 문자열 |
| `number` | `boolean` | 숫자 |
| `digits` | `boolean` | 숫자 |
| `min` | `number` | 숫자 |
| `max` | `number` | 숫자 |
| `range` | `[min, max]` | 숫자 |
| `step` | `number` | 숫자 |
| `equalTo` | `string` (필드 참조) | 비교 |
| `notEqual` | 값 또는 `.`로 시작하는 필드 참조 | 비교 |
| `in` | 배열 (또는 쉼표 구분 문자열) | 비교 |
| `date` | `boolean` | 날짜 |
| `dateISO` | `boolean` | 날짜 |
| `enddate` | `string` (시작일 필드 참조) | 날짜 |
| `mincount` | `number` | 배열 |
| `maxcount` | `number` | 배열 |
| `unique` | `boolean` 또는 필터 조건식 문자열 | 배열 |
| `accept` | `string` 또는 `string[]` (MIME/확장자) | 파일 |

### pattern / match 별칭

`pattern`과 `match`는 **동일 구현을 가리키는 별칭**이다. 4개 언어 모두 동일하다.

- JS: `['pattern', matchRule]` — `packages/validator-ts/src/rules/index.ts:44`
- PHP: `$this->rules['match'] = $patternRule; $this->rules['pattern'] = $patternRule;`
  — `packages/validator-php/src/Legacy/Validator.php:114-116`
- Go: `"match": ruleMatch, "pattern": ruleMatch` — `packages/validator-go/validator/legacy/rules.go:25-26`
- Rust: `m.insert("match", rule_match); m.insert("pattern", rule_match);`
  — `packages/validator-rust/src/legacy/rules.rs:33-34`

커스텀 메시지는 사용한 규칙명 키(`messages.pattern` 또는 `messages.match`)로 조회된다.

---

## 기본 에러 메시지

**PHP `Validator::DEFAULT_MESSAGES`가 기준**이다
(`packages/validator-php/src/Legacy/Validator.php:48-73`).
JS의 규칙별 `defaultMessage`는 전체 항목이 이 표와 일치하며
(min/max/match/unique 4종은 명시적 일치화 완료), Go는 각 규칙 함수에
동일 문자열이 하드코딩되어 있다.

`{0}`, `{1}`은 규칙 파라미터로 치환된다 (예: `minlength: 5` → `{0}` = 5,
`range: [1, 10]` → `{0}` = 1, `{1}` = 10).

| 규칙 | 기본 메시지 |
|------|-------------|
| `required` | `This field is required.` |
| `email` | `Please enter a valid email address.` |
| `minlength` | `Please enter at least {0} characters.` |
| `maxlength` | `Please enter no more than {0} characters.` |
| `min` | `Please enter a value greater than or equal to {0}.` |
| `max` | `Please enter a value less than or equal to {0}.` |
| `match` / `pattern` | `Please enter a valid format.` |
| `unique` | `Values must be unique.` |
| `in` | `Please select a valid option.` |
| `range` | `Please enter a value between {0} and {1}.` |
| `rangelength` | `Please enter a value between {0} and {1} characters.` |
| `number` | `Please enter a valid number.` |
| `digits` | `Please enter only digits.` |
| `equalTo` | `Please enter the same value again.` |
| `notEqual` | `Please enter a different value.` |
| `date` | `Please enter a valid date.` |
| `dateISO` | `Please enter a valid date in ISO format (YYYY-MM-DD).` |
| `enddate` | `End date must be after the start date.` |
| `url` | `Please enter a valid URL.` |
| `accept` | `Please upload a file with a valid format.` |
| `mincount` | `Please select at least {0} items.` |
| `maxcount` | `Please select no more than {0} items.` |
| `step` | `Please enter a value that is a multiple of {0}.` |

필드의 `messages` 객체로 규칙별 메시지를 오버라이드할 수 있다.
미등록 규칙명이거나 메시지가 없으면 `'Validation failed.'` 폴백
(PHP `Validator.php:512`, JS `rules/index.ts:90`).

---

## 공통 평가 규칙

1. **선언 순서 평가, 필드당 첫 에러 중단** — 스펙의 `rules` 키 선언 순서대로
   평가하고 한 필드에서 에러가 나오면 그 필드의 나머지 규칙은 건너뛴다.
2. **빈 값 스킵** — `required`를 제외한 규칙은 값이 비어 있으면(null / 빈 문자열 /
   빈 배열·객체) 통과시킨다. 빈 값의 강제는 `required`의 책임이다.
   예외: `mincount`/`maxcount`는 빈 배열에도 발화한다 (빈 multiple 필드가
   mincount 위반인 경우 — `packages/validator-php/src/Legacy/Validator.php:370-375`,
   `tests/cases/multiple-fields.json`).
   숫자 `0`, 문자열 `'0'`, `false`는 빈 값이 아니다
   (`packages/validator-ts/src/rules/required.ts` `isEmpty`).
3. **`false`/`null` 파라미터 = 규칙 비활성** — `required: false` 또는 조건식이
   false로 평가되면 해당 규칙을 건너뛴다.
4. **미등록 규칙은 무시** — 알 수 없는 규칙명은 에러 없이 건너뛴다
   (JS `Validator.ts` `validateRule`, PHP `Validator.php` `applyRule`).
5. **number 타입 암묵 검증** — `type: number` 필드에 `number` 규칙이 명시되지
   않았으면 다른 규칙보다 먼저 `number` 검증을 수행한다
   (JS `Validator.ts:608`, PHP `Validator.php:288-304`, Go `validator.go:205`).

### multiple 필드의 배열 레벨 규칙

`multiple: true` 필드(값이 배열)에서는 규칙이 두 부류로 나뉜다.
**배열 레벨 규칙**은 배열 전체에 1회 적용되고, 나머지 규칙은 각 원소에 적용된다.

배열 레벨 규칙 (4개 언어 공통 상수):

```
required, unique, mincount, maxcount
```

- JS: `ARRAY_LEVEL_RULES` — `packages/validator-ts/src/legacy/Validator.ts:132`
- PHP: `Validator::ARRAY_LEVEL_RULES` — `packages/validator-php/src/Legacy/Validator.php:42`
- Go: `arrayLevelRules` — `packages/validator-go/validator/legacy/validator.go:30-35`
- Rust: `array_level_rules()` — `packages/validator-rust/src/legacy/validator.rs:21`

---

## 검증 의미론 원칙 (Validation Semantics Principles)

검증 의미론의 단일 진실은 **"논리적으로 올바른 동작"** 이다. legacy 런타임의
동작이 아니다. legacy(`examples/legacy/legacy-original/assets/js/legacy-client.validate.js`)의
결함은 보완하고, 모든 구현(validator-ts/php/go/rust + legacy 클라)에 일관 적용한다.
새 검증기 4언어는 이 원칙대로 구현돼 1074 케이스 교차언어 멱등이며, legacy 클라는
새 검증기에 맞춰 보완했다. legacy의 과거 동작을 근거로 원칙을 약화하지 마라.

아래 원칙은 확정이다. 각 원칙은 새 검증기 구현이 출처이며, legacy 클라는 동일
의미론으로 패치됐다.

### 1. required — 값을 trim한 뒤 비었으면 실패

`required`는 문자열 값을 trim한 뒤 빈 문자열이면 실패시킨다. 공백만(`" "`,
`"\t"`, `"\n"`) 입력은 빈 값과 동일하다.

- 근거: 공백만 통과는 보안 결함이다. "내용이 있다"가 아니라 "공백을 채웠다"를
  통과시키면 필수 입력 강제가 무력화된다.
- 새 검증기 출처: `packages/validator-ts/src/rules/required.ts:18`
  (`value.trim() === ''`).
- legacy 보완: `legacy-client.validate.js` `required` 메서드 —
  free-text 분기에서 `value.trim().length > 0`. legacy의 과거 동작은
  `value.length > 0`(trim 없음)이었다.

### 2. type:number — 암묵 number 검사

`type: number` 필드는 `number` 규칙 선언 여부와 무관하게, 값이 비어 있지 않은데
숫자가 아니면 실패시킨다. 이 검사는 다른 규칙(min/max 등)보다 **먼저** 수행하므로
보고되는 규칙명은 `number`다.

- 근거: 숫자 필드가 비숫자를 받아들이면 후속 숫자 규칙(min/max)이 무의미한
  비교를 한다. 타입 자체가 암묵적 number 제약이다.
- 새 검증기 출처: `packages/validator-ts/src/legacy/Validator.ts:629-652`
  (`fieldSpec.type === 'number'` 이고 명시 `number` 규칙이 없으면 암묵 number를
  먼저 실행). 서버측 동치: `packages/validator-php/src/Legacy/Validator.php:288-304`,
  `packages/validator-go/validator/legacy/validator.go:205`.
- legacy 보완: `legacy-client.validate.js` `fixSpec` — `type: number` leaf에 명시 `number`
  규칙이 없으면 규칙 객체 맨 앞에 `number: true`를 주입한다(원본 스펙 비변형).
  legacy의 과거 동작은 선언된 규칙만 실행(암묵 number 없음)이었다.

### 3. 무효 규칙 파라미터 skip

min/max 등의 임계값(param)이 숫자로 파싱되지 않으면(`Number(param)`이 NaN) 그
규칙은 적용 불가로 간주해 skip(통과)한다.

- 근거: 무효 임계값을 문자열 비교(`"5" >= "xyz"`)로 처리하면 결과가 타입 저글링
  부작용으로 결정된다. 적용 불가능한 규칙은 검증 결과를 좌우해선 안 된다.
- 새 검증기 출처: `packages/validator-ts/src/rules/min.ts:58-61`,
  `packages/validator-ts/src/rules/max.ts:28-31`
  (`Number(ruleParam)`이 NaN이면 `null` 반환 = skip).
- legacy 보완: `legacy-client.validate.js` `min`/`max` 메서드 — 숫자 비교 분기에서
  `isNaN(Number(param))`이면 통과. legacy의 과거 동작은 `value >= param`
  문자열 비교였다.

### 4. number 입력은 유한수여야 한다

`number` 검사(암묵·명시 모두)에서 입력값은 유한 실수여야 한다. 문자열
`"Infinity"`/`"-Infinity"`/`"NaN"`은 `number` 에러로 거부한다. 이 게이트는 입력
**값**에만 적용된다 — min/max **임계값(param)** 의 Infinity 처리는 별개로 보존한다.

- 근거: 비유한 값은 산술·비교를 오염시킨다. 숫자 입력은 유한해야 후속 규칙이
  의미를 갖는다. `type:number` 암묵 number가 먼저 실행되므로 min/max보다 `number`가
  먼저 보고된다.
- 새 검증기 출처: `packages/validator-ts/src/rules/number.ts:18,34`
  (`isFinite(value)` / `isFinite(num)`). 회귀 잠금: `tests/cases/number-nonfinite.json`.
- legacy 보완: `legacy-client.validate.js` `number` 메서드의 정규식이 `"Infinity"` 리터럴을
  숫자로 인정하지 않아 동일하게 `number`로 거부한다. 양 런타임이 같은 규칙명을 낸다.

### 5. 객체키 multiple group — 엔트리 카운트·에러 경로 보존

`multiple: true` group의 데이터가 list가 아니라 `__uid__` 키 객체로 올 때:
group-level mincount/maxcount는 엔트리 수를 `count(value)`로 센다(배열 형태와 동일
카운트로 수렴, 빈 객체/빈 배열은 0). 에러 field 경로에는 uniqid 키를 보존한다
(`rows.__uid__.v`). 다중 행은 키 정렬 순서로 첫 에러가 결정된다.

- 근거: legacy Legacy의 `[]`-suffix 반복 경로가 키를 보존하는 동작과 일치해야
  한다(`Validation.php`). 키 정렬은 JSON 맵에 삽입 순서가 없는 Go/Rust/PHP와
  JS가 동일한 첫 에러를 내기 위한 필수 조건이다.
- 새 검증기 출처: `packages/validator-ts/src/legacy/Validator.ts:293-296`(객체 multiple
  판정), `:327`(`Object.keys(objectValue).sort()` 로 결정적 순회).
- 회귀 잠금: `tests/cases/count-object-key.json`(카운트), `object-key-multiple.json`
  (에러 경로 uniqid 보존).

### 정책

- 위 원칙은 향후 모든 검증기/클라가 따른다. legacy 결함은 보완하고 모든 구현에
  일관 적용한다.
- 새 검증기 src(`packages/validator-*/src`)는 1074 멱등 정답이다. 수정 금지.
  의미론 변경이 필요하면 4언어를 함께 바꾸고 멱등을 재검증한다.
- legacy 클라<->새 검증기 일치는 `tests/legacy-client` 게이트가 강제한다.
  잔존 갭은 `tests/legacy-client/known-gaps.js`에 근거와 함께 명시하며, 미문서
  불일치는 게이트 FAIL이다.

### 잔존 갭

현재 legacy 클라<->새 검증기 사이에 문서화된 잔존 갭은 **없다**
(`tests/legacy-client` 게이트: documented gaps 0 · regressions 0). 과거 양성으로
문서화했던 `"Infinity"` + `type:number` + `max` 케이스(`min-max.json
min-max-015[2]`)는 위 원칙 4로 통일되어 양 런타임이 모두 `number`를 보고한다 —
갭이 해소됐다. 새 갭이 생기면 `tests/legacy-client/known-gaps.js`에 근거와 함께
등재하고, 미문서 불일치는 게이트 FAIL이다.

---

## 규칙 상세

검증 동작은 JS 구현(`packages/validator-ts/src/rules/*.ts`)을 기준으로 기술한다.
PHP(`src/Rules/*.php`)·Go(`validator/rules.go`)·Rust(`packages/validator-rust/src/legacy/rules.rs`)는
동일 동작의 포팅이며 크로스언어 테스트로 일치가 검증된다.

### required

값이 비어 있으면 실패. 파라미터가 조건식 문자열이면 먼저 평가해서
true일 때만 필수 적용 (예: `required: ".is_display == 2"`).

### email / url / date / dateISO / number / digits

`true`로 켜는 형식 검증. 빈 값은 통과.

### minlength / maxlength / rangelength

문자열 길이 검증. `rangelength: [min, max]`.

### min / max / range / step

숫자 비교 검증. `range: [min, max]`, `step`은 배수 검증.

### match / pattern

정규식 패턴 매칭. 파라미터의 정규식 문자열은 조건식으로 평가되지 않고
원문 그대로 사용된다 (`^https?://...` 처럼 `?`가 들어가도 안전 —
[조건부 규칙 파라미터](#조건부-규칙-파라미터) 참조).

### equalTo / notEqual

- `equalTo: 필드참조` — 대상 필드 값과 일치해야 통과.
  상대 참조(`.x` = 형제, `..x` = 부모 그룹의 형제) 지원
  (`packages/validator-ts/src/rules/equalTo.ts` `resolveFieldParam`).
- `notEqual` — 파라미터가 `.`로 시작하면 필드 참조로 해석해 그 값과,
  아니면 리터럴 값과 비교해서 **다르면** 통과
  (`packages/validator-ts/src/rules/notEqual.ts`).

### in

허용 값 목록 검증. 파라미터는 배열(중첩 배열은 평탄화), 쉼표 구분 문자열,
또는 객체(값 목록 사용). 비교는 문자열 정규화 + 숫자 동치를 허용하는
느슨한 비교다 (`'1'`과 `1` 일치, boolean은 `'1'`/`'0'`으로 정규화 —
`packages/validator-ts/src/rules/in.ts`).

### enddate

현재 값(종료일)이 파라미터로 참조한 시작일 필드 값보다 **이전이면 실패**
(같은 날짜는 통과 — `endDate < startDate`일 때만 에러,
`packages/validator-ts/src/rules/enddate.ts:70`). 상대 경로(`.start_dt`) 지원.
어느 한쪽이 날짜로 파싱 불가능하면 건너뛴다 (`date` 규칙의 책임).

### mincount / maxcount

배열(또는 셀 수 있는 값)의 원소 수 검증.

### unique

두 가지 호출 모드 (`packages/validator-ts/src/rules/unique.ts`):

1. **배열 레벨**: 필드 값 자체가 배열 — 비어 있지 않은 원소가 모두 고유해야 한다.
2. **항목 레벨**: 반복 그룹 안의 스칼라 필드 — **앞선** 형제 항목의 같은 필드와
   중복이면 실패. 에러는 뒤쪽(중복) 항목에 보고된다 (예: `items.1.code`).

파라미터가 조건식 문자열이면 **필터**로 동작한다: 조건을 만족하는 항목만
고유성 검사에 참여한다.

### accept

파일의 MIME 타입 또는 확장자 검증. `image/*` 와일드카드, `.pdf` 확장자,
쉼표 구분 문자열·배열 파라미터 지원.

---

## 조건부 규칙 파라미터

규칙 파라미터가 문자열이면 조건식으로 평가될 수 있다.

```yaml
start_dt:
  type: datetime
  rules:
    required: ".is_display in 2,3"   # 조건 충족 시에만 required 적용

quantity:
  type: number
  rules:
    min: ".is_premium == 1 ? 10 : 1"  # ternary: 평가 결과가 파라미터 값이 됨
```

- 조건식이 `false`로 평가되면 규칙 비활성.
- ternary(`cond ? a : b`)는 평가된 분기 값이 파라미터가 된다.
- **예외 — 문자열 파라미터를 조건식으로 평가하지 않는 규칙**:
  필드 참조나 정규식을 원문 그대로 받아야 하는 규칙이다.
  - JS: `equalTo`, `notEqual`, `unique` (`Validator.ts:42` `PATH_REFERENCE_RULES`);
    `match`/`pattern`은 ternary 조건부만 문자열 분할 방식으로 평가하고
    정규식 분기는 원문 보존 (`Validator.ts` `tryEvaluateTernary`)
  - Go: `equalTo`, `notEqual`, `enddate` (`validator.go:39-43` `pathReferenceRules`),
    `match`/`pattern` (`validator.go:48-51` `literalParamRules`)
  - 언어별 내부 상수는 다르지만 외부 동작(어떤 파라미터가 원문으로 전달되는가)은
    크로스언어 테스트로 일치가 검증된다.

조건식 문법은 [CONDITION-PARSER.md](./CONDITION-PARSER.md) 참조.

---

## 커스텀 규칙

| 언어 | 방법 | 범위 |
|------|------|------|
| JS | `validator.addRule(name, fn)` | 인스턴스 한정 |
| JS | `registerRule(name, ruleOrFn)` | 전역 (내장 오버라이드 가능) |
| PHP | `$validator->addRule($name, $fn)` | 인스턴스 한정 |
| Go | `v.AddRule(name, fn)` | 인스턴스 한정 (내장 오버라이드 가능) |

시그니처는 [API.md](./API.md) 참조.

---

## Not implemented (미구현)

다음 규칙명은 **어떤 언어 레지스트리에도 등록되어 있지 않다**.
스펙에 써도 "미등록 규칙은 무시" 정책에 따라 조용히 건너뛴다 —
검증 효과가 없으므로 사용하지 마라.

| 규칙명 | 상태 |
|--------|------|
| `minformcount` | 미구현. 픽스처·LargeForm 스펙 어디에도 미사용. JS `RulesSpec` 타입 선언(`types.ts:109`)에만 존재하며 구현체 없음 |
| `maxformcount` | 미구현. 동상 |
| `datetime` | 미구현 (datetime **필드 타입**은 존재하지만 `datetime` 검증 **규칙**은 없음 — `dateISO`/`date` 사용) |
| `remote` | 미구현 (원격 검증) |

> 반복 그룹의 항목 수 제한이 필요하면 구현된 `mincount`/`maxcount`를 사용하라
> (group의 `multiple: true` 배열에 배열 레벨 규칙으로 적용된다).

---

## 관련 문서

- [API.md](./API.md) — 언어별 Validator API
- [SPEC.md](./SPEC.md) — 스펙 형식
- [CONDITION-PARSER.md](./CONDITION-PARSER.md) — 조건식 문법
