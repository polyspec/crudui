# Validator API Reference

Form Generator의 Validator는 모든 언어 구현체(JavaScript/Node.js, PHP, Go)에서 동일한 인터페이스를 제공합니다.

## 목차

- [인터페이스 개요](#인터페이스-개요)
- [생성자](#생성자)
- [validate() 메서드](#validate-메서드)
- [validateField() 메서드](#validatefield-메서드)
- [addRule() 메서드](#addrule-메서드)
- [에러 응답 형식](#에러-응답-형식)
- [사용 예제](#사용-예제)

---

## 인터페이스 개요

### JavaScript/TypeScript

```typescript
class Validator {
  constructor(spec: Spec)
  validate(data: object): ValidationResult
  validateField(path: string, value: any, allData: object): string | null
  addRule(name: string, fn: RuleFn): void
}

interface Spec {
  fields: Field[]
  rules?: Record<string, Rule>
}

interface Field {
  name: string
  type: string
  label?: string
  required?: boolean
  rules?: string[]
  fields?: Field[]  // 중첩 필드용
}

interface Rule {
  pattern?: string
  min?: number
  max?: number
  message: string
}

interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
}

interface ValidationError {
  path: string
  message: string
  value?: any
}

type RuleFn = (value: any, params: any[], allData: object) => string | null
```

### PHP

```php
<?php

class Validator
{
    public function __construct(array $spec) {}

    public function validate(array $data): ValidationResult {}

    public function validateField(string $path, mixed $value, array $allData): ?string {}

    public function addRule(string $name, callable $fn): void {}
}

class ValidationResult
{
    public bool $isValid;
    public array $errors; // ValidationError[]
}

class ValidationError
{
    public string $path;
    public string $message;
    public mixed $value;
}

// RuleFn 시그니처
// function(mixed $value, array $params, array $allData): ?string
```

### Go

```go
package validator

type Validator struct {
    spec Spec
}

func NewValidator(spec Spec) *Validator

func (v *Validator) Validate(data map[string]any) *ValidationResult

func (v *Validator) ValidateField(path string, value any, allData map[string]any) *string

func (v *Validator) AddRule(name string, fn RuleFn)

type Spec struct {
    Fields []Field            `json:"fields"`
    Rules  map[string]Rule    `json:"rules,omitempty"`
}

type Field struct {
    Name     string   `json:"name"`
    Type     string   `json:"type"`
    Label    string   `json:"label,omitempty"`
    Required bool     `json:"required,omitempty"`
    Rules    []string `json:"rules,omitempty"`
    Fields   []Field  `json:"fields,omitempty"`
}

type Rule struct {
    Pattern string `json:"pattern,omitempty"`
    Min     *int   `json:"min,omitempty"`
    Max     *int   `json:"max,omitempty"`
    Message string `json:"message"`
}

type ValidationResult struct {
    IsValid bool              `json:"isValid"`
    Errors  []ValidationError `json:"errors"`
}

type ValidationError struct {
    Path    string `json:"path"`
    Message string `json:"message"`
    Value   any    `json:"value,omitempty"`
}

type RuleFn func(value any, params []string, allData map[string]any) *string
```

---

## 생성자

Validator 인스턴스를 생성합니다. Spec 객체를 인자로 받아 검증 규칙을 초기화합니다.

### JavaScript/TypeScript

```typescript
const spec: Spec = {
  fields: [
    { name: 'email', type: 'email', required: true, rules: ['email'] },
    { name: 'age', type: 'number', rules: ['min:18', 'max:100'] }
  ],
  rules: {
    email: { pattern: '^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$', message: '유효한 이메일을 입력하세요' }
  }
};

const validator = new Validator(spec);
```

### PHP

```php
$spec = [
    'fields' => [
        ['name' => 'email', 'type' => 'email', 'required' => true, 'rules' => ['email']],
        ['name' => 'age', 'type' => 'number', 'rules' => ['min:18', 'max:100']]
    ],
    'rules' => [
        'email' => ['pattern' => '^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$', 'message' => '유효한 이메일을 입력하세요']
    ]
];

$validator = new Validator($spec);
```

### Go

```go
spec := Spec{
    Fields: []Field{
        {Name: "email", Type: "email", Required: true, Rules: []string{"email"}},
        {Name: "age", Type: "number", Rules: []string{"min:18", "max:100"}},
    },
    Rules: map[string]Rule{
        "email": {Pattern: `^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$`, Message: "유효한 이메일을 입력하세요"},
    },
}

validator := NewValidator(spec)
```

---

## validate() 메서드

전체 데이터 객체를 검증하고 결과를 반환합니다.

### 시그니처

| 언어 | 시그니처 |
|------|----------|
| JS/TS | `validate(data: object): ValidationResult` |
| PHP | `validate(array $data): ValidationResult` |
| Go | `Validate(data map[string]any) *ValidationResult` |

### 반환값

`ValidationResult` 객체를 반환합니다:
- `isValid`: 모든 검증 통과 시 `true`
- `errors`: 검증 실패한 필드들의 에러 목록

### JavaScript/TypeScript

```typescript
const data = {
  email: 'invalid-email',
  age: 15
};

const result = validator.validate(data);

console.log(result);
// {
//   isValid: false,
//   errors: [
//     { path: 'email', message: '유효한 이메일을 입력하세요', value: 'invalid-email' },
//     { path: 'age', message: '최소값은 18입니다', value: 15 }
//   ]
// }
```

### PHP

```php
$data = [
    'email' => 'invalid-email',
    'age' => 15
];

$result = $validator->validate($data);

var_dump($result->isValid);  // false
var_dump($result->errors);
// [
//   ValidationError { path: 'email', message: '유효한 이메일을 입력하세요', value: 'invalid-email' },
//   ValidationError { path: 'age', message: '최소값은 18입니다', value: 15 }
// ]
```

### Go

```go
data := map[string]any{
    "email": "invalid-email",
    "age":   15,
}

result := validator.Validate(data)

fmt.Println(result.IsValid)  // false
fmt.Println(result.Errors)
// [
//   {Path: "email", Message: "유효한 이메일을 입력하세요", Value: "invalid-email"},
//   {Path: "age", Message: "최소값은 18입니다", Value: 15}
// ]
```

---

## validateField() 메서드

단일 필드를 검증합니다. 실시간 폼 검증에 유용합니다.

### 시그니처

| 언어 | 시그니처 |
|------|----------|
| JS/TS | `validateField(path: string, value: any, allData: object): string \| null` |
| PHP | `validateField(string $path, mixed $value, array $allData): ?string` |
| Go | `ValidateField(path string, value any, allData map[string]any) *string` |

### 파라미터

| 파라미터 | 설명 |
|----------|------|
| `path` | 검증할 필드의 경로 (예: `"user.email"`, `"items[0].name"`) |
| `value` | 검증할 값 |
| `allData` | 전체 폼 데이터 (다른 필드 참조가 필요한 규칙용) |

### 반환값

- 검증 성공: `null` (Go에서는 `nil`)
- 검증 실패: 에러 메시지 문자열

### JavaScript/TypeScript

```typescript
const allData = { email: '', password: '1234', confirmPassword: '5678' };

// 단일 필드 검증
const emailError = validator.validateField('email', '', allData);
console.log(emailError);  // '이 필드는 필수입니다'

// 중첩 필드 검증
const nestedError = validator.validateField('user.profile.name', '', allData);
console.log(nestedError);  // '이름을 입력하세요'

// 배열 인덱스 필드 검증
const arrayError = validator.validateField('items[0].quantity', -1, allData);
console.log(arrayError);  // '0 이상의 값을 입력하세요'

// 검증 통과
const validResult = validator.validateField('email', 'user@example.com', allData);
console.log(validResult);  // null
```

### PHP

```php
$allData = ['email' => '', 'password' => '1234', 'confirmPassword' => '5678'];

// 단일 필드 검증
$emailError = $validator->validateField('email', '', $allData);
echo $emailError;  // '이 필드는 필수입니다'

// 중첩 필드 검증
$nestedError = $validator->validateField('user.profile.name', '', $allData);
echo $nestedError;  // '이름을 입력하세요'

// 검증 통과
$validResult = $validator->validateField('email', 'user@example.com', $allData);
var_dump($validResult);  // null
```

### Go

```go
allData := map[string]any{"email": "", "password": "1234", "confirmPassword": "5678"}

// 단일 필드 검증
emailError := validator.ValidateField("email", "", allData)
if emailError != nil {
    fmt.Println(*emailError)  // "이 필드는 필수입니다"
}

// 검증 통과
validResult := validator.ValidateField("email", "user@example.com", allData)
fmt.Println(validResult)  // nil
```

---

## addRule() 메서드

사용자 정의 검증 규칙을 추가합니다.

### 시그니처

| 언어 | 시그니처 |
|------|----------|
| JS/TS | `addRule(name: string, fn: RuleFn): void` |
| PHP | `addRule(string $name, callable $fn): void` |
| Go | `AddRule(name string, fn RuleFn)` |

### RuleFn 시그니처

커스텀 규칙 함수는 다음 파라미터를 받습니다:

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `value` | any | 검증할 값 |
| `params` | string[] | 규칙 파라미터 (예: `min:18`에서 `['18']`) |
| `allData` | object | 전체 폼 데이터 |

**반환값**: 에러 메시지 또는 `null`(검증 통과)

### JavaScript/TypeScript

```typescript
// 비밀번호 확인 규칙
validator.addRule('confirmPassword', (value, params, allData) => {
  const targetField = params[0] || 'password';
  if (value !== allData[targetField]) {
    return '비밀번호가 일치하지 않습니다';
  }
  return null;
});

// 한국 전화번호 규칙
validator.addRule('koreanPhone', (value, params, allData) => {
  const pattern = /^01[0-9]-\d{3,4}-\d{4}$/;
  if (!pattern.test(value)) {
    return '올바른 전화번호 형식이 아닙니다 (예: 010-1234-5678)';
  }
  return null;
});

// 파라미터가 있는 규칙
validator.addRule('divisibleBy', (value, params, allData) => {
  const divisor = parseInt(params[0], 10);
  if (value % divisor !== 0) {
    return `${divisor}로 나누어 떨어져야 합니다`;
  }
  return null;
});

// Spec에서 사용
const spec = {
  fields: [
    { name: 'password', type: 'password', rules: ['required', 'min:8'] },
    { name: 'confirmPassword', type: 'password', rules: ['required', 'confirmPassword:password'] },
    { name: 'phone', type: 'tel', rules: ['koreanPhone'] },
    { name: 'quantity', type: 'number', rules: ['divisibleBy:5'] }
  ]
};
```

### PHP

```php
// 비밀번호 확인 규칙
$validator->addRule('confirmPassword', function($value, $params, $allData) {
    $targetField = $params[0] ?? 'password';
    if ($value !== ($allData[$targetField] ?? null)) {
        return '비밀번호가 일치하지 않습니다';
    }
    return null;
});

// 한국 전화번호 규칙
$validator->addRule('koreanPhone', function($value, $params, $allData) {
    $pattern = '/^01[0-9]-\d{3,4}-\d{4}$/';
    if (!preg_match($pattern, $value)) {
        return '올바른 전화번호 형식이 아닙니다 (예: 010-1234-5678)';
    }
    return null;
});

// 사업자등록번호 규칙
$validator->addRule('businessNumber', function($value, $params, $allData) {
    // 사업자등록번호 검증 로직
    $cleaned = preg_replace('/[^0-9]/', '', $value);
    if (strlen($cleaned) !== 10) {
        return '사업자등록번호는 10자리입니다';
    }
    return null;
});
```

### Go

```go
// 비밀번호 확인 규칙
validator.AddRule("confirmPassword", func(value any, params []string, allData map[string]any) *string {
    targetField := "password"
    if len(params) > 0 {
        targetField = params[0]
    }

    strValue, ok := value.(string)
    if !ok {
        msg := "유효하지 않은 값입니다"
        return &msg
    }

    targetValue, ok := allData[targetField].(string)
    if !ok || strValue != targetValue {
        msg := "비밀번호가 일치하지 않습니다"
        return &msg
    }
    return nil
})

// 한국 전화번호 규칙
validator.AddRule("koreanPhone", func(value any, params []string, allData map[string]any) *string {
    strValue, ok := value.(string)
    if !ok {
        msg := "유효하지 않은 값입니다"
        return &msg
    }

    pattern := regexp.MustCompile(`^01[0-9]-\d{3,4}-\d{4}$`)
    if !pattern.MatchString(strValue) {
        msg := "올바른 전화번호 형식이 아닙니다 (예: 010-1234-5678)"
        return &msg
    }
    return nil
})
```

---

## 에러 응답 형식

모든 구현체는 동일한 JSON 구조의 에러 응답을 반환합니다.

### ValidationResult

```json
{
  "isValid": false,
  "errors": [
    {
      "path": "email",
      "message": "유효한 이메일을 입력하세요",
      "value": "invalid-email"
    },
    {
      "path": "user.profile.age",
      "message": "최소값은 18입니다",
      "value": 15
    },
    {
      "path": "items[0].quantity",
      "message": "필수 항목입니다",
      "value": null
    }
  ]
}
```

### ValidationError 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `path` | string | 에러가 발생한 필드의 전체 경로. 중첩 객체는 점(.)으로, 배열은 대괄호([])로 표시 |
| `message` | string | 사용자에게 표시할 에러 메시지 |
| `value` | any | 검증 실패한 실제 값 (선택적, 디버깅용) |

### Path 표기법

```
# 단순 필드
email                    -> data.email

# 중첩 객체
user.profile.name        -> data.user.profile.name

# 배열 요소
items[0].name            -> data.items[0].name
items[2].options[1].key  -> data.items[2].options[1].key

# 혼합
order.items[0].product.sku -> data.order.items[0].product.sku
```

---

## 사용 예제

### 회원가입 폼 검증

#### JavaScript/TypeScript

```typescript
import { Validator } from 'form-generator';

const signupSpec = {
  fields: [
    {
      name: 'email',
      type: 'email',
      required: true,
      rules: ['email'],
      label: '이메일'
    },
    {
      name: 'password',
      type: 'password',
      required: true,
      rules: ['min:8', 'strongPassword'],
      label: '비밀번호'
    },
    {
      name: 'confirmPassword',
      type: 'password',
      required: true,
      rules: ['confirmPassword:password'],
      label: '비밀번호 확인'
    },
    {
      name: 'age',
      type: 'number',
      rules: ['min:14', 'max:120'],
      label: '나이'
    },
    {
      name: 'profile',
      type: 'object',
      fields: [
        { name: 'nickname', type: 'text', required: true, rules: ['min:2', 'max:20'] },
        { name: 'bio', type: 'textarea', rules: ['max:500'] }
      ]
    }
  ],
  rules: {
    email: {
      pattern: '^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$',
      message: '유효한 이메일 주소를 입력하세요'
    }
  }
};

const validator = new Validator(signupSpec);

// 강력한 비밀번호 규칙 추가
validator.addRule('strongPassword', (value, params, allData) => {
  if (!/[A-Z]/.test(value)) return '대문자를 포함해야 합니다';
  if (!/[a-z]/.test(value)) return '소문자를 포함해야 합니다';
  if (!/[0-9]/.test(value)) return '숫자를 포함해야 합니다';
  if (!/[!@#$%^&*]/.test(value)) return '특수문자를 포함해야 합니다';
  return null;
});

// 비밀번호 확인 규칙 추가
validator.addRule('confirmPassword', (value, params, allData) => {
  const targetField = params[0] || 'password';
  if (value !== allData[targetField]) {
    return '비밀번호가 일치하지 않습니다';
  }
  return null;
});

// 폼 데이터 검증
const formData = {
  email: 'user@example.com',
  password: 'SecurePass123!',
  confirmPassword: 'SecurePass123!',
  age: 25,
  profile: {
    nickname: '홍길동',
    bio: '안녕하세요!'
  }
};

const result = validator.validate(formData);

if (result.isValid) {
  console.log('회원가입 성공!');
} else {
  result.errors.forEach(error => {
    console.error(`${error.path}: ${error.message}`);
  });
}
```

#### PHP

```php
<?php

use FormGenerator\Validator;

$signupSpec = [
    'fields' => [
        [
            'name' => 'email',
            'type' => 'email',
            'required' => true,
            'rules' => ['email'],
            'label' => '이메일'
        ],
        [
            'name' => 'password',
            'type' => 'password',
            'required' => true,
            'rules' => ['min:8', 'strongPassword'],
            'label' => '비밀번호'
        ],
        [
            'name' => 'confirmPassword',
            'type' => 'password',
            'required' => true,
            'rules' => ['confirmPassword:password'],
            'label' => '비밀번호 확인'
        ],
        [
            'name' => 'profile',
            'type' => 'object',
            'fields' => [
                ['name' => 'nickname', 'type' => 'text', 'required' => true, 'rules' => ['min:2', 'max:20']],
                ['name' => 'bio', 'type' => 'textarea', 'rules' => ['max:500']]
            ]
        ]
    ],
    'rules' => [
        'email' => [
            'pattern' => '^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$',
            'message' => '유효한 이메일 주소를 입력하세요'
        ]
    ]
];

$validator = new Validator($signupSpec);

// 커스텀 규칙 추가
$validator->addRule('strongPassword', function($value, $params, $allData) {
    if (!preg_match('/[A-Z]/', $value)) return '대문자를 포함해야 합니다';
    if (!preg_match('/[a-z]/', $value)) return '소문자를 포함해야 합니다';
    if (!preg_match('/[0-9]/', $value)) return '숫자를 포함해야 합니다';
    if (!preg_match('/[!@#$%^&*]/', $value)) return '특수문자를 포함해야 합니다';
    return null;
});

$validator->addRule('confirmPassword', function($value, $params, $allData) {
    $targetField = $params[0] ?? 'password';
    if ($value !== ($allData[$targetField] ?? null)) {
        return '비밀번호가 일치하지 않습니다';
    }
    return null;
});

// API 엔드포인트에서 사용
$formData = json_decode(file_get_contents('php://input'), true);
$result = $validator->validate($formData);

header('Content-Type: application/json');

if ($result->isValid) {
    echo json_encode(['success' => true, 'message' => '회원가입 성공!']);
} else {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'errors' => array_map(fn($e) => [
            'path' => $e->path,
            'message' => $e->message
        ], $result->errors)
    ]);
}
```

#### Go

```go
package main

import (
    "encoding/json"
    "fmt"
    "net/http"
    "regexp"

    "github.com/example/form-generator/validator"
)

func main() {
    spec := validator.Spec{
        Fields: []validator.Field{
            {
                Name:     "email",
                Type:     "email",
                Required: true,
                Rules:    []string{"email"},
                Label:    "이메일",
            },
            {
                Name:     "password",
                Type:     "password",
                Required: true,
                Rules:    []string{"min:8", "strongPassword"},
                Label:    "비밀번호",
            },
            {
                Name:     "confirmPassword",
                Type:     "password",
                Required: true,
                Rules:    []string{"confirmPassword:password"},
                Label:    "비밀번호 확인",
            },
            {
                Name: "profile",
                Type: "object",
                Fields: []validator.Field{
                    {Name: "nickname", Type: "text", Required: true, Rules: []string{"min:2", "max:20"}},
                    {Name: "bio", Type: "textarea", Rules: []string{"max:500"}},
                },
            },
        },
        Rules: map[string]validator.Rule{
            "email": {
                Pattern: `^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$`,
                Message: "유효한 이메일 주소를 입력하세요",
            },
        },
    }

    v := validator.NewValidator(spec)

    // 커스텀 규칙 추가
    v.AddRule("strongPassword", func(value any, params []string, allData map[string]any) *string {
        str, ok := value.(string)
        if !ok {
            msg := "유효하지 않은 값입니다"
            return &msg
        }

        checks := []struct {
            pattern string
            message string
        }{
            {`[A-Z]`, "대문자를 포함해야 합니다"},
            {`[a-z]`, "소문자를 포함해야 합니다"},
            {`[0-9]`, "숫자를 포함해야 합니다"},
            {`[!@#$%^&*]`, "특수문자를 포함해야 합니다"},
        }

        for _, check := range checks {
            if matched, _ := regexp.MatchString(check.pattern, str); !matched {
                return &check.message
            }
        }
        return nil
    })

    v.AddRule("confirmPassword", func(value any, params []string, allData map[string]any) *string {
        targetField := "password"
        if len(params) > 0 {
            targetField = params[0]
        }

        strValue, _ := value.(string)
        targetValue, _ := allData[targetField].(string)

        if strValue != targetValue {
            msg := "비밀번호가 일치하지 않습니다"
            return &msg
        }
        return nil
    })

    // HTTP 핸들러
    http.HandleFunc("/api/signup", func(w http.ResponseWriter, r *http.Request) {
        var formData map[string]any
        json.NewDecoder(r.Body).Decode(&formData)

        result := v.Validate(formData)

        w.Header().Set("Content-Type", "application/json")

        if result.IsValid {
            json.NewEncoder(w).Encode(map[string]any{
                "success": true,
                "message": "회원가입 성공!",
            })
        } else {
            w.WriteHeader(http.StatusBadRequest)
            json.NewEncoder(w).Encode(map[string]any{
                "success": false,
                "errors":  result.Errors,
            })
        }
    })

    fmt.Println("Server running on :8080")
    http.ListenAndServe(":8080", nil)
}
```

### 실시간 필드 검증 (React 예제)

```tsx
import React, { useState, useCallback } from 'react';
import { Validator } from 'form-generator';

const validator = new Validator(spec);

function SignupForm() {
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});

  const handleBlur = useCallback((fieldPath: string, value: any) => {
    const error = validator.validateField(fieldPath, value, formData);
    setErrors(prev => ({
      ...prev,
      [fieldPath]: error
    }));
  }, [formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validator.validate(formData);

    if (!result.isValid) {
      const errorMap = result.errors.reduce((acc, err) => {
        acc[err.path] = err.message;
        return acc;
      }, {} as Record<string, string>);
      setErrors(errorMap);
      return;
    }

    // 서버에 제출
    await submitToServer(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        name="email"
        onBlur={(e) => handleBlur('email', e.target.value)}
        onChange={(e) => setFormData({...formData, email: e.target.value})}
      />
      {errors.email && <span className="error">{errors.email}</span>}

      {/* 나머지 필드... */}
    </form>
  );
}
```

---

## 내장 규칙

모든 구현체는 다음 내장 규칙을 지원합니다:

| 규칙 | 파라미터 | 설명 | 예시 |
|------|----------|------|------|
| `required` | - | 필수 입력 | `required` |
| `email` | - | 이메일 형식 | `email` |
| `min` | number | 최소값/최소길이 | `min:8` |
| `max` | number | 최대값/최대길이 | `max:100` |
| `minLength` | number | 문자열 최소 길이 | `minLength:2` |
| `maxLength` | number | 문자열 최대 길이 | `maxLength:50` |
| `pattern` | regex | 정규식 패턴 | `pattern:^[A-Z]+$` |
| `numeric` | - | 숫자만 허용 | `numeric` |
| `alpha` | - | 알파벳만 허용 | `alpha` |
| `alphanumeric` | - | 알파벳+숫자 | `alphanumeric` |
| `url` | - | URL 형식 | `url` |
| `date` | format? | 날짜 형식 | `date:YYYY-MM-DD` |
| `in` | values | 허용 값 목록 | `in:active,inactive,pending` |
| `notIn` | values | 금지 값 목록 | `notIn:admin,root` |

---

## 타입 정의 파일

### TypeScript (index.d.ts)

```typescript
declare module 'form-generator' {
  export interface Spec {
    fields: Field[];
    rules?: Record<string, Rule>;
  }

  export interface Field {
    name: string;
    type: string;
    label?: string;
    required?: boolean;
    rules?: string[];
    fields?: Field[];
  }

  export interface Rule {
    pattern?: string;
    min?: number;
    max?: number;
    message: string;
  }

  export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
  }

  export interface ValidationError {
    path: string;
    message: string;
    value?: any;
  }

  export type RuleFn = (
    value: any,
    params: string[],
    allData: Record<string, any>
  ) => string | null;

  export class Validator {
    constructor(spec: Spec);
    validate(data: Record<string, any>): ValidationResult;
    validateField(path: string, value: any, allData: Record<string, any>): string | null;
    addRule(name: string, fn: RuleFn): void;
  }
}
```
