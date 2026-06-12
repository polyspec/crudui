# Limepie Validate.js Backward Compatibility Test

This test demonstrates that React-generated forms work seamlessly with the original Limepie `validate.js` library.

## Purpose

Prove that:
1. React components can output HTML compatible with Limepie validate.js
2. Both plain HTML and React forms produce identical validation results
3. Existing Limepie validation rules and messages work unchanged

## Files

```
limepie-validate-test/
├── lib/
│   └── dist.validate.js    # Original Limepie validate.js (legacy.0.26)
├── index.html              # Side-by-side comparison (Plain HTML vs React)
├── react-form.jsx          # React form component
└── README.md               # This file
```

## How to Run

### Option 1: Simple HTTP Server

```bash
# from the repository root
cd examples/limepie-validate-test
python3 -m http.server 8080
```

Then open:
- http://localhost:8080/index.html - Side-by-side comparison

### Option 2: Live Server (VS Code)

Right-click on `index.html` and select "Open with Live Server"

## Key Requirements for Compatibility

### HTML Structure

React components must output this structure:

```html
<div class="input-group-wrapper">
    <input
        class="form-control valid-target"
        name="fieldname"
        data-rule-name="fieldname"
    >
</div>
```

Required attributes:
- `class="valid-target"` - Marks element for validation
- `name="fieldname"` - Form field name
- `data-rule-name="fieldname"` - Maps to validation spec property

### Validation Spec

The validation spec follows Limepie format:

```javascript
const validationSpec = {
    properties: {
        fieldname: {
            type: 'string',
            rules: {
                required: true,
                minlength: 3
            },
            messages: {
                required: 'This field is required.',
                minlength: 'Minimum 3 characters.'
            }
        }
    }
};
```

### Initializing Validator

```javascript
const validator = $('form').validate({
    spec: validationSpec
});

// Validate all fields
const isValid = validator.loadvalid(true);
```

## Test Cases

Verify these scenarios manually in `index.html` (an automated `test-runner.html`
no longer exists in this directory):

1. Empty form fails validation
2. Valid complete form passes
3. Username too short fails
4. Invalid email fails
5. Password mismatch fails
6. Age below minimum fails
7. Age above maximum fails
8. Optional age can be empty
9. Unchecked agreement fails
10. Missing country fails

## React Component Pattern

```jsx
function ValidatedInput({ type, name, id, label, placeholder }) {
    return (
        <div className="input-group-wrapper">
            <label htmlFor={id} className="form-label">{label}</label>
            <input
                type={type}
                className="form-control valid-target"
                id={id}
                name={name}
                data-rule-name={name}
                placeholder={placeholder}
            />
        </div>
    );
}
```

## Validation Rules Supported

- `required` - Field must have a value
- `minlength` - Minimum character length
- `maxlength` - Maximum character length
- `min` - Minimum numeric value
- `max` - Maximum numeric value
- `email` - Valid email format
- `url` - Valid URL format
- `digits` - Numbers only
- `number` - Valid number format
- `equalTo` - Must match another field
- `match` - Regex pattern matching
- `unique` - Unique value check
- And more...

## Conclusion

React forms that follow the HTML structure requirements work identically with the original Limepie validate.js, confirming full backward compatibility with existing Limepie systems.
