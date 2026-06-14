# Form-Spec v2 명세

> 하나의 YAML로 4개 언어(JS/PHP/Go/Rust)가 동일하게 검증하고 3개 프레임워크
> (React/Vue/Svelte)가 동일하게 렌더하는, **조건을 값에 녹이고 역할로 가른**
> 선언적 폼 스펙. legacy(Limepie)를 발판 삼아 초월한다.

이 문서는 v2의 **헌법**이다. 표현식 엔진 상세는 [EXPRESSION-GRAMMAR.md](./EXPRESSION-GRAMMAR.md),
검증 의미론은 [VALIDATION-RULES.md](./VALIDATION-RULES.md)를 따른다. 어댑터·오라클은
안정 확보까지의 **과도기 도구**이며 결국 레거시를 폐기한다(R7).

## 0. 골 (달성하면 끝나는 상태)

골은 **상태**다. R1~R8·G1~G5·표현식 엔진·슬롯·분류 규칙은 골에 봉사하는 **수단**이지
골이 아니다 — 둘을 섞으면 수단을 만지다 골을 잃는다. 모든 결정은 "이 7골 중 무엇에
봉사하는가"로 검증한다. 어디에도 봉사하지 않으면 만들지 않는다.

**북극성.** 하나의 YAML 폼 스펙이 4언어에서 동일하게 검증되고 3프레임워크에서 동일
하게 렌더되며, legacy Limepie를 기능·구조 양면에서 초월하고 결국 대체한다 — 원칙으로
자기설명되어 설명 없이 읽힌다.

| 골 | 정의 | 달성 판정 |
|---|---|---|
| **G-A 단일 진실** | 폼의 모든 측면(구조·콘텐츠·검증·표시·외형·동작·다국어·타입옵션·합성)이 한 YAML에서 도출. 같은 개념 한 곳, 조건부 이중화 없음. | 코드에 숨은 폼 로직 0, 조건 전용 메타키 0 |
| **G-B 4언어 검증 멱등** | JS/PHP/Go/Rust가 같은 (스펙, 데이터) → 비트 동일한 결과(valid+errors). 표현식 토큰열/AST/평가값도 4언어 동일. | 공유 픽스처(현 1074 + v2 신규) 4언어 GREEN |
| **G-C 3프레임워크 렌더 parity** | React/Vue/Svelte가 같은 스펙 → 정규화 후 동일 HTML. | reference-html parity(현 7/7 → 코퍼스 확대) GREEN |
| **G-D 조건을 값에** | `if`/`when`/`show_if`류 메타키 박멸 — 조건은 값의 표현식/조건맵. 4언어 동일 제한 DSL(eval 금지) + 정식 토크나이저·파서·평가기. | 조건 전용 키 0, 표현식 픽스처 4언어 GREEN |
| **G-E 역할로 가른 자기설명** | 한 속성 한 역할. 개별 매핑이 아니라 규칙(x주석 / 1급-하위 / 종속 격리 / 공통 역할 분배)으로 자동 분류. 매직 토큰·위치 의존 정체성 0. | 새 키도 규칙만으로 자리 결정, 주석 없이 구조로 읽힘 |
| **G-F legacy 초월·대체** | 기능 v1 ⊂ v2(+합성·다국어 메시지·동적 옵션·검증 확장점), 구조는 v1보다 깨끗. 어댑터·번역기·오라클은 과도기 — 안정 후 v1 폐기. v2를 번역 가능성으로 제약하지 않음. | 실운영 577 스펙이 v2로 표현·검증, 안정 후 v1 의존 0 |
| **G-G 게이트 영구 강제** | 멱등·parity는 측정·게이트, 미달이라고 기준을 낮추지 않음(정당한 약화만). v2 자체 게이트(영구) + v1 오라클(과도기)이 정답 자동 생성. | CI가 멱등·parity·표현식 픽스처를 차단 |

다국어·합성·표현식 엔진·슬롯은 별도 골이 아니라 G-A/G-D/G-F 안의 수단이다. 골이
**아닌** 것(경계)은 §8.

## 1. 설계 원칙 (R1~R8 — 헌법)

- **R1 역할 분리.** 한 속성은 한 역할만. 역할은 슬롯으로 가른다: 최상위(구조·콘텐츠),
  `validate`(검증), `design`(보임새=표시+스타일), `behavior`(동작). 조건은 별도 역할이
  아니라 값의 표현식이다(G1).
- **R2 단일 진실.** 같은 개념은 한 곳. 단 "한 개념"을 정확히 가른다 — 조건부는 별도
  키가 아니라 값 자체의 표현식으로 표현해 "무조건 키 + 조건부 키" 이중화를 없앤다.
- **R3 위치 독립 정체성.** 반복 행의 정체성은 위치가 아니라 데이터 `id`가 진다. 직렬화
  인덱스는 클라가 자동으로 매기는 산물이고, 정체성(id)이 불변이라 외부 참조·멱등이 안전.
- **R4 매직 토큰 금지.** 학습 없이 못 읽는 토큰(13hex uniqid, `_` 같은 관례 기호)을
  스펙·데이터에 두지 않는다. 모든 식별자는 명시적·의미적.
- **R5 표준 관행 우선.** 반복은 배열, 기존/신규는 `id` 유무, 타입 옵션은 `options`,
  합성은 `$ref`/`$patch`. 자체 발명은 표준으로 안 풀릴 때만.
- **R6 멱등·parity 불변.** 4언어 검증 멱등 + 3프레임워크 렌더 parity를 게이트로 강제.
  기준을 달성 못 한다고 낮추지 않는다. 기준이 틀렸으면 정정한다.
- **R7 legacy 초월.** 어댑터·오라클은 과도기 도구다 — 결국 레거시를 폐기한다. **v2를
  번역 가능성으로 제약하지 않는다**: v2가 v1을 초월하는 부분은 번역 불가가 정상이고
  그게 가치다. 번역기를 위해 v2를 희생하지 않는다. v2는 v1 없이 자기 명세·게이트로 성립.
- **R8 자기설명 (self-documenting).** 주석 없이 키 이름과 구조만으로 의미가 드러나야
  한다. 같은 역할=같은 슬롯, 같은 값=같은 표현, 한 규칙이 한 번 보면 유추된다.

## 2. 필드 구조 — 다섯 결정 (G1~G5)

**G1 — 조건은 값이다.** 모든 평가값은 표현식 또는 조건맵이다. 별도 `if`/`when`/
`show_if` 키가 없다.
```yaml
show:     ".subscribe"                     # 단순: 표현식
class:                                      # 다분기: 조건맵 (위→아래 첫 참, true=기본)
  ".status == 'active'": text-success
  true: form-control
```
엔진은 제한 DSL(경로 `.`/`..`/`*`, 비교, 논리, `in`, ternary) + 정식 토크나이저/
파서/평가기, **4언어 동일, `eval` 금지**(EXPRESSION-GRAMMAR.md). 임의 JS는 평가하지
않고 `behavior`로 불투명 전달한다.

**G2 — 역할 슬롯 + 타입 옵션 + 다형.**
```yaml
email:
  type: email                              # 정체성
  label: { ko: 이메일, en: Email }         # 콘텐츠 (다국어, G3)
  prepend: "@"                             # 콘텐츠 (텍스트)
  validate: { required: ".subscribe", email: true }   # 검증
  design:                                  # 보임새 = 표시 + 스타일
    show: ".subscribe"
    class: { ".vip": gold, true: plain }
  behavior: { onchange: "..." }            # 동작 (불투명 스크립트)
  options: { ... }                         # 타입 종속 (그 타입이 정의)
  lang: { mode: append, only: [ko, en] }   # 다국어 입력 (값이 언어별, G3)
```
역할 슬롯(`validate`·`design`·`behavior`·`options`)·구조 키(`lang` 등)는 **다형**
이다: `false`(끔/없음) | `{객체}`(설정) | `true`(기본, `{}`의 축약). `behavior: false`
로 합성 상속을 무효화한다. 1급은 핵심 공통뿐이고, 1급 아닌 세부는 무조건 그 상위
하위로 내린다(§3 규칙 B·C).

**G3 — 다국어는 두 축.** (1) **콘텐츠 번역**: label/description/help/messages·정적
`items` 라벨이 언어별이면 언어맵 `{ ko: …, en: … }`(스펙 작성자의 번역). 즉 `items`
값은 라벨 string 또는 언어맵(예 `{ 0: {ko: 미사용, en: Off}, 1: {ko: 사용, en: On} }`).
빈 콘텐츠는 생략하거나 `null`(없는 것과 동일 — 검증·렌더에 무영향). (2) **입력 다국어**:
필드 값 자체가 언어별이면 `lang`(`multiple`과 같은 구조 차원 — 필드를 언어별 입력
그룹으로 확장). lang 종속 세부(언어 그룹 외형 `frame`/`title`/`group_class` 포함)는
모두 `lang` 하위로 격리한다(§3 C).

**G4 — 반복 행은 인덱스 배열 + 숨긴 id.** `multiple: true`. **위치(직렬화)는 클라가
자동, 정체성은 숨긴 `id`**(기존=서버 PK, 신규=없음). 매직 키 없음. 순서는 배열 순서.
서버는 인덱스를 정체성으로 쓰지 않고 `id`로 기존/신규를 가른다. 삭제는 컬렉션
동기화(원본 id − 제출 id). (레거시 `seqtokey`/`__13hex__` 인코딩은 실측 검증 후 폐기.)

**G5 — 스펙은 합성된다.** `$ref`(베이스 상속) + `$patch`(추가·병합·제거). 파서가
가장 먼저 합성을 펼쳐 단일 스펙으로 만든 뒤 필드 층을 적용한다 — 합성 없이는 `$ref`
쓰는 스펙을 로드조차 못 한다.

## 3. 분류 규칙 (개별 매핑이 아니라 규칙)

**A. `x` 접두는 주석.** `xclass`·`xstyle`·`x{key}`는 임시 비활성 주석이다 — 파서가
무시한다(스펙 의미 없음).

**B. 1급만 1급. 나머지는 무조건 하위로.** 1급(최상위)은 핵심 공통뿐이다: 구조·정체성
(`type` `name` `default` `properties` `items` `multiple` `lang`) + 콘텐츠(`label`
`description` `placeholder` `prepend` `append` `help`) + 역할 슬롯(`validate` `design`
`behavior` `options`). 1급 자격(모든 필드의 핵심)이 없는 **모든 세부는 하위로** 내린다
— 최상위를 함부로 늘리지 않는다.

**C. 하위 분류 규칙.**

**종속 격리** — 키가 특정 대상에만 의미 있으면 그 대상 하위로 캡슐화한다(대상을 끄면
함께 사라진다). 외형·동작이라도 종속이면 역할 슬롯이 아니라 대상 하위다:
- **타입 종속** → `options` (`keyword_min_length`·`marker_draggable`·`zoom`·
  `geometry_type`·`max_tags`·`checkbox_label`·`on_label`…). 컨테이너 타입(`group`·
  `multiple`)의 chrome(`collapse`·`expend`·`view_total`·`stepper`·`blank_message`)과
  타입 종속 스크립트·콜백(`callback`=select2, `event`=datetime 설정)도 여기 — 특정
  타입에만 존재하므로. 그 타입이 정의·검증, 코어 불관여(표준: JSONForms `options`/
  Formily `x-component-props`/rjsf `ui:options`). 새 위젯이 와도 코어 불변.
- **`multiple`(반복) 종속** → `multiple` 하위 (`max`·`copy`·`sortable`·추가/삭제
  버튼·버튼 라벨·`onclick` ← 레거시 `multiple_max`·`sortable*`·`add_buttons`·
  `remove_list_button`·`list_button_text`·`multiple_button_onclick`)
- **`lang`(다국어 입력) 종속** → `lang` 하위 (`mode`·`only`·`name`·`key`·`frame`·
  `title`·`group_class`. `only`는 언어 allowlist `[ko, en]` 또는 언어별 오버라이드 맵
  `{ja: {validate: …}}` 양형 ← 레거시 `lang:append`·`langs`·`lang_name`·`lang_key`·
  `remove_lang_frame`·`remove_lang_title`·`lang_group_class`)
- **동적 선택지 소스** → `items` 하위 (`items`는 정적 배열이거나 `{model, method,
  table, relations, …}` 동적 소스 — 다형. 레거시에 흩어졌던 것을 `items`로 모음)

대상이 스칼라면(`type`) 전용 슬롯(`options`), 대상이 구조면(`multiple`/`lang`/`items`)
그 구조 하위 — 한 원리의 두 표면이다.

**공통 역할 분배** — 모든 필드 공통(독립)은 역할 슬롯으로:
- **검증** → `validate`
- **보임새** → `design` = **표시 + DOM 노드별 외형 맵**. `design.show`=표시 조건,
  `design.class`/`style`=주 노드(입력), `design.{label|wrapper|group|prepend}.class`/
  `style`=각 노드. 어느 노드 스타일인지 키로 드러난다(R8). 레거시 `element_class`·
  `label_class`·`group_class`·`input_class`·`wrapper_class`·`prepend_class`를 흡수.
- **동작(모든 타입 공통 스크립트)** → `behavior` (`onchange`·`onclick`·`onload`)

**합성** → `$ref`/`$patch`
**라벨** → 수식 대상 곁(인접): 필드 라벨→최상위, 동작 라벨→`behavior.{action}.label`
**콘텐츠 번역**(`label: {ko, en}`)은 콘텐츠 자체(G3)이지 분류 대상이 아니다.

## 4. 표현식 엔진 (요약 — 상세는 EXPRESSION-GRAMMAR.md)

정식 파이프라인(토크나이저→파서→평가기), 4언어 동일, `eval` 금지. 제한 DSL: 경로
`.x`/`..x`/`*`/`[a,b]`, 비교 `== != > >= < <=`, 논리 `&& || !`, `in`/`not in`,
ternary `?:`(값 반환), 괄호, 리터럴. 산술·함수·메서드·정규식은 미지원(의도). 평가되는
값(표시·조건·외형·검증)에만 적용하고, `behavior` 스크립트는 불투명 전달한다.

## 5. 합성 (G5 상세)

```yaml
properties:
  $ref: Base.yml                  # 상속
  $patch:                         # 변경 (추가·병합·제거)
    "field.validate.required": ".other"   # 깊은 경로 설정
```
`$ref`(파일/경로 상속) + `$patch`(JSON Patch식 add/remove/replace). 해석 순서:
`$ref` → `$patch` → 단일 스펙 → 필드 층. (레거시 `$after`/`$before`/`$merge`/
`$remove`는 `$patch`로 흡수.)

## 6. 검증 게이트 (R6, R7)

**금지키 차단 메커니즘** (G-A·G-D 실현): 조건 전용 메타키(`display_switch`·
`display_target`·`if`·`when`·`show_if`·`_` 등)와 매직 토큰의 전역 거부는 두 층이 함께
강제한다 — 메타스키마 `propertyNames`(선언적, 모든 열린 버킷에 재사용)와 **4언어 검증
패스의 재귀 금지키 스캔**(런타임, 임의 깊이). 타입/파서는 금지키 가드를 지지 않고 **모든
키를 보존**한다(round-trip, silent drop 금지) — 차단은 검증의 책임이다(R1 표현/검증
분리). 타입 구조체로 깊은 중첩 키를 막으려 하면 누락·doc 과장이 생긴다(실측 교훈).
조건맵 기본키 `true` 강제·`_` 거부도 같은 검증 패스가 수행한다.

- **v2 자체 게이트 (영구 기준)**: EXPRESSION-GRAMMAR 명세 픽스처(토큰/AST/값) + 4언어
  멱등 + 3프레임워크 parity + v2 신규(값 반환·조건맵·경로비교) 직접 픽스처. v1 없이 성립.
- **v1 엔진 오라클 (과도기 보조)**: 실운영 v1 스펙을 v1 엔진(기준)과 v2 번역→v2 엔진
  으로 교차검증(v1 호환 범위). 번역기 왕복 무손실(`v1→v2→v1`=원본)로 번역 검증. v1
  엔진이 멱등으로 신뢰되어 실스펙 정답을 자동 생성한다. **안정 후 오라클·번역기 폐기**.
- **게이트 코퍼스**: 자작 예시가 아니라 실운영 스펙(blue/app 577종)에서 추출한다.

## 7. 구현 상태 + 로드맵 (골 게이트 연결)

**현 form-spec은 legacy v1 포트다**(감사 실측). 1074/1074·7/7 GREEN은 v1 의미론의
증거이지 v2 달성이 아니다 — parity 게이트는 legacy 행동을 핀해 G-A/G-F와 오히려
역방향이다. v2 구현 갭(각각 골 게이트로 강제):

- 역할 슬롯(`validate`/`design`/`behavior`/`options`) 미소비 — 스키마·검증기 4·
  generator 3 전부 v1 `rules`/외형키 모델 (G-A·G-B)
- 조건 전용 메타키(`display_switch`/`display_target`) 스키마+4언어 검증기 전역 잔존
  — G1 위반 (G-A·G-D)
- 조건맵 평가기 0건, `$ref`/`$patch` 합성 0건 — 미해결 `$ref`가 `valid:true` 오검증 (G-D·G-F)
- 표현식 토큰열/AST 공유 픽스처 0건 — "4언어 동일" 축 측정 불가 (G-B·G-D·G-G)
- 실운영 577 코퍼스 wiring 0 — 판정 분모 미확보 (G-F)
- 매직토큰 `__13hex__` 잔존 (R4·G4), PHP 표현식만 문자열 split (Go/Rust/JS는 AST) (G-D)

**구현 순서**(의존성): 정규 스키마 확정 → 표현엔진 통일(PHP AST 신규) → 조건맵·합성
→ 검증기 v2 슬롯 소비 → 표시로직 코드→스펙 이전 → v1→v2 번역기 → 577 반입 →
토큰/AST·v2신규 픽스처 → 영구 게이트.

**표현식 4언어 토큰/AST 멱등 숙제**: PHP는 v2 AST 엔진으로 JS와 38케이스 일치(완료).
Go/Rust는 IDENTIFIER(비ASCII 허용)·STRING literal 직렬화·지수표기·`position` 필드에서
JS와 차이 — 공유 픽스처(`tests/fixtures/expr`)로 4언어를 JS 기준에 정합해야 토큰/AST
멱등이 성립한다. truthy 경계(`"0"`/`"false"` 문자열, 빈 객체)도 픽스처로 4언어 확정.

**설계 숙제 (미해결)**: 최복잡 케이스(PeopleUnitPrice)의 요일 7반복·display 6반복·
`$patch` 깊은 경로가 verbose하다. 그룹 단위 `show` 상속·와일드카드 `$patch`로 줄일지
미확정. v2도 복잡 케이스를 마법으로 단순화하지 못한다 — 가치는 규칙 일관·매직 제거·
역할 분리다.

## 8. 비목표 (YAGNI)

- JSON Schema 미채택(verbose·학습곡선↑). "표준"은 일관 규칙으로 달성.
- 역할 슬롯은 넷(`validate`/`design`/`behavior`/`options`) + 최상위. 더 늘리지 않는다
  — 종속 키는 의존 대상 하위로 격리(타입→`options`, 다국어 입력→`lang`), `x{key}`는 주석.
- 표현식에 산술·함수 미추가(필요 시 4언어 동일 구현·픽스처 갖춘 뒤에만).
