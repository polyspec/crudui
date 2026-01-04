# 조건부 표시 시스템 (Conditional Display System)

폼 시스템에서 필드의 표시/숨김을 동적으로 제어하는 세 가지 패턴을 설명합니다.

## 목차

1. [display_switch - 단순 토글](#1-display_switch---단순-토글)
2. [display_target - 스타일/클래스 기반 조건](#2-display_target---스타일클래스-기반-조건)
3. [element.all_of - 고급 복합 조건](#3-elementall_of---고급-복합-조건)
4. [패턴 선택 가이드](#패턴-선택-가이드)
5. [표시 상태와 유효성 검사](#표시-상태와-유효성-검사)
6. [구현 상세](#구현-상세)

---

## 1. display_switch - 단순 토글

가장 기본적인 조건부 표시 패턴입니다. 하나의 필드 값에 따라 다른 필드들의 표시 여부를 제어합니다.

### 기본 문법

```yaml
field_name:
  display_switch:
    value1: [target_field1, target_field2]
    value2: [target_field3]
```

### 동작 방식

- `field_name`의 값이 `value1`일 때 `target_field1`, `target_field2`가 표시됩니다
- `field_name`의 값이 `value2`일 때 `target_field3`이 표시됩니다
- 해당 값이 아닌 경우 대상 필드들은 숨겨집니다

### 실제 예시

```yaml
# 로케일 사용 여부에 따른 로케일 선택 필드 표시
is_locale:
  type: checkbox
  label: "다국어 지원"
  display_switch:
    1: [locale_ids[]]

locale_ids[]:
  type: select
  label: "지원 언어"
  multiple: true
```

```yaml
# 회원 유형에 따른 추가 정보 필드 표시
member_type:
  type: radio
  options:
    individual: "개인"
    business: "사업자"
    foreigner: "외국인"
  display_switch:
    individual: [resident_number]
    business: [business_number, company_name]
    foreigner: [passport_number, nationality]
```

### 특징

- **단순함**: 설정이 직관적이고 이해하기 쉬움
- **1:N 관계**: 하나의 조건 필드가 여러 대상 필드를 제어
- **단일 조건**: 하나의 값에 대해서만 판단 (복합 조건 불가)

---

## 2. display_target - 스타일/클래스 기반 조건

대상 필드에서 조건을 정의하는 패턴입니다. 조건 값에 따라 스타일이나 클래스를 적용합니다.

### 기본 문법

```yaml
target_field:
  display_target: source_field
  display_target_condition_style:
    value1: "CSS 스타일"
    value2: "CSS 스타일"
```

또는 클래스 기반:

```yaml
target_field:
  display_target: source_field
  display_target_condition_class:
    value1: "class-name"
    value2: "class-name"
```

### 동작 방식

- `source_field`의 값을 감시합니다
- 값이 변경되면 해당 값에 매핑된 스타일/클래스를 `target_field`에 적용합니다
- 매핑되지 않은 값의 경우 스타일/클래스가 제거됩니다

### 실제 예시

```yaml
# 표시 여부에 따른 스타일 적용
is_display:
  type: checkbox
  label: "공개 여부"

content_section:
  type: group
  display_target: is_display
  display_target_condition_style:
    0: "display: none;"
    1: "display: block;"
```

```yaml
# 상태에 따른 클래스 적용
status:
  type: select
  options:
    draft: "초안"
    review: "검토중"
    published: "게시됨"

status_indicator:
  type: html
  display_target: status
  display_target_condition_class:
    draft: "badge-secondary"
    review: "badge-warning"
    published: "badge-success"
```

### 스타일 vs 클래스

| 속성 | 용도 | 장점 |
|------|------|------|
| `display_target_condition_style` | 인라인 CSS 직접 적용 | 즉시 적용, 별도 CSS 불필요 |
| `display_target_condition_class` | CSS 클래스 적용 | 재사용성, 유지보수 용이 |

### 특징

- **대상 중심**: 대상 필드에서 조건을 정의 (역방향 참조)
- **스타일 제어**: 단순 표시/숨김 외에 다양한 스타일 적용 가능
- **값 매핑**: 각 값에 대해 개별적인 스타일/클래스 지정

---

## 3. element.all_of - 고급 복합 조건

여러 조건을 복합적으로 평가하여 표시 여부를 결정하는 고급 패턴입니다.

### 기본 문법

```yaml
target_field:
  element:
    all_of:
      conditions:
        field1: value1
        field2: [value2, value3]  # OR 조건
      inline: "조건 만족 시 스타일"
      class: "조건 만족 시 클래스"
      not:
        inline: "조건 불만족 시 스타일"
        class: "조건 불만족 시 클래스"
```

### 동작 방식

1. `conditions`에 정의된 모든 조건을 AND로 평가합니다
2. 각 필드의 조건:
   - 단일 값: 해당 값과 일치하는지 확인
   - 배열: 배열 내 값 중 하나와 일치하는지 확인 (OR)
3. 모든 조건 만족 시: `inline`/`class` 적용
4. 하나라도 불만족 시: `not.inline`/`not.class` 적용

### 실제 예시

```yaml
# 복합 조건: 닫힘 상태가 아니고, 표시 상태가 2 또는 3일 때
special_content:
  type: group
  element:
    all_of:
      conditions:
        is_close: 0
        is_display: [2, 3]
      inline: "display: block;"
      not:
        inline: "display: none;"
```

```yaml
# 고급 예시: 여러 조건의 조합
premium_features:
  type: group
  element:
    all_of:
      conditions:
        user_type: premium
        is_verified: 1
        subscription_status: [active, trial]
      class: "feature-enabled"
      inline: "opacity: 1; pointer-events: auto;"
      not:
        class: "feature-disabled"
        inline: "opacity: 0.5; pointer-events: none;"
```

```yaml
# 편집 모드와 권한 조합
edit_section:
  type: group
  element:
    all_of:
      conditions:
        mode: edit
        has_permission: 1
        is_locked: 0
      inline: "display: block;"
      not:
        inline: "display: none;"
```

### 조건 평가 로직

```
all_of 평가:
├── field1 == value1?     AND
├── field2 IN [value2, value3]?  AND
└── field3 == value3?
    → 모두 true: 조건 만족
    → 하나라도 false: 조건 불만족
```

### 특징

- **복합 조건**: 여러 필드를 AND로 결합
- **OR 지원**: 배열로 한 필드에 대한 OR 조건 표현
- **양방향 스타일**: 조건 만족/불만족 각각에 대한 스타일 정의
- **클래스 + 스타일**: 동시에 클래스와 인라인 스타일 적용 가능

---

## 패턴 선택 가이드

### 언제 어떤 패턴을 사용해야 하는가?

| 상황 | 권장 패턴 | 이유 |
|------|-----------|------|
| 체크박스로 섹션 표시/숨김 | `display_switch` | 가장 단순하고 직관적 |
| 하나의 필드가 여러 필드 제어 | `display_switch` | 1:N 관계에 최적화 |
| 값에 따라 다른 스타일 적용 | `display_target` | 스타일 매핑이 명확 |
| 값에 따라 다른 클래스 적용 | `display_target` | 클래스 매핑 지원 |
| 여러 조건의 AND 조합 필요 | `element.all_of` | 복합 조건 지원 |
| 조건별 다른 반응 필요 | `element.all_of` | not 블록으로 분기 |

### 패턴 복잡도 비교

```
단순 ◄─────────────────────────────────────► 복잡

display_switch    display_target    element.all_of
     │                  │                  │
 단일 필드          값별 스타일         복합 조건
 단일 값            역방향 참조         AND/OR 조합
 표시/숨김          다양한 스타일       양방향 스타일
```

### 결정 플로우차트

```
조건이 하나인가?
├── 예 → 단순 표시/숨김인가?
│        ├── 예 → display_switch
│        └── 아니오 → display_target (스타일/클래스 매핑)
└── 아니오 → element.all_of (복합 조건)
```

---

## 표시 상태와 유효성 검사

### 핵심 원칙

**숨겨진 필드는 유효성 검사에서 제외됩니다.**

이는 사용자 경험과 데이터 무결성을 위한 설계입니다.

### 동작 방식

```yaml
member_type:
  type: radio
  options:
    individual: "개인"
    business: "사업자"
  display_switch:
    business: [business_number]

business_number:
  type: text
  label: "사업자등록번호"
  required: true  # 조건부 필수
```

위 예시에서:
- `member_type`이 `business`일 때: `business_number` 표시, required 적용
- `member_type`이 `individual`일 때: `business_number` 숨김, required 무시

### 유효성 검사 규칙

| 필드 상태 | required | 다른 유효성 규칙 | 제출 시 동작 |
|-----------|----------|------------------|--------------|
| 표시됨 | 적용 | 적용 | 정상 검사 |
| 숨겨짐 | 무시 | 무시 | 검사 건너뜀 |
| 비활성화 | 무시 | 무시 | 검사 건너뜀 |

### 주의사항

1. **서버 측 검증**: 클라이언트 숨김 상태와 무관하게 서버에서도 조건부 필수 로직 구현 필요

```php
// 서버 측 검증 예시
if ($data['member_type'] === 'business') {
    $rules['business_number'] = 'required|digits:10';
}
```

2. **숨김 시 값 처리**: 숨겨진 필드의 기존 값 처리 정책 결정 필요
   - 유지: 숨겨도 값 보존 (기본 동작)
   - 초기화: 숨길 때 값 제거 (추가 구현 필요)

3. **중첩 조건**: 부모가 숨겨지면 자식도 함께 숨겨짐

---

## 구현 상세

### JavaScript 이벤트 흐름

```javascript
// 1. 소스 필드 변경 감지
sourceField.addEventListener('change', (e) => {
    // 2. 조건 평가
    const shouldShow = evaluateCondition(e.target.value);

    // 3. 대상 필드 표시 상태 변경
    targetField.style.display = shouldShow ? 'block' : 'none';

    // 4. 유효성 검사 상태 업데이트
    updateValidationState(targetField, shouldShow);
});
```

### display_switch 구현

```javascript
function initDisplaySwitch(field, config) {
    const displaySwitch = config.display_switch;

    field.addEventListener('change', (e) => {
        const value = e.target.value;

        // 모든 대상 필드 숨김
        Object.values(displaySwitch).flat().forEach(targetName => {
            const target = document.querySelector(`[name="${targetName}"]`);
            if (target) {
                target.closest('.form-group').style.display = 'none';
            }
        });

        // 현재 값에 해당하는 필드만 표시
        if (displaySwitch[value]) {
            displaySwitch[value].forEach(targetName => {
                const target = document.querySelector(`[name="${targetName}"]`);
                if (target) {
                    target.closest('.form-group').style.display = 'block';
                }
            });
        }
    });
}
```

### display_target 구현

```javascript
function initDisplayTarget(field, config) {
    const sourceField = document.querySelector(`[name="${config.display_target}"]`);
    const styleMap = config.display_target_condition_style || {};
    const classMap = config.display_target_condition_class || {};

    sourceField.addEventListener('change', (e) => {
        const value = e.target.value;

        // 스타일 적용
        if (styleMap[value]) {
            field.style.cssText = styleMap[value];
        } else {
            field.style.cssText = '';
        }

        // 클래스 적용
        Object.values(classMap).forEach(cls => field.classList.remove(cls));
        if (classMap[value]) {
            field.classList.add(classMap[value]);
        }
    });
}
```

### element.all_of 구현

```javascript
function initAllOf(field, config) {
    const allOf = config.element.all_of;
    const conditions = allOf.conditions;
    const sourceFields = Object.keys(conditions).map(name =>
        document.querySelector(`[name="${name}"]`)
    );

    function evaluate() {
        const allMet = Object.entries(conditions).every(([name, expected]) => {
            const sourceField = document.querySelector(`[name="${name}"]`);
            const actual = sourceField.value;

            // 배열인 경우 OR 조건
            if (Array.isArray(expected)) {
                return expected.includes(actual) || expected.includes(Number(actual));
            }
            return actual == expected;
        });

        if (allMet) {
            // 조건 만족
            if (allOf.inline) field.style.cssText = allOf.inline;
            if (allOf.class) field.classList.add(allOf.class);
            if (allOf.not?.class) field.classList.remove(allOf.not.class);
        } else {
            // 조건 불만족
            if (allOf.not?.inline) field.style.cssText = allOf.not.inline;
            if (allOf.not?.class) field.classList.add(allOf.not.class);
            if (allOf.class) field.classList.remove(allOf.class);
        }
    }

    sourceFields.forEach(sf => sf?.addEventListener('change', evaluate));
    evaluate(); // 초기 평가
}
```

### CSS 클래스 활용

```css
/* 표시/숨김 유틸리티 클래스 */
.condition-hidden {
    display: none !important;
}

.condition-visible {
    display: block;
}

/* 비활성화 스타일 */
.condition-disabled {
    opacity: 0.5;
    pointer-events: none;
}

/* 트랜지션 효과 */
.condition-fade {
    transition: opacity 0.3s ease;
}

.condition-fade.condition-hidden {
    opacity: 0;
}
```

---

## 요약

| 패턴 | 용도 | 조건 위치 | 복합 조건 |
|------|------|-----------|-----------|
| `display_switch` | 단순 토글 | 소스 필드 | 불가 |
| `display_target` | 스타일/클래스 매핑 | 대상 필드 | 불가 |
| `element.all_of` | 복합 AND 조건 | 대상 필드 | 가능 |

선택 기준:
- 단순하면 `display_switch`
- 스타일 매핑이 필요하면 `display_target`
- 복합 조건이 필요하면 `element.all_of`
