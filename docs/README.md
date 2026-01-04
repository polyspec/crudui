# Form Generator

YAML 기반 폼 정의 시스템으로, 다중 언어 검증 및 React 폼 빌더를 제공합니다.

## 프로젝트 개요

Form Generator는 YAML 스펙 파일을 통해 폼을 정의하고, JavaScript/Node.js, PHP, Go에서 동일한 검증 로직을 실행할 수 있는 크로스 플랫폼 폼 시스템입니다.

### 핵심 목표

1. **단일 스펙, 다중 구현**: YAML로 한 번 정의하면 모든 언어에서 동일하게 동작
2. **멱등성 보장**: 동일 입력에 대해 모든 언어에서 동일한 검증 결과 반환
3. **Limepie PHP 호환**: 기존 Limepie 시스템의 폼 스펙과 완전 호환
4. **복잡한 폼 지원**: 1,318줄 규모의 ProductNft/Spec/Create.yml 같은 복잡한 e-commerce 폼 완벽 지원

## 디렉토리 구조

```
form-generator/
├── docs/                      # 문서
│   └── README.md             # 프로젝트 문서 (현재 파일)
├── react/                     # React 폼 빌더
│   └── src/
│       ├── components/       # 폼 컴포넌트 (Input, Select, Group 등)
│       ├── context/          # FormContext, ValidationContext
│       └── hooks/            # useForm, useField, useValidation
├── validator/                 # 다중 언어 검증기
│   ├── js/                   # JavaScript/Node.js 검증기
│   │   └── src/
│   │       ├── parser/       # YAML 스펙 파서
│   │       └── rules/        # 검증 규칙 구현
│   ├── php/                  # PHP 검증기
│   │   └── src/
│   └── go/                   # Go 검증기
│       └── validator/
└── tests/                     # 통합 테스트
    ├── cases/                # 테스트 케이스
    ├── fixtures/             # 테스트 데이터
    │   └── specs/            # 테스트용 YAML 스펙
    └── runner/               # 다중 언어 테스트 러너
```

## 빠른 시작

### JavaScript/Node.js

```javascript
import { FormValidator } from '@form-generator/validator';
import yaml from 'js-yaml';
import fs from 'fs';

// YAML 스펙 로드
const spec = yaml.load(fs.readFileSync('form-spec.yml', 'utf8'));

// 검증기 생성
const validator = new FormValidator(spec);

// 데이터 검증
const result = validator.validate({
  email: 'user@example.com',
  password: 'secure123'
});

if (result.valid) {
  console.log('검증 성공');
} else {
  console.log('검증 실패:', result.errors);
}
```

### PHP

```php
<?php
use FormGenerator\Validator\FormValidator;

// YAML 스펙 로드
$spec = yaml_parse_file('form-spec.yml');

// 검증기 생성
$validator = new FormValidator($spec);

// 데이터 검증
$result = $validator->validate([
    'email' => 'user@example.com',
    'password' => 'secure123'
]);

if ($result->isValid()) {
    echo '검증 성공';
} else {
    print_r($result->getErrors());
}
```

### Go

```go
package main

import (
    "fmt"
    "form-generator/validator"
)

func main() {
    // YAML 스펙 로드
    spec, _ := validator.LoadSpec("form-spec.yml")

    // 검증기 생성
    v := validator.NewFormValidator(spec)

    // 데이터 검증
    data := map[string]interface{}{
        "email":    "user@example.com",
        "password": "secure123",
    }

    result := v.Validate(data)

    if result.Valid {
        fmt.Println("검증 성공")
    } else {
        fmt.Printf("검증 실패: %v\n", result.Errors)
    }
}
```

### React 폼 빌더

```jsx
import { FormBuilder, useFormGenerator } from '@form-generator/react';

function MyForm() {
  const { form, handleSubmit } = useFormGenerator({
    spec: '/api/specs/user-form.yml',
    onSubmit: (data) => console.log(data)
  });

  return (
    <FormBuilder
      form={form}
      onSubmit={handleSubmit}
    />
  );
}
```

## 주요 기능

### 검증 규칙 (25+)

| 규칙 | 설명 | 예시 |
|------|------|------|
| `required` | 필수 입력 | `required: true` |
| `email` | 이메일 형식 | `email: true` |
| `minlength` | 최소 길이 | `minlength: 8` |
| `maxlength` | 최대 길이 | `maxlength: 100` |
| `min` | 최소값 | `min: 0` |
| `max` | 최대값 | `max: 1000000` |
| `pattern` | 정규식 패턴 | `pattern: "^[a-z]+$"` |
| `numeric` | 숫자 형식 | `numeric: true` |
| `integer` | 정수 형식 | `integer: true` |
| `url` | URL 형식 | `url: true` |
| `date` | 날짜 형식 | `date: true` |
| `datetime` | 날짜시간 형식 | `datetime: true` |
| `in` | 허용 값 목록 | `in: [1, 2, 3]` |
| `not_in` | 금지 값 목록 | `not_in: [0, -1]` |
| `confirmed` | 확인 필드 일치 | `confirmed: password` |
| `unique` | 고유값 (DB 연동) | `unique: users.email` |
| `exists` | 존재 확인 (DB 연동) | `exists: categories.id` |
| `file` | 파일 업로드 | `file: true` |
| `image` | 이미지 파일 | `image: true` |
| `mimes` | MIME 타입 제한 | `mimes: [jpg, png, gif]` |
| `max_file_size` | 파일 크기 제한 | `max_file_size: 5MB` |
| `dimensions` | 이미지 크기 제한 | `dimensions: {min_width: 100}` |
| `json` | JSON 형식 | `json: true` |
| `array` | 배열 형식 | `array: true` |
| `boolean` | 불리언 형식 | `boolean: true` |

### 조건부 표현식

복잡한 조건부 로직을 표현식으로 정의할 수 있습니다.

```yaml
fields:
  payment_type:
    type: select
    options:
      - { value: card, label: 신용카드 }
      - { value: bank, label: 계좌이체 }

  card_number:
    type: text
    # 결제 방식이 카드일 때만 표시
    display_switch: ".payment_type == 'card'"
    rules:
      required:
        when: ".payment_type == 'card'"
```

#### 표현식 문법

| 문법 | 설명 | 예시 |
|------|------|------|
| `.field` | 현재 그룹의 필드 참조 | `.payment_type == 'card'` |
| `..parent` | 부모 그룹의 필드 참조 | `..category_id == 1` |
| `...ancestor` | 조상 그룹의 필드 참조 | `...root_field == 'value'` |
| `*.wildcard` | 배열 인덱스 와일드카드 | `items.*.price > 0` |
| `&&`, `\|\|` | 논리 연산자 | `.a == 1 && .b == 2` |
| `==`, `!=`, `>`, `<` | 비교 연산자 | `.count >= 10` |
| `in`, `not in` | 포함 여부 | `.status in ['active', 'pending']` |

### display_switch / display_target

조건에 따라 필드나 그룹의 표시 여부를 제어합니다.

```yaml
fields:
  has_options:
    type: checkbox
    label: 옵션 사용

  options_group:
    type: group
    display_target: has_options  # has_options 체크 시 표시
    fields:
      option_name:
        type: text
        label: 옵션명
```

### 중첩 그룹 (Nested Groups)

복잡한 폼 구조를 계층적으로 정의할 수 있습니다.

```yaml
fields:
  product:
    type: group
    fields:
      name:
        type: text
        rules:
          required: true

      variants:
        type: group
        multiple: true      # 반복 가능
        sortable: true      # 드래그 정렬 가능
        min: 1
        max: 10
        fields:
          sku:
            type: text
            rules:
              required: true
          price:
            type: number
            rules:
              required: true
              min: 0
```

### $ref 외부 파일 참조

공통 필드 정의를 별도 파일로 분리하여 재사용할 수 있습니다.

```yaml
# common/address.yml
type: group
fields:
  postal_code:
    type: text
    rules:
      required: true
      pattern: "^\\d{5}$"
  address1:
    type: text
    rules:
      required: true
  address2:
    type: text

# order-form.yml
fields:
  shipping_address:
    $ref: common/address.yml
    label: 배송지 주소

  billing_address:
    $ref: common/address.yml
    label: 청구지 주소
```

## YAML 스펙 예시

```yaml
# user-registration.yml
name: user_registration
label: 회원가입

fields:
  email:
    type: email
    label: 이메일
    placeholder: example@email.com
    rules:
      required: true
      email: true
      unique: users.email
    messages:
      required: 이메일을 입력해주세요.
      email: 올바른 이메일 형식이 아닙니다.
      unique: 이미 사용 중인 이메일입니다.

  password:
    type: password
    label: 비밀번호
    rules:
      required: true
      minlength: 8
      pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$"
    messages:
      required: 비밀번호를 입력해주세요.
      minlength: 비밀번호는 8자 이상이어야 합니다.
      pattern: 대문자, 소문자, 숫자를 포함해야 합니다.

  password_confirmation:
    type: password
    label: 비밀번호 확인
    rules:
      required: true
      confirmed: password
    messages:
      confirmed: 비밀번호가 일치하지 않습니다.

  profile:
    type: group
    label: 프로필 정보
    fields:
      name:
        type: text
        label: 이름
        rules:
          required: true
          maxlength: 50

      phone:
        type: tel
        label: 전화번호
        rules:
          pattern: "^\\d{2,3}-\\d{3,4}-\\d{4}$"
        messages:
          pattern: "올바른 전화번호 형식이 아닙니다. (예: 010-1234-5678)"

  terms_agreed:
    type: checkbox
    label: 이용약관 동의
    rules:
      required: true
    messages:
      required: 이용약관에 동의해주세요.
```

## 멱등성 테스트

모든 언어에서 동일한 검증 결과를 보장하기 위한 통합 테스트를 제공합니다.

```bash
# 모든 언어 검증기 테스트 실행
npm run test:idempotency

# 특정 언어만 테스트
npm run test:js
composer test        # PHP
go test ./...        # Go
```

테스트는 동일한 입력 데이터와 스펙에 대해 모든 언어의 검증 결과가 일치하는지 확인합니다.

## 대상 스펙

이 프로젝트의 주요 목표는 **ProductNft/Spec/Create.yml** (1,318줄) 같은 복잡한 e-commerce 폼을 완벽히 지원하는 것입니다.

주요 지원 기능:
- 다단계 중첩 그룹
- 동적 필드 추가/삭제 (multiple)
- 드래그 앤 드롭 정렬 (sortable)
- 복잡한 조건부 표시 로직
- 파일 업로드 및 이미지 처리
- 실시간 클라이언트 검증
- 서버 사이드 검증

## 관련 문서

- [검증 규칙 상세 가이드](./validation-rules.md)
- [조건부 표현식 문법](./conditional-expressions.md)
- [YAML 스펙 레퍼런스](./spec-reference.md)
- [React 컴포넌트 API](./react-components.md)
- [마이그레이션 가이드 (Limepie)](./migration-from-limepie.md)
- [멱등성 테스트 작성법](./idempotency-testing.md)

## 라이선스

MIT License

## 기여하기

버그 리포트, 기능 제안, PR을 환영합니다. 기여하기 전에 [CONTRIBUTING.md](./CONTRIBUTING.md)를 확인해주세요.
