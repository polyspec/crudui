# Limepie Validate.js Analysis

This document provides a comprehensive analysis of the original Limepie validation system to ensure React version compatibility.

## Overview

The Limepie validation system consists of two main components:

1. **dist.validate.js** - Core validation library (jQuery-based)
2. **dist.validate.custom.js** - Custom extensions and AJAX form handling
3. **form.validator.js** - Alternative standalone validator class

---

## 1. Core Validation Library (dist.validate.js)

### File Location
```
/document/web/assets/modern/common/js/dist.validate-1.0.26.js
```

### Initialization

The validator is initialized on a form element:

```javascript
$(form).validate({
    spec: specObject  // YAML-derived specification object
});
```

### Key Attributes

| Attribute | Description | Example |
|-----------|-------------|---------|
| `class="valid-target"` | Marks element for validation | `<input class="valid-target" ...>` |
| `data-rule-name` | Links element to spec rule | `data-rule-name="common.name"` |
| `data-name` | Human-readable field name | `data-name="is_common"` |
| `name` | Form field name (array notation) | `name="common[name]"` |

### Validation Triggering

The validator listens to these events on `.valid-target` elements:

```javascript
$(this.currentForm)
    .on("focusin.validate", selector, delegate)
    .on("focusout.validate", selector, delegate)
    .on("keyup.validate", selector, delegate)
    .on("change.validate", selector, delegate)
    .on("click", "select.valid-target, option.valid-target, [type='radio'].valid-target, [type='checkbox'].valid-target", delegate);
```

### Key Methods

#### `loadvalid(focused = false)`
Validates all `.valid-target` elements in the form.

```javascript
$form.validate().loadvalid();  // Returns boolean
```

#### `loadvalidWithAnimation()`
Async version with progress UI support (chunks of 30 elements at a time).

```javascript
$form.validate().loadvalidWithAnimation().then(({ isValid, element }) => {
    // Handle result
});
```

#### `checkByElement(element, event)`
Validates a single element.

```javascript
$(element).closest("form").data("validator").checkByElement(element, event);
```

#### `checkByElements(elements)`
Validates multiple elements.

```javascript
$form.validate().checkByElements(targetElements);
```

#### `setSpec(spec)` / `getSpec()`
Dynamically update or retrieve the validation specification.

```javascript
var spec = $form.validate().getSpec();
spec.properties.fieldName = newRules;
$form.validate().setSpec(spec);
```

---

## 2. Validation Rules (Built-in Methods)

### Core Rules

| Rule | Description | Example |
|------|-------------|---------|
| `required` | Field must have value | `required: true` or conditional |
| `email` | Valid email format | `email: true` |
| `url` | Valid URL format | `url: true` |
| `date` | Valid date | `date: true` |
| `dateISO` | ISO date format | `dateISO: true` |
| `number` | Numeric value | `number: true` |
| `digits` | Only digits | `digits: true` |
| `minlength` | Minimum characters | `minlength: 5` |
| `maxlength` | Maximum characters | `maxlength: 100` |
| `rangelength` | Character range | `rangelength: [5, 100]` |
| `min` | Minimum value | `min: 0` |
| `max` | Maximum value | `max: 1000` |
| `range` | Value range | `range: [0, 1000]` |
| `step` | Step value | `step: 5` |
| `equalTo` | Match another field | `equalTo: "password"` |

### Custom Rules (via `$.validator.addMethod`)

| Rule | Description | Example |
|------|-------------|---------|
| `in` | Value in array | `in: ["a", "b", "c"]` |
| `even` | Even number | `even: true` |
| `odd` | Odd number | `odd: true` |
| `match` | Regex pattern | `match: "[0-9a-zA-Z_\\-]{1,44}"` |
| `notEqual` | Not equal to data-keyword | `notEqual: true` |
| `password8` | Strong password | `password8: true` |
| `unique` | Unique within group | `unique: true` or `unique: "group"` |
| `mincount` | Minimum checked count | `mincount: 2` |
| `maxcount` | Maximum checked count | `maxcount: 5` |
| `minformcount` | Minimum form elements | `minformcount: 1` |
| `maxformcount` | Maximum form elements | `maxformcount: 10` |
| `enddate` | End date >= start | `enddate: "start_dt"` |
| `maxTo` | Value <= target | `maxTo: "*.target_field"` |
| `accept` | File MIME type | `accept: "image/*"` |
| `recaptcha` | reCAPTCHA validation | `recaptcha: true` |

---

## 3. Conditional Validation (depend system)

### Simple Boolean
```yaml
rules:
    required: true
```

### Dependent on Another Field
```yaml
rules:
    required: ..is_display == 2  # Parent field condition
```

### Complex Conditions
```yaml
rules:
    required: common.is_option == 1 && option.groups.*.name != ""
```

### Path Notation

| Pattern | Meaning |
|---------|---------|
| `..field` | Parent level field |
| `*.field` | Wildcard for array index |
| `field.subfield` | Nested field |
| `.field` | Current group field |

### Operators Supported

```javascript
// Comparison operators
"==", "!=", "<=", ">=", ">", "<"

// Logical operators
"&&", "||"

// Special operators
"in"   // Check if value is in list
"&"    // Bitwise AND
"|"    // Bitwise OR (for multi-value checks)
```

---

## 4. Error Message Display

### Error Container Structure
```html
<div class="input-group-wrapper">
    <input class="valid-target" name="field_name" ...>
    <!-- Error message inserted here -->
    <div class="message message_field_name" style="color:red">
        Error message text
    </div>
</div>
```

### Message ID Generation
```javascript
var messageId = elementName
    .replace(/\[\]$/, "")
    .replace(/\[/g, "_")
    .replace(/\]/g, "")
    .replace(/=/g, "_")
    .replace(/&/g, "_");
```

### Custom Messages (from spec)
```yaml
messages:
    ko:
        maxlength: "{0}자로 입력"
        required: "필수 항목입니다."
```

### Default Messages (fallback)
```javascript
$.validator.messages = {
    required: "필수 항목입니다.",
    email: "유효하지 않은 E-Mail주소입니다.",
    url: "유효하지 않은 URL입니다.",
    // ...
};
```

---

## 5. Form Integration

### HTML Form Setup
```html
<form data-autofocus="true" data-lang="ko">
    <input type="hidden" name="__submitted__" value="go">
    <input type="hidden" name="submitted" value="">

    <div class="input-group-wrapper">
        <input
            class="valid-target form-control"
            type="text"
            name="common[name]"
            data-rule-name="common.name"
            data-name="상품명"
        >
    </div>
</form>
```

### Form Submission Flow
```javascript
async function submitFunction(formElement, e, confirmMessage, validate_error_message, captcha) {
    // 1. Show loading
    ajaxLoading(formElement, "폼 검사 중");

    // 2. Validate with animation
    const { isValid, element } = await $form.validate().loadvalidWithAnimation();

    // 3. If valid, proceed with AJAX
    if (isValid) {
        // Process captcha if needed
        // Show confirmation dialog
        // Submit via AJAX
    } else {
        // Focus on first invalid element
        focusElement(element);
    }
}
```

---

## 6. YAML Spec Structure

### Field Definition
```yaml
field_name:
    label: 필드 라벨
    type: text|number|email|date|datetime|select|choice|multichoice|image|...
    default: default_value
    rules:
        required: true
        minlength: 1
        maxlength: 100
        match: "regex_pattern"
    messages:
        ko:
            required: "필수입니다"
            maxlength: "{0}자 이하로 입력"
    description: 설명 텍스트
    class: CSS classes
    onchange: |
        JavaScript code
```

### Group Definition
```yaml
group_name:
    type: group
    label: 그룹 라벨
    class: row gx-1
    properties:
        field1:
            # field definition
        field2:
            # field definition
```

### Multiple/Array Fields
```yaml
items[]:
    type: group
    multiple: true
    sortable: true
    properties:
        name:
            type: text
            rules:
                required: true
                unique: true
```

---

## 7. Dynamic Validation

### Updating Spec at Runtime
```javascript
// Get current spec
var spec = $form.validate().getSpec();

// Modify spec
spec.properties.new_field = {
    rules: { required: true },
    messages: { required: "Required" }
};

// Apply new spec
$form.validate().setSpec(spec);

// Re-validate affected elements
$form.validate().checkByElements($('.valid-target'));
```

### Adding Elements Dynamically
```javascript
// After cloning/adding new form elements
var newElements = parentForm.find('.valid-target');
$form.validate().checkByElements(newElements);
```

---

## 8. Alternative Validator (form.validator.js)

This is a separate, simpler validator using `data-validate-*` attributes:

### Attributes

| Attribute | Description |
|-----------|-------------|
| `data-validate="text"` | Text input validation |
| `data-validate="group"` | Checkbox/radio group |
| `data-validate="selector"` | Select/multi-select |
| `data-validate-required="true"` | Required field |
| `data-validate-pattern="regex"` | Pattern matching |
| `data-validate-min-length="N"` | Min length |
| `data-validate-max-length="N"` | Max length |
| `data-validate-method="email"` | Predefined method |
| `data-validate-message="..."` | Error message |
| `data-validate-unique="selector"` | Uniqueness check |
| `data-validate-group-target-name="..."` | Group target |

### Built-in Methods
```javascript
validationMethods = {
    email, domain, url, numeric, alphabet, alphanumeric,
    phone_kr, phone_jp, phone_us, phone_global,
    postal_code_kr, postal_code_jp, postal_code_us, postal_code_global,
    date, time, datetime, datetime_iso8601,
    ipv4, credit_card
}
```

---

## 9. Key Compatibility Requirements for React Version

### Must Support

1. **Spec-based validation rules** from YAML configuration
2. **Conditional required** using path expressions (`..field == value`)
3. **Array/multiple field handling** with `[]` notation
4. **Real-time validation** on focus, blur, change, keyup
5. **Custom validation methods** registration
6. **Error message placeholders** (`{0}`, `{1}`)
7. **Multilingual messages** support
8. **Dynamic spec updates** at runtime

### Element Classes
- `.valid-target` - Elements to validate
- `.input-group-wrapper` - Error message container
- `.message_[fieldId]` - Error message element

### Data Attributes
- `data-rule-name` - Links to spec rule path
- `data-name` - Display name for the field
- `name` - Form field name with array notation

### Event Flow
1. User interaction triggers validation
2. `checkByElement()` validates single field
3. `depend()` checks conditional rules
4. Error/success display updates DOM
5. Related fields may re-validate (wave system)

---

## 10. File Summary

| File | Purpose | Size |
|------|---------|------|
| `dist.validate-1.0.26.js` | Core validation library | ~1883 lines |
| `dist.validate.custom-1.0.45.js` | AJAX, file handling, UI helpers | ~2000+ lines |
| `form.validator.0.0.28.js` | Alternative data-attribute validator | ~1648 lines |

---

## Conclusion

The Limepie validation system is a comprehensive jQuery-based form validation solution that:

1. Uses YAML specifications for declarative rule definitions
2. Supports complex conditional validation
3. Handles dynamic forms with array notation
4. Provides real-time validation feedback
5. Integrates with AJAX form submission

For React compatibility, the key challenge is converting the jQuery DOM operations and event handling to React's declarative model while maintaining the spec structure and validation logic.
