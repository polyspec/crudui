# Form Output Comparison: Legacy PHP vs React Form Builder

> **상태 (2026-06).** 이 문서는 정합화 작업 착수 시점의 비교 분석이다.
> §3/§5 의 항목 다수가 그 후 구현 완료되었다 — 각 항목의 ✅ 표시를 보라.
> "React Output" 으로 인용된 마크업 예시는 작성 시점 스냅샷이며 현재 출력과
> 다를 수 있다. **현재의 출력 일치 여부는 이 문서가 아니라
> `tests/parity` 하네스(기준 HTML 7종 비교)가 단일 기준이다** —
> `tests/parity/README.md` 참조. generator-react 마크업은 현재도 정합화
> 작업이 진행 중이므로 이 문서의 마크업 세부를 구현 기준으로 삼지 마라.

This document compares the HTML output structure between the Legacy PHP form generator and the React form builder to identify differences and what needs to be aligned.

## 1. Overall Form Structure

### Legacy PHP Output
```html
<div class="form-group">
  <div class="form-element-wrapper col-12" name="fieldName-layer">
    <h6 class="label-class">Label Text</h6>
    <p class="description">Description text</p>
    <div class="form-element">
      <div data-uniqid="__uniqueid__" class="input-group-wrapper">
        <div class="input-group">
          <span class="input-group-text">prepend</span>
          <input type="text" class="valid-target form-control" name="field[name]"
                 value="" data-name="fieldName" data-rule-name="fieldName"
                 data-default="" />
          <span class="input-group-text">append</span>
        </div>
      </div>
    </div>
  </div>
</div>
```

### React Output
```html
<div class="form-field form-field--text">
  <label for="fieldName" class="form-label">
    Label Text
    <span class="form-label__required" aria-hidden="true"> *</span>
  </label>
  <div class="form-input-wrapper">
    <span class="form-input__prepend">prepend</span>
    <input type="text" id="fieldName" name="fieldName"
           class="form-input form-input--text" value="" />
    <span class="form-input__append">append</span>
  </div>
  <div class="form-error" role="alert" aria-live="polite">Error message</div>
  <p class="form-description">Description text</p>
</div>
```

## 2. Key Structural Differences

### 2.1 Wrapper Structure

| Feature | Legacy PHP | React |
|---------|-------------|-------|
| Outer wrapper | `div.form-element-wrapper` | `div.form-field` |
| Name attribute on wrapper | `name="fieldName-layer"` | None |
| Data unique ID | `data-uniqid="__uniqueid__"` on input-group-wrapper | None |
| Input group wrapper | `div.input-group-wrapper` > `div.input-group` | `div.form-input-wrapper` |

### 2.2 Label Structure

| Feature | Legacy PHP | React |
|---------|-------------|-------|
| Element | `<h6>` | `<label>` |
| Class | Custom `label_class` from spec | `form-label` + `label_class` |
| Required indicator | Not shown | `span.form-label__required` |
| htmlFor attribute | None | Matches input `id` |

### 2.3 Input Element Attributes

| Attribute | Legacy PHP | React |
|-----------|-------------|-------|
| `class` | `valid-target form-control` + `element_class` | `form-input form-input--{type}` + `input_class` |
| `name` | Bracket notation: `group[field]` | Dot notation: `group.field` |
| `data-name` | Property key | None |
| `data-rule-name` | Rule name for validation | None |
| `data-default` | Default value | None |
| `id` | None | Same as `path` |

### 2.4 Error Message Placeholder

| Feature | Legacy PHP | React |
|---------|-------------|-------|
| Structure | Validation adds dynamically via jQuery | `div.form-error` with `role="alert"` |
| ARIA attributes | None | `role="alert"` and `aria-live="polite"` |
| Location | Added after input dynamically | After input, before description |

### 2.5 Description Placement

| Feature | Legacy PHP | React |
|---------|-------------|-------|
| Location | Before form-element div | After error message |
| Element | `p.description` | `p.form-description` |
| Line breaks | Uses `nl2br()` | Plain text |

## 3. Missing in React Version

> 작성 시점의 격차 목록이다. ✅ = 구현 완료 (출처 파일 병기).

### 3.1 Critical for Validation Compatibility

1. ✅ **`data-rule-name` attribute** - Used by jQuery validation plugin to identify rules
   (`generator-react/src/utils/dataAttributes.ts` `getLegacyDataAttributes`)
2. ✅ **`data-name` attribute** - Property key for validation messages (같은 함수)
3. ✅ **`data-default` attribute** - Default value reference (같은 함수)
4. ✅ **`valid-target` class** - Used by jQuery validation to target elements
   (`dataAttributes.ts` `getInputClasses`/`getSelectClasses`/`getCheckboxClasses`)
5. ✅ **`name` attribute format** - bracket notation 변환 구현
   (`dataAttributes.ts` `toBracketNotation`/`toBracketNotationWithPrefix`)

### 3.2 Layout Compatibility

1. ✅ **`name="fieldName-layer"` on wrapper** - Used for dynamic show/hide via `display_target`
   (`generator-react/src/components/FormField.tsx`, `FormGroup.tsx` — dot 표기 `path-layer`)
2. ✅ **`data-uniqid` attribute** - Used for dynamic add/remove in multiple fields
   (`FormField.tsx`, `FormGroup.tsx`. 단, React 는 12 hex, PHP 는 13 hex —
   `tests/parity/README.md` 에 알려진 deviation 으로 기록됨)
3. ✅ **`input-group-wrapper` div** - Container for add/remove buttons in multiple fields
   (`FormField.tsx`, `FormGroup.tsx`)
4. **`clone-element` class** - Added to cloned elements (index > 1) — 미구현

### 3.3 Bootstrap Classes

1. ✅ **`form-control`** - Bootstrap input class (`dataAttributes.ts` `getInputClasses`)
2. ✅ **`form-select`** - Bootstrap select class (`dataAttributes.ts` `getSelectClasses`)
3. ✅ **`input-group`** - Bootstrap input group (`fields/TextField.tsx`)
4. ✅ **`input-group-text`** - For prepend/append (`fields/TextField.tsx`)
5. ✅ **`btn-group`** - For choice/multichoice button groups (`fields/ChoiceField.tsx`)
6. ✅ **`form-check`** - For checkbox/radio (`fields/CheckboxField.tsx`)

## 4. Detailed Element Comparisons

### 4.1 Text Input

**Legacy PHP:**
```html
<div class="input-group">
  <span class="input-group-text prepend-class">Prepend</span>
  <input type="text"
         class="valid-target form-control element-class"
         name="group[field]"
         value="value"
         data-name="field"
         data-rule-name="field"
         data-default="default"
         readonly="readonly"
         disabled="disabled"
         placeholder="placeholder"
         style="element-style"
         autocomplete="off" />
  <span class="input-group-text append-class">Append</span>
  <!--btn-->
</div>
```

**React:**
```html
<div class="form-input-wrapper">
  <span class="form-input__prepend">Prepend</span>
  <input type="text"
         id="group.field"
         name="group.field"
         value="value"
         class="form-input form-input--text input-class"
         placeholder="placeholder"
         maxlength="45"
         disabled
         readonly />
  <span class="form-input__append">Append</span>
</div>
```

### 4.2 Select Field

**Legacy PHP:**
```html
<div class="input-group">
  <span class="input-group-text">Prepend</span>
  <select class="valid-target form-select element-class"
          style="element-style"
          name="group[field]"
          data-name="field"
          data-rule-name="field"
          onchange="handler()"
          data-default="">
    <option value="">Select</option>
    <option value="1" selected="selected">Option 1</option>
    <optgroup label="Group">
      <option value="2">Option 2</option>
    </optgroup>
  </select>
  <span class="input-group-text">Append</span>
  <!--btn-->
</div>
```

**React:**
```html
<select id="group.field"
        name="group.field"
        value=""
        class="form-input form-input--select input-class"
        disabled>
  <option value="">Select</option>
  <option value="1">Option 1</option>
  <optgroup label="Group">
    <option value="2">Option 2</option>
  </optgroup>
</select>
```

### 4.3 Choice (Radio Button Group)

**Legacy PHP:**
```html
<div class="btn-group btn-group-toggle button-class" data-toggle="buttons">
  <input id="choice-field-random-1"
         class="valid-target btn-check input-class"
         type="radio"
         name="group[field]"
         autocomplete="off"
         data-name="field"
         data-rule-name="field"
         value="0"
         data-is-default="true"
         onchange="handler()"
         onclick="handler2()"
         data-init-change="true"
         checked="checked">
  <label for="choice-field-random-1" class="btn btn-switch element-class">
    <span>Option 1</span>
  </label>

  <input id="choice-field-random-2"
         class="valid-target btn-check input-class"
         type="radio"
         name="group[field]"
         value="1"
         data-is-default="false">
  <label for="choice-field-random-2" class="btn btn-switch element-class">
    <span>Option 2</span>
  </label>
</div>
```

**React (ChoiceField):**
```html
<div class="form-choice-wrapper">
  <input type="radio" id="group.field-0" name="group.field"
         value="0" checked class="form-choice__input" />
  <label for="group.field-0" class="form-choice__label">Option 1</label>

  <input type="radio" id="group.field-1" name="group.field"
         value="1" class="form-choice__input" />
  <label for="group.field-1" class="form-choice__label">Option 2</label>
</div>
```

### 4.4 Group with Multiple (Array Fields)

**Legacy PHP:**
```html
<div class="form-group group-class" style="group-style">
  <div class="form-element-wrapper class" name="items[]-layer">
    <h6>Items</h6>
    <div class="form-element">
      <!-- First item -->
      <div data-uniqid="__uniqueid1__" class="input-group-wrapper">
        <div class="input-group">
          <input class="valid-target form-control" name="group[items][__uniqueid1__][field]" ... />
          <span class="btn-group input-group-btn">
            <button type="button" class="btn btn-move-up">&nbsp;</button>
            <button type="button" class="btn btn-move-down">&nbsp;</button>
            <button class="btn btn-plus" data-multiple-max="5" type="button">&nbsp;</button>
            <button class="btn btn-minus" type="button">&nbsp;</button>
          </span>
        </div>
      </div>

      <!-- Cloned item -->
      <div data-uniqid="__uniqueid2__" class="input-group-wrapper clone-element">
        <div class="input-group">
          <input class="valid-target form-control" name="group[items][__uniqueid2__][field]" ... />
          <span class="btn-group input-group-btn">
            <button type="button" class="btn btn-move-up">&nbsp;</button>
            <button type="button" class="btn btn-move-down">&nbsp;</button>
            <button class="btn btn-plus" type="button">&nbsp;</button>
            <button class="btn btn-minus" type="button">&nbsp;</button>
          </span>
        </div>
      </div>
    </div>
  </div>
</div>
```

**React:**
```html
<div class="form-group form-group--multiple class">
  <label class="form-group__label">Items</label>
  <div class="form-group__items">
    <div class="form-group__item">
      <div class="form-group__item-header">
        <span class="form-group__item-index">1</span>
        <div class="form-group__item-sort">
          <button type="button" class="form-group__sort-btn form-group__sort-btn--up">...</button>
          <button type="button" class="form-group__sort-btn form-group__sort-btn--down">...</button>
        </div>
        <button type="button" class="form-group__remove-btn">remove</button>
      </div>
      <div class="form-group__item-fields">
        <div class="form-field">
          <input name="group.items.uniqueKey1.field" ... />
        </div>
      </div>
    </div>
  </div>
  <button type="button" class="form-group__add-btn">add</button>
</div>
```

## 5. Required Changes for React Version

> 작성 시점의 작업 목록이다. ✅ = 구현 완료. 코드 스니펫은 당시 제안이며
> 실제 구현은 `generator-react/src/utils/dataAttributes.ts` 등 출처 파일을 보라.

### 5.1 High Priority (Validation Compatibility)

1. ✅ **Add validation data attributes to inputs:**
   ```tsx
   <input
     data-name={name}
     data-rule-name={getRuleName(path)}
     data-default={spec.default ?? ''}
   />
   ```

2. ✅ **Add `valid-target` class to all form controls:**
   ```tsx
   const inputClasses = ['valid-target', 'form-control', ...];
   ```

3. ✅ **Convert name format from dots to brackets:**
   ```tsx
   // path: "group.field.subfield"
   // name: "group[field][subfield]"
   const bracketName = path
     .split('.')
     .reduce((acc, part, i) => i === 0 ? part : `${acc}[${part}]`, '');
   ```

### 5.2 Medium Priority (Layout Compatibility)

4. ✅ **Add layer name to wrapper divs:**
   ```tsx
   <div className="form-element-wrapper" name={`${path.replace(/\./g, '-')}-layer`}>
   ```

5. ✅ **Add data-uniqid to array item wrappers** (단, `clone-element` 클래스는 미구현):
   ```tsx
   <div data-uniqid={item.key} className={`input-group-wrapper ${index > 0 ? 'clone-element' : ''}`}>
   ```

6. ✅ **Change input wrapper structure:**
   ```tsx
   <div className="input-group">
     {prepend}
     <input className="valid-target form-control" ... />
     {append}
     {/* Placeholder for dynamic buttons */}
     {/* <!--btn--> */}
   </div>
   ```

### 5.3 Lower Priority (Bootstrap Compatibility)

7. ✅ **Use Bootstrap classes instead of custom:**
   - `form-control` instead of `form-input`
   - `form-select` instead of `form-input--select`
   - `input-group` instead of `form-input-wrapper`
   - `input-group-text` instead of `form-input__prepend`
   - `btn-group btn-group-toggle` for choice fields

8. ✅ **Use `<h6>` for labels in groups instead of `<label>`** (`FormField.tsx`, `FormGroup.tsx`)

9. ✅ **Move description before form element** (`FormField.tsx`)

### 5.4 Optional Enhancements

10. **Support `onchange`, `onclick` attributes from spec** — 미구현 (필드 레벨)

11. **Support `data-init-change` for initial trigger** — 미구현

12. ✅ **Support `data-is-default` on choice options** (`fields/ChoiceField.tsx`)

13. **Add `<!--btn-->` comment marker** — 해당 없음(N/A): React 는 HTML 주석을
    출력할 수 없고, parity 비교에서 주석은 정규화로 제외된다
    (`tests/parity/README.md` 규칙 (d))

## 6. Name Format Conversion

> ✅ 구현 완료 — `generator-react/src/utils/dataAttributes.ts` 의
> `toBracketNotation`/`toBracketNotationWithPrefix`/`toRuleNameNotation`.
> 아래 스니펫은 당시 제안 코드다.

### Current React (Dot Notation)
```
group.field.subfield
group.items.key1.field
```

### Required Legacy (Bracket Notation)
```
group[field][subfield]
group[items][key1][field]
```

### Conversion Function
```typescript
function toBracketNotation(dotPath: string): string {
  const parts = dotPath.split('.');
  return parts.reduce((acc, part, i) => {
    if (i === 0) return part;
    return `${acc}[${part}]`;
  }, '');
}
```

## 7. Validation Data Attributes Summary

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `data-name` | Property key for validation | `data-name="field"` |
| `data-rule-name` | Rule lookup key | `data-rule-name="group[field]"` |
| `data-default` | Default value | `data-default="0"` |
| `data-is-default` | Is this the default option | `data-is-default="true"` |
| `data-init-change` | Trigger change on load | `data-init-change="true"` |
| `data-multiple-max` | Max items for multiple | `data-multiple-max="5"` |

## 8. Class Name Mapping

| Legacy PHP | React (Current) | React (Should Be) |
|-------------|-----------------|-------------------|
| `form-element-wrapper` | `form-field` | Keep or add `form-element-wrapper` |
| `form-element` | `form-input-wrapper` | Add `form-element` wrapper |
| `form-group` | `form-group` | Same |
| `valid-target` | None | Add `valid-target` |
| `form-control` | `form-input` | Change to `form-control` |
| `form-select` | `form-input--select` | Change to `form-select` |
| `input-group` | `form-input-wrapper` | Change to `input-group` |
| `input-group-text` | `form-input__prepend` | Change to `input-group-text` |
| `input-group-wrapper` | None | Add wrapper |
| `clone-element` | None | Add for index > 0 |
| `btn-group btn-group-toggle` | `form-choice-wrapper` | Change for Bootstrap |
| `btn-check` | `form-choice__input` | Change to `btn-check` |
| `btn btn-switch` | `form-choice__label` | Change to `btn btn-switch` |

## 9. Implementation Priority

1. **Phase 1: Validation Compatibility**
   - Add `data-*` attributes
   - Add `valid-target` class
   - Convert name format to brackets

2. **Phase 2: Structure Alignment**
   - Add `name` attribute to wrapper divs
   - Add `data-uniqid` for multiple items
   - Adjust wrapper hierarchy

3. **Phase 3: Bootstrap Classes**
   - Replace custom classes with Bootstrap
   - Ensure CSS still works

4. **Phase 4: Event Handlers**
   - Support `onchange`, `onclick` from spec
   - Support `data-init-change`

## 10. Notes

- The Legacy PHP version heavily relies on jQuery for dynamic behavior
- The React version uses state management for the same functionality
- Validation in Legacy uses jQuery Validation plugin with custom extensions
- React uses `@form-spec/validator` for validation
- Both share the same YAML spec format, but HTML output differs significantly
