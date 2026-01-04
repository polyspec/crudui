# Limepie PHP vs React Form Builder Comparison

This example demonstrates and compares validation behavior between the original Limepie PHP form validation system and the new React form builder.

## Purpose

The goal is to verify that the React form builder produces **identical validation results** to the original Limepie PHP system. This ensures backward compatibility when migrating from PHP to React-based forms.

## Files

- `index.html` - Main comparison page with side-by-side forms
- `spec.yaml` - YAML specification for the contact form
- `js/dist.validate-1.0.26.js` - Original Limepie validation library (jQuery-based)
- `js/dist.validate.custom-1.0.45.js` - Limepie custom validation extensions (AJAX utilities)

## How to Use

### 1. Start a Local Server

Since the page uses ES modules and fetch, you need to serve it via HTTP:

```bash
# Using Python 3
python3 -m http.server 8080

# Using Node.js
npx serve .

# Using PHP
php -S localhost:8080
```

### 2. Open the Comparison Page

Navigate to `http://localhost:8080` in your browser.

### 3. Test Validation

1. **Enter data** in either form - values automatically sync between both forms
2. **Click "Limepie 검증 실행"** to validate using the original PHP validation
3. **Click "React 검증 실행"** to validate using the React implementation
4. **Compare results** in the bottom panel

### 4. Expected Results

- Both validators should detect the same fields with errors
- Error messages should be identical (or semantically equivalent)
- The comparison status should show "IDENTICAL" for valid implementations

## Test Cases

### Required Field Validation
| Input | Limepie Expected | React Expected |
|-------|-----------------|----------------|
| Empty name | "이름을 입력해주세요." | "이름을 입력해주세요." |
| Empty email | "이메일을 입력해주세요." | "이메일을 입력해주세요." |
| Empty category | "문의 유형을 선택해주세요." | "문의 유형을 선택해주세요." |
| Empty message | "문의 내용을 입력해주세요." | "문의 내용을 입력해주세요." |
| Agree unchecked | "개인정보 수집에 동의해주세요." | "개인정보 수집에 동의해주세요." |

### Length Validation
| Input | Limepie Expected | React Expected |
|-------|-----------------|----------------|
| Name "A" (1 char) | "이름은 최소 2자 이상이어야 합니다." | "이름은 최소 2자 이상이어야 합니다." |
| Message "Short" | "문의 내용은 최소 10자 이상이어야 합니다." | "문의 내용은 최소 10자 이상이어야 합니다." |

### Email Validation
| Input | Limepie Expected | React Expected |
|-------|-----------------|----------------|
| "invalid" | "올바른 이메일 형식으로 입력해주세요." | "올바른 이메일 형식으로 입력해주세요." |
| "test@" | "올바른 이메일 형식으로 입력해주세요." | "올바른 이메일 형식으로 입력해주세요." |
| "test@domain.com" | Valid | Valid |

### Pattern Matching (Phone)
| Input | Limepie Expected | React Expected |
|-------|-----------------|----------------|
| "1234" | "올바른 전화번호 형식으로 입력해주세요." | "올바른 전화번호 형식으로 입력해주세요." |
| "010-1234-5678" | Valid | Valid |
| Empty | Valid (optional) | Valid (optional) |

## Architecture

```
┌─────────────────────┐      ┌─────────────────────┐
│   Limepie PHP       │      │   React Form        │
│   (jQuery-based)    │ ←──→ │   Builder           │
├─────────────────────┤      ├─────────────────────┤
│ • dist.validate.js  │      │ • Simple validators │
│ • DOM manipulation  │      │ • State-based       │
│ • .valid-target     │      │ • Controlled inputs │
│ • data-rule-name    │      │ • Error state       │
└─────────────────────┘      └─────────────────────┘
           │                            │
           └────────┬───────────────────┘
                    │
           ┌────────▼────────┐
           │  Comparison     │
           │  Panel          │
           ├─────────────────┤
           │ • Field errors  │
           │ • Match status  │
           │ • Differences   │
           └─────────────────┘
```

## Key Validation Rules

The comparison uses these validation rules from `dist.validate-1.0.26.js`:

1. **required** - Field must have a value
2. **minlength** - Minimum character length
3. **maxlength** - Maximum character length
4. **email** - Valid email format
5. **match** - Regular expression pattern matching

## Notes

- The Limepie validator uses jQuery and DOM manipulation
- The React validator uses controlled components and state
- Both use the same validation spec format
- Form values are synced bidirectionally for easy comparison
- Error messages use the same format string replacement (`{0}`, `{1}`, etc.)

## Troubleshooting

### "Validation Results DIFFER"

Check for these common issues:
1. **Different email regex** - Limepie uses a specific regex pattern
2. **Required checkbox handling** - Ensure both check for `true` value
3. **Empty string vs undefined** - Handle both cases consistently

### "Nothing selected, can't validate"

The Limepie validator requires a form element. Make sure:
1. Form has the correct ID
2. Inputs have `valid-target` class
3. Inputs have `data-rule-name` attribute
