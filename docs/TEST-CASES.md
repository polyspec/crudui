# 테스트 케이스 명세서

> 이 문서는 JS, PHP, Go 세 가지 언어에서 멱등성(idempotent) 검증을 보장하기 위한 테스트 케이스 구조를 정의합니다.

## 목차

1. [개요](#개요)
2. [JSON 테스트 케이스 형식](#json-테스트-케이스-형식)
3. [테스트 카테고리](#테스트-카테고리)
4. [테스트 실행 방법](#테스트-실행-방법)
5. [예상 테스트 케이스 수](#예상-테스트-케이스-수)
6. [예제 테스트 케이스](#예제-테스트-케이스)

---

## 개요

### 목적

Form Generator의 핵심 목표는 **단일 YAML 스펙으로 모든 언어에서 동일한 검증 결과를 보장**하는 것입니다. 이를 위해 JSON 기반의 표준화된 테스트 케이스를 정의하고, 세 가지 언어(JavaScript, PHP, Go)에서 동일한 테스트를 실행하여 멱등성을 검증합니다.

### 설계 원칙

1. **언어 독립적**: 테스트 케이스는 JSON 형식으로 작성되어 모든 언어에서 파싱 가능
2. **완전한 커버리지**: 모든 검증 규칙에 대해 정상/비정상 케이스 포함
3. **엣지 케이스 포함**: 경계값, null, 빈 문자열, 특수 문자 등 다양한 입력 테스트
4. **재현 가능성**: 동일한 입력에 대해 항상 동일한 결과 보장

---

## JSON 테스트 케이스 형식

### 기본 구조

```json
{
  "testSuite": "validation-rules",
  "version": "1.0.0",
  "description": "Form Generator 검증 규칙 테스트 스위트",
  "tests": [
    {
      "id": "required-001",
      "rule": "required",
      "description": "필수 입력 규칙 - 빈 문자열",
      "spec": {
        "type": "text",
        "rules": {
          "required": true
        }
      },
      "cases": [
        {
          "input": "",
          "expected": {
            "valid": false,
            "error": "required"
          }
        },
        {
          "input": "값 있음",
          "expected": {
            "valid": true,
            "error": null
          }
        }
      ]
    }
  ]
}
```

### 필드 설명

#### 루트 레벨

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `testSuite` | string | 예 | 테스트 스위트 식별자 |
| `version` | string | 예 | 테스트 스위트 버전 |
| `description` | string | 아니오 | 테스트 스위트 설명 |
| `tests` | array | 예 | 테스트 목록 |

#### 테스트 객체

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `id` | string | 예 | 고유 테스트 ID (예: `required-001`) |
| `rule` | string | 예 | 테스트 대상 규칙명 |
| `description` | string | 아니오 | 테스트 설명 |
| `category` | string | 아니오 | 테스트 카테고리 |
| `spec` | object | 예 | 필드 스펙 정의 |
| `cases` | array | 예 | 테스트 케이스 목록 |
| `context` | object | 아니오 | 조건부 규칙을 위한 컨텍스트 데이터 |

#### 케이스 객체

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `input` | any | 예 | 테스트 입력값 |
| `expected` | object | 예 | 예상 결과 |
| `description` | string | 아니오 | 케이스 설명 |
| `context` | object | 아니오 | 케이스별 컨텍스트 오버라이드 |

#### 예상 결과 객체

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `valid` | boolean | 예 | 검증 성공 여부 |
| `error` | string/null | 예 | 실패 시 에러 규칙명, 성공 시 `null` |
| `errorMessage` | string | 아니오 | 커스텀 에러 메시지 확인용 |

### ID 명명 규칙

테스트 ID는 다음 형식을 따릅니다:

```
{규칙명}-{번호}[-{변형}]
```

예시:
- `required-001` - required 규칙 첫 번째 테스트
- `email-003-unicode` - email 규칙 세 번째 테스트, 유니코드 변형
- `conditional-required-015-nested` - 조건부 required 15번째 테스트, 중첩 구조

---

## 테스트 카테고리

테스트는 다음 4가지 카테고리로 분류됩니다:

### 1. 단일 규칙 테스트 (Per-Rule)

개별 검증 규칙에 대한 단위 테스트입니다.

```json
{
  "id": "email-001",
  "rule": "email",
  "category": "per-rule",
  "description": "이메일 형식 검증 - 유효한 형식",
  "spec": {
    "type": "email",
    "rules": {
      "email": true
    }
  },
  "cases": [
    {
      "input": "user@example.com",
      "expected": { "valid": true, "error": null }
    },
    {
      "input": "invalid-email",
      "expected": { "valid": false, "error": "email" }
    }
  ]
}
```

**포함 규칙:**
- 기본 규칙: `required`, `email`, `url`
- 문자열 규칙: `minlength`, `maxlength`, `rangelength`, `match`
- 숫자 규칙: `number`, `digits`, `min`, `max`, `range`, `step`
- 비교 규칙: `equalTo`, `notEqual`, `in`
- 날짜 규칙: `date`, `dateISO`, `enddate`
- 배열 규칙: `mincount`, `maxcount`, `minformcount`, `maxformcount`, `unique`
- 파일 규칙: `accept`

### 2. 조건부 규칙 테스트 (Conditional)

다른 필드의 값에 따라 검증이 달라지는 조건부 규칙 테스트입니다.

```json
{
  "id": "conditional-required-001",
  "rule": "required",
  "category": "conditional",
  "description": "조건부 필수 - 체크박스 선택 시 필수",
  "spec": {
    "type": "text",
    "rules": {
      "required": ".has_company == '1'"
    }
  },
  "context": {
    "has_company": "1"
  },
  "cases": [
    {
      "input": "",
      "context": { "has_company": "1" },
      "expected": { "valid": false, "error": "required" }
    },
    {
      "input": "",
      "context": { "has_company": "0" },
      "expected": { "valid": true, "error": null }
    },
    {
      "input": "ABC 주식회사",
      "context": { "has_company": "1" },
      "expected": { "valid": true, "error": null }
    }
  ]
}
```

**조건부 테스트 유형:**
- 단순 조건: `.field == 'value'`
- 복합 조건: `.field1 == 'a' && .field2 >= 5`
- OR 조건: `.field1 == 'a' || .field2 == 'b'`
- in 연산자: `.field in value1,value2,value3`
- 배열 와일드카드: `items.*.is_close == 1`

### 3. 중첩 구조 테스트 (Nested)

중첩된 그룹 구조에서의 검증 테스트입니다.

```json
{
  "id": "nested-001",
  "rule": "required",
  "category": "nested",
  "description": "중첩 그룹 내 필수 필드 검증",
  "spec": {
    "type": "group",
    "properties": {
      "address": {
        "type": "group",
        "properties": {
          "postal_code": {
            "type": "text",
            "rules": {
              "required": true
            }
          },
          "city": {
            "type": "text",
            "rules": {
              "required": true
            }
          }
        }
      }
    }
  },
  "cases": [
    {
      "input": {
        "address": {
          "postal_code": "12345",
          "city": "서울"
        }
      },
      "expected": { "valid": true, "error": null }
    },
    {
      "input": {
        "address": {
          "postal_code": "",
          "city": "서울"
        }
      },
      "expected": {
        "valid": false,
        "error": "required",
        "errorPath": "address.postal_code"
      }
    }
  ]
}
```

**중첩 테스트 유형:**
- 단일 레벨 중첩
- 다중 레벨 중첩 (3단계 이상)
- 반복 가능 그룹 (`multiple: true`)
- 부모 필드 참조 (`..parent_field`)
- 배열 인덱스 참조 (`items[0].field`)

### 4. 복합 규칙 테스트 (Complex)

여러 규칙이 조합된 복잡한 검증 시나리오 테스트입니다.

```json
{
  "id": "complex-001",
  "rule": "multiple",
  "category": "complex",
  "description": "비밀번호 복합 규칙 - required + minlength + match",
  "spec": {
    "type": "password",
    "rules": {
      "required": true,
      "minlength": 8,
      "match": "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$"
    }
  },
  "cases": [
    {
      "input": "",
      "expected": { "valid": false, "error": "required" }
    },
    {
      "input": "short",
      "expected": { "valid": false, "error": "minlength" }
    },
    {
      "input": "longenough",
      "expected": { "valid": false, "error": "match" }
    },
    {
      "input": "ValidPass123",
      "expected": { "valid": true, "error": null }
    }
  ]
}
```

**복합 테스트 유형:**
- 다중 규칙 순서 검증 (required가 먼저 실패해야 함)
- 규칙 간 상호작용
- 실제 폼 시나리오 (회원가입, 상품등록 등)
- 파일 업로드와 메타데이터 검증 조합

---

## 테스트 실행 방법

### 디렉토리 구조

```
tests/
├── cases/
│   ├── per-rule/
│   │   ├── required.json
│   │   ├── email.json
│   │   ├── minlength.json
│   │   └── ...
│   ├── conditional/
│   │   ├── conditional-required.json
│   │   ├── conditional-in.json
│   │   └── ...
│   ├── nested/
│   │   ├── nested-groups.json
│   │   ├── multiple-groups.json
│   │   └── ...
│   └── complex/
│       ├── user-registration.json
│       ├── product-form.json
│       └── ...
├── fixtures/
│   └── specs/
│       ├── simple-form.yml
│       └── complex-form.yml
└── runner/
    ├── js/
    │   └── test-runner.js
    ├── php/
    │   └── TestRunner.php
    └── go/
        └── test_runner.go
```

### JavaScript 테스트 실행

```bash
# 전체 테스트 실행
npm run test:validation

# 특정 카테고리만 실행
npm run test:validation -- --category=per-rule

# 특정 규칙만 실행
npm run test:validation -- --rule=required

# 상세 출력
npm run test:validation -- --verbose
```

**테스트 러너 구현 (Node.js):**

```javascript
// tests/runner/js/test-runner.js
import { FormValidator } from '@form-generator/validator';
import fs from 'fs';
import path from 'path';
import glob from 'glob';

class TestRunner {
  constructor(options = {}) {
    this.options = options;
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };
  }

  async runAll() {
    const testFiles = glob.sync('tests/cases/**/*.json');

    for (const file of testFiles) {
      await this.runTestFile(file);
    }

    this.printSummary();
    return this.results.failed === 0;
  }

  async runTestFile(filePath) {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    for (const test of content.tests) {
      await this.runTest(test);
    }
  }

  async runTest(test) {
    const validator = new FormValidator({
      properties: { testField: test.spec }
    });

    for (const testCase of test.cases) {
      const context = { ...test.context, ...testCase.context };
      const result = validator.validateField(
        'testField',
        testCase.input,
        context
      );

      const passed = result.valid === testCase.expected.valid &&
                     result.error === testCase.expected.error;

      if (passed) {
        this.results.passed++;
      } else {
        this.results.failed++;
        this.results.errors.push({
          testId: test.id,
          input: testCase.input,
          expected: testCase.expected,
          actual: { valid: result.valid, error: result.error }
        });
      }
    }
  }

  printSummary() {
    console.log(`\n=== 테스트 결과 ===`);
    console.log(`통과: ${this.results.passed}`);
    console.log(`실패: ${this.results.failed}`);
    console.log(`건너뜀: ${this.results.skipped}`);

    if (this.results.errors.length > 0) {
      console.log(`\n실패한 테스트:`);
      for (const error of this.results.errors) {
        console.log(`- ${error.testId}`);
        console.log(`  입력: ${JSON.stringify(error.input)}`);
        console.log(`  예상: ${JSON.stringify(error.expected)}`);
        console.log(`  실제: ${JSON.stringify(error.actual)}`);
      }
    }
  }
}

// 실행
const runner = new TestRunner();
runner.runAll().then(success => {
  process.exit(success ? 0 : 1);
});
```

### PHP 테스트 실행

```bash
# Composer를 통한 테스트 실행
composer test

# PHPUnit 직접 실행
./vendor/bin/phpunit tests/

# 특정 카테고리만 실행
./vendor/bin/phpunit --group=per-rule

# 코드 커버리지 포함
./vendor/bin/phpunit --coverage-html coverage/
```

**테스트 러너 구현 (PHP):**

```php
<?php
// tests/runner/php/TestRunner.php

namespace FormGenerator\Tests;

use FormGenerator\Validator\FormValidator;
use PHPUnit\Framework\TestCase;

class ValidationTestRunner extends TestCase
{
    private array $results = [
        'passed' => 0,
        'failed' => 0,
        'errors' => []
    ];

    /**
     * @dataProvider testCaseProvider
     */
    public function testValidationRule(
        string $testId,
        array $spec,
        mixed $input,
        array $expected,
        array $context = []
    ): void {
        $validator = new FormValidator([
            'properties' => ['testField' => $spec]
        ]);

        $result = $validator->validateField('testField', $input, $context);

        $this->assertEquals(
            $expected['valid'],
            $result->isValid(),
            "테스트 {$testId}: valid 불일치"
        );

        $this->assertEquals(
            $expected['error'],
            $result->getError(),
            "테스트 {$testId}: error 불일치"
        );
    }

    public static function testCaseProvider(): array
    {
        $cases = [];
        $files = glob(__DIR__ . '/../../cases/**/*.json');

        foreach ($files as $file) {
            $content = json_decode(file_get_contents($file), true);

            foreach ($content['tests'] as $test) {
                foreach ($test['cases'] as $index => $case) {
                    $caseId = $test['id'] . '-case-' . $index;
                    $context = array_merge(
                        $test['context'] ?? [],
                        $case['context'] ?? []
                    );

                    $cases[$caseId] = [
                        $test['id'],
                        $test['spec'],
                        $case['input'],
                        $case['expected'],
                        $context
                    ];
                }
            }
        }

        return $cases;
    }
}
```

### Go 테스트 실행

```bash
# 전체 테스트 실행
go test ./tests/... -v

# 특정 패키지만 실행
go test ./validator/... -v

# 특정 테스트만 실행
go test -run TestRequired ./tests/...

# 벤치마크 포함
go test -bench=. ./tests/...

# 커버리지 리포트
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

**테스트 러너 구현 (Go):**

```go
// tests/runner/go/test_runner.go
package runner

import (
    "encoding/json"
    "io/ioutil"
    "path/filepath"
    "testing"

    "form-generator/validator"
)

type TestSuite struct {
    TestSuite   string `json:"testSuite"`
    Version     string `json:"version"`
    Description string `json:"description"`
    Tests       []Test `json:"tests"`
}

type Test struct {
    ID          string                 `json:"id"`
    Rule        string                 `json:"rule"`
    Category    string                 `json:"category"`
    Description string                 `json:"description"`
    Spec        map[string]interface{} `json:"spec"`
    Context     map[string]interface{} `json:"context"`
    Cases       []TestCase             `json:"cases"`
}

type TestCase struct {
    Input       interface{}            `json:"input"`
    Expected    Expected               `json:"expected"`
    Description string                 `json:"description"`
    Context     map[string]interface{} `json:"context"`
}

type Expected struct {
    Valid bool    `json:"valid"`
    Error *string `json:"error"`
}

func RunValidationTests(t *testing.T) {
    files, _ := filepath.Glob("tests/cases/**/*.json")

    for _, file := range files {
        data, _ := ioutil.ReadFile(file)

        var suite TestSuite
        json.Unmarshal(data, &suite)

        for _, test := range suite.Tests {
            for i, tc := range test.Cases {
                t.Run(test.ID+"-"+string(i), func(t *testing.T) {
                    v := validator.NewFormValidator(map[string]interface{}{
                        "properties": map[string]interface{}{
                            "testField": test.Spec,
                        },
                    })

                    context := mergeContext(test.Context, tc.Context)
                    result := v.ValidateField("testField", tc.Input, context)

                    if result.Valid != tc.Expected.Valid {
                        t.Errorf("valid 불일치: 예상 %v, 실제 %v",
                            tc.Expected.Valid, result.Valid)
                    }

                    if !compareError(result.Error, tc.Expected.Error) {
                        t.Errorf("error 불일치: 예상 %v, 실제 %v",
                            tc.Expected.Error, result.Error)
                    }
                })
            }
        }
    }
}

func mergeContext(base, override map[string]interface{}) map[string]interface{} {
    result := make(map[string]interface{})
    for k, v := range base {
        result[k] = v
    }
    for k, v := range override {
        result[k] = v
    }
    return result
}

func compareError(actual *string, expected *string) bool {
    if actual == nil && expected == nil {
        return true
    }
    if actual == nil || expected == nil {
        return false
    }
    return *actual == *expected
}
```

### 멱등성 검증 실행

세 가지 언어에서 동일한 결과가 나오는지 확인하는 통합 테스트입니다.

```bash
# 멱등성 테스트 실행 (모든 언어 비교)
npm run test:idempotency

# 결과 비교 리포트 생성
npm run test:idempotency -- --report
```

**멱등성 검증 스크립트:**

```javascript
// tests/runner/idempotency-check.js
import { execSync } from 'child_process';
import fs from 'fs';

async function runIdempotencyCheck() {
  // 각 언어로 테스트 실행 후 결과 JSON 저장
  execSync('npm run test:validation -- --output=results/js.json');
  execSync('composer test -- --output=results/php.json');
  execSync('go test ./... -json > results/go.json');

  // 결과 비교
  const jsResults = JSON.parse(fs.readFileSync('results/js.json'));
  const phpResults = JSON.parse(fs.readFileSync('results/php.json'));
  const goResults = JSON.parse(fs.readFileSync('results/go.json'));

  const mismatches = [];

  for (const testId of Object.keys(jsResults)) {
    const js = jsResults[testId];
    const php = phpResults[testId];
    const go = goResults[testId];

    if (js.valid !== php.valid || js.valid !== go.valid) {
      mismatches.push({
        testId,
        js: js.valid,
        php: php.valid,
        go: go.valid
      });
    }
  }

  if (mismatches.length > 0) {
    console.error('멱등성 검증 실패!');
    console.error('불일치 항목:', mismatches);
    process.exit(1);
  }

  console.log('멱등성 검증 성공: 모든 언어에서 동일한 결과');
}

runIdempotencyCheck();
```

---

## 예상 테스트 케이스 수

총 **200개 이상**의 테스트 케이스를 목표로 합니다.

### 카테고리별 분포

| 카테고리 | 예상 케이스 수 | 설명 |
|----------|---------------|------|
| **단일 규칙 (Per-Rule)** | 100+ | 25개 규칙 x 평균 4개 케이스 |
| **조건부 규칙 (Conditional)** | 40+ | 조건식 유형별 테스트 |
| **중첩 구조 (Nested)** | 30+ | 다양한 중첩 레벨 테스트 |
| **복합 규칙 (Complex)** | 30+ | 실제 폼 시나리오 테스트 |
| **합계** | **200+** | |

### 규칙별 테스트 케이스 수

| 규칙 | 최소 케이스 수 | 주요 테스트 항목 |
|------|---------------|-----------------|
| `required` | 8 | 빈 문자열, null, 공백, 0, false, 배열 |
| `email` | 10 | 유효/무효 형식, 유니코드, 특수 도메인 |
| `url` | 8 | 프로토콜, 도메인, 경로, 쿼리스트링 |
| `minlength` | 6 | 경계값, 유니코드 문자, 빈 문자열 |
| `maxlength` | 6 | 경계값, 유니코드 문자, 초과 |
| `rangelength` | 6 | 범위 내/외, 경계값 |
| `match` | 8 | 다양한 정규식 패턴 |
| `number` | 8 | 정수, 소수, 음수, 문자열 숫자 |
| `digits` | 6 | 양의 정수, 음수, 소수점 |
| `min` | 6 | 경계값, 음수, 소수 |
| `max` | 6 | 경계값, 초과값 |
| `range` | 8 | 범위 내/외, 경계값 |
| `step` | 6 | 배수, 비배수, 소수 단위 |
| `equalTo` | 6 | 일치, 불일치, 대소문자 |
| `notEqual` | 4 | 같음, 다름 |
| `in` | 6 | 포함, 미포함, 대소문자 |
| `date` | 8 | 유효/무효 형식, 경계 날짜 |
| `dateISO` | 6 | ISO 형식, 비ISO 형식 |
| `enddate` | 6 | 시작일 이후/이전, 동일 날짜 |
| `mincount` | 4 | 배열 길이 |
| `maxcount` | 4 | 배열 길이 |
| `minformcount` | 4 | 폼 요소 수 |
| `maxformcount` | 4 | 폼 요소 수 |
| `unique` | 6 | 고유값, 중복값 |
| `accept` | 6 | MIME 타입, 와일드카드 |

---

## 예제 테스트 케이스

### 1. required 규칙 테스트

```json
{
  "testSuite": "validation-rules",
  "version": "1.0.0",
  "tests": [
    {
      "id": "required-001",
      "rule": "required",
      "category": "per-rule",
      "description": "필수 입력 규칙 - 기본 케이스",
      "spec": {
        "type": "text",
        "rules": {
          "required": true
        }
      },
      "cases": [
        {
          "description": "빈 문자열 - 실패",
          "input": "",
          "expected": {
            "valid": false,
            "error": "required"
          }
        },
        {
          "description": "null 값 - 실패",
          "input": null,
          "expected": {
            "valid": false,
            "error": "required"
          }
        },
        {
          "description": "공백만 있는 문자열 - 실패",
          "input": "   ",
          "expected": {
            "valid": false,
            "error": "required"
          }
        },
        {
          "description": "값이 있는 경우 - 성공",
          "input": "홍길동",
          "expected": {
            "valid": true,
            "error": null
          }
        },
        {
          "description": "숫자 0 - 성공 (falsy지만 값으로 인정)",
          "input": 0,
          "expected": {
            "valid": true,
            "error": null
          }
        },
        {
          "description": "문자열 '0' - 성공",
          "input": "0",
          "expected": {
            "valid": true,
            "error": null
          }
        },
        {
          "description": "false 값 - 실패",
          "input": false,
          "expected": {
            "valid": false,
            "error": "required"
          }
        },
        {
          "description": "빈 배열 - 실패",
          "input": [],
          "expected": {
            "valid": false,
            "error": "required"
          }
        }
      ]
    }
  ]
}
```

### 2. email 규칙 테스트

```json
{
  "testSuite": "validation-rules",
  "version": "1.0.0",
  "tests": [
    {
      "id": "email-001",
      "rule": "email",
      "category": "per-rule",
      "description": "이메일 형식 검증",
      "spec": {
        "type": "email",
        "rules": {
          "email": true
        }
      },
      "cases": [
        {
          "description": "표준 이메일 형식 - 성공",
          "input": "user@example.com",
          "expected": {
            "valid": true,
            "error": null
          }
        },
        {
          "description": "서브도메인 포함 - 성공",
          "input": "user@subdomain.example.com",
          "expected": {
            "valid": true,
            "error": null
          }
        },
        {
          "description": "플러스 태그 포함 - 성공",
          "input": "user.name+tag@example.co.kr",
          "expected": {
            "valid": true,
            "error": null
          }
        },
        {
          "description": "@ 누락 - 실패",
          "input": "userexample.com",
          "expected": {
            "valid": false,
            "error": "email"
          }
        },
        {
          "description": "도메인 누락 - 실패",
          "input": "user@",
          "expected": {
            "valid": false,
            "error": "email"
          }
        },
        {
          "description": "로컬 파트 누락 - 실패",
          "input": "@example.com",
          "expected": {
            "valid": false,
            "error": "email"
          }
        },
        {
          "description": "잘못된 도메인 형식 - 실패",
          "input": "user@.com",
          "expected": {
            "valid": false,
            "error": "email"
          }
        },
        {
          "description": "공백 포함 - 실패",
          "input": "user @example.com",
          "expected": {
            "valid": false,
            "error": "email"
          }
        },
        {
          "description": "빈 문자열 - 성공 (required가 아니면 빈 값 허용)",
          "input": "",
          "expected": {
            "valid": true,
            "error": null
          }
        },
        {
          "description": "한글 도메인 (IDN) - 성공",
          "input": "user@예제.한국",
          "expected": {
            "valid": true,
            "error": null
          }
        }
      ]
    }
  ]
}
```

### 3. 조건부 required 규칙 테스트

```json
{
  "testSuite": "validation-rules",
  "version": "1.0.0",
  "tests": [
    {
      "id": "conditional-required-001",
      "rule": "required",
      "category": "conditional",
      "description": "조건부 필수 - 단순 조건 (체크박스)",
      "spec": {
        "type": "text",
        "rules": {
          "required": ".has_company == '1'"
        }
      },
      "cases": [
        {
          "description": "조건 충족 + 빈 값 - 실패",
          "input": "",
          "context": { "has_company": "1" },
          "expected": {
            "valid": false,
            "error": "required"
          }
        },
        {
          "description": "조건 충족 + 값 있음 - 성공",
          "input": "ABC 주식회사",
          "context": { "has_company": "1" },
          "expected": {
            "valid": true,
            "error": null
          }
        },
        {
          "description": "조건 미충족 + 빈 값 - 성공 (필수 아님)",
          "input": "",
          "context": { "has_company": "0" },
          "expected": {
            "valid": true,
            "error": null
          }
        },
        {
          "description": "조건 미충족 + 값 있음 - 성공",
          "input": "ABC 주식회사",
          "context": { "has_company": "0" },
          "expected": {
            "valid": true,
            "error": null
          }
        }
      ]
    },
    {
      "id": "conditional-required-002",
      "rule": "required",
      "category": "conditional",
      "description": "조건부 필수 - 복합 조건 (AND)",
      "spec": {
        "type": "file",
        "rules": {
          "required": ".user_type == 'business' && .employee_count >= 5"
        }
      },
      "cases": [
        {
          "description": "두 조건 모두 충족 + 빈 값 - 실패",
          "input": null,
          "context": {
            "user_type": "business",
            "employee_count": 10
          },
          "expected": {
            "valid": false,
            "error": "required"
          }
        },
        {
          "description": "첫 번째 조건만 충족 - 성공 (필수 아님)",
          "input": null,
          "context": {
            "user_type": "business",
            "employee_count": 3
          },
          "expected": {
            "valid": true,
            "error": null
          }
        },
        {
          "description": "두 번째 조건만 충족 - 성공 (필수 아님)",
          "input": null,
          "context": {
            "user_type": "personal",
            "employee_count": 10
          },
          "expected": {
            "valid": true,
            "error": null
          }
        },
        {
          "description": "두 조건 모두 미충족 - 성공 (필수 아님)",
          "input": null,
          "context": {
            "user_type": "personal",
            "employee_count": 3
          },
          "expected": {
            "valid": true,
            "error": null
          }
        }
      ]
    },
    {
      "id": "conditional-required-003",
      "rule": "required",
      "category": "conditional",
      "description": "조건부 필수 - in 연산자",
      "spec": {
        "type": "datetime",
        "rules": {
          "required": ".is_display in 2,3"
        }
      },
      "cases": [
        {
          "description": "is_display가 2 + 빈 값 - 실패",
          "input": "",
          "context": { "is_display": "2" },
          "expected": {
            "valid": false,
            "error": "required"
          }
        },
        {
          "description": "is_display가 3 + 빈 값 - 실패",
          "input": "",
          "context": { "is_display": "3" },
          "expected": {
            "valid": false,
            "error": "required"
          }
        },
        {
          "description": "is_display가 1 + 빈 값 - 성공 (필수 아님)",
          "input": "",
          "context": { "is_display": "1" },
          "expected": {
            "valid": true,
            "error": null
          }
        },
        {
          "description": "is_display가 2 + 값 있음 - 성공",
          "input": "2024-01-15 10:00",
          "context": { "is_display": "2" },
          "expected": {
            "valid": true,
            "error": null
          }
        }
      ]
    },
    {
      "id": "conditional-required-004",
      "rule": "required",
      "category": "conditional",
      "description": "조건부 필수 - 배열 와일드카드",
      "spec": {
        "type": "textarea",
        "rules": {
          "required": "items.*.is_close == 1"
        }
      },
      "cases": [
        {
          "description": "해당 항목의 is_close가 1 + 빈 값 - 실패",
          "input": "",
          "context": {
            "items": [
              { "name": "항목1", "is_close": "1" }
            ],
            "_currentIndex": 0
          },
          "expected": {
            "valid": false,
            "error": "required"
          }
        },
        {
          "description": "해당 항목의 is_close가 0 + 빈 값 - 성공",
          "input": "",
          "context": {
            "items": [
              { "name": "항목1", "is_close": "0" }
            ],
            "_currentIndex": 0
          },
          "expected": {
            "valid": true,
            "error": null
          }
        },
        {
          "description": "해당 항목의 is_close가 1 + 값 있음 - 성공",
          "input": "재고 소진으로 인한 종료",
          "context": {
            "items": [
              { "name": "항목1", "is_close": "1" }
            ],
            "_currentIndex": 0
          },
          "expected": {
            "valid": true,
            "error": null
          }
        }
      ]
    }
  ]
}
```

### 4. 중첩 구조 테스트

```json
{
  "testSuite": "validation-rules",
  "version": "1.0.0",
  "tests": [
    {
      "id": "nested-001",
      "rule": "multiple",
      "category": "nested",
      "description": "2단계 중첩 그룹 검증",
      "spec": {
        "type": "group",
        "properties": {
          "profile": {
            "type": "group",
            "properties": {
              "name": {
                "type": "text",
                "rules": {
                  "required": true,
                  "minlength": 2
                }
              },
              "email": {
                "type": "email",
                "rules": {
                  "required": true,
                  "email": true
                }
              }
            }
          }
        }
      },
      "cases": [
        {
          "description": "모든 필드 유효 - 성공",
          "input": {
            "profile": {
              "name": "홍길동",
              "email": "hong@example.com"
            }
          },
          "expected": {
            "valid": true,
            "error": null
          }
        },
        {
          "description": "name 누락 - 실패",
          "input": {
            "profile": {
              "name": "",
              "email": "hong@example.com"
            }
          },
          "expected": {
            "valid": false,
            "error": "required",
            "errorPath": "profile.name"
          }
        },
        {
          "description": "name 길이 부족 - 실패",
          "input": {
            "profile": {
              "name": "홍",
              "email": "hong@example.com"
            }
          },
          "expected": {
            "valid": false,
            "error": "minlength",
            "errorPath": "profile.name"
          }
        },
        {
          "description": "잘못된 이메일 형식 - 실패",
          "input": {
            "profile": {
              "name": "홍길동",
              "email": "invalid-email"
            }
          },
          "expected": {
            "valid": false,
            "error": "email",
            "errorPath": "profile.email"
          }
        }
      ]
    },
    {
      "id": "nested-002",
      "rule": "multiple",
      "category": "nested",
      "description": "반복 그룹 (multiple) 검증",
      "spec": {
        "type": "group",
        "properties": {
          "options": {
            "type": "group",
            "multiple": true,
            "rules": {
              "minformcount": 1,
              "maxformcount": 5
            },
            "properties": {
              "name": {
                "type": "text",
                "rules": {
                  "required": true
                }
              },
              "price": {
                "type": "number",
                "rules": {
                  "required": true,
                  "min": 0
                }
              }
            }
          }
        }
      },
      "cases": [
        {
          "description": "유효한 옵션 배열 - 성공",
          "input": {
            "options": [
              { "name": "빨강", "price": 1000 },
              { "name": "파랑", "price": 1500 }
            ]
          },
          "expected": {
            "valid": true,
            "error": null
          }
        },
        {
          "description": "빈 배열 - 실패 (minformcount)",
          "input": {
            "options": []
          },
          "expected": {
            "valid": false,
            "error": "minformcount",
            "errorPath": "options"
          }
        },
        {
          "description": "너무 많은 항목 - 실패 (maxformcount)",
          "input": {
            "options": [
              { "name": "옵션1", "price": 100 },
              { "name": "옵션2", "price": 200 },
              { "name": "옵션3", "price": 300 },
              { "name": "옵션4", "price": 400 },
              { "name": "옵션5", "price": 500 },
              { "name": "옵션6", "price": 600 }
            ]
          },
          "expected": {
            "valid": false,
            "error": "maxformcount",
            "errorPath": "options"
          }
        },
        {
          "description": "배열 내 항목에서 필수 필드 누락 - 실패",
          "input": {
            "options": [
              { "name": "빨강", "price": 1000 },
              { "name": "", "price": 1500 }
            ]
          },
          "expected": {
            "valid": false,
            "error": "required",
            "errorPath": "options[1].name"
          }
        },
        {
          "description": "배열 내 항목에서 음수 가격 - 실패",
          "input": {
            "options": [
              { "name": "빨강", "price": -100 }
            ]
          },
          "expected": {
            "valid": false,
            "error": "min",
            "errorPath": "options[0].price"
          }
        }
      ]
    }
  ]
}
```

### 5. 복합 시나리오 테스트

```json
{
  "testSuite": "validation-rules",
  "version": "1.0.0",
  "tests": [
    {
      "id": "complex-001",
      "rule": "multiple",
      "category": "complex",
      "description": "회원가입 폼 전체 검증",
      "spec": {
        "type": "group",
        "properties": {
          "email": {
            "type": "email",
            "rules": {
              "required": true,
              "email": true
            }
          },
          "password": {
            "type": "password",
            "rules": {
              "required": true,
              "minlength": 8,
              "match": "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$"
            }
          },
          "password_confirm": {
            "type": "password",
            "rules": {
              "required": true,
              "equalTo": "password"
            }
          },
          "name": {
            "type": "text",
            "rules": {
              "required": true,
              "rangelength": [2, 50]
            }
          },
          "terms_agreed": {
            "type": "checkbox",
            "rules": {
              "required": true
            }
          }
        }
      },
      "cases": [
        {
          "description": "모든 필드 유효 - 성공",
          "input": {
            "email": "user@example.com",
            "password": "SecurePass123",
            "password_confirm": "SecurePass123",
            "name": "홍길동",
            "terms_agreed": "1"
          },
          "expected": {
            "valid": true,
            "error": null
          }
        },
        {
          "description": "이메일 누락 - 실패",
          "input": {
            "email": "",
            "password": "SecurePass123",
            "password_confirm": "SecurePass123",
            "name": "홍길동",
            "terms_agreed": "1"
          },
          "expected": {
            "valid": false,
            "error": "required",
            "errorPath": "email"
          }
        },
        {
          "description": "비밀번호 너무 짧음 - 실패",
          "input": {
            "email": "user@example.com",
            "password": "Short1",
            "password_confirm": "Short1",
            "name": "홍길동",
            "terms_agreed": "1"
          },
          "expected": {
            "valid": false,
            "error": "minlength",
            "errorPath": "password"
          }
        },
        {
          "description": "비밀번호 패턴 불일치 - 실패",
          "input": {
            "email": "user@example.com",
            "password": "alllowercase",
            "password_confirm": "alllowercase",
            "name": "홍길동",
            "terms_agreed": "1"
          },
          "expected": {
            "valid": false,
            "error": "match",
            "errorPath": "password"
          }
        },
        {
          "description": "비밀번호 확인 불일치 - 실패",
          "input": {
            "email": "user@example.com",
            "password": "SecurePass123",
            "password_confirm": "DifferentPass456",
            "name": "홍길동",
            "terms_agreed": "1"
          },
          "expected": {
            "valid": false,
            "error": "equalTo",
            "errorPath": "password_confirm"
          }
        },
        {
          "description": "약관 미동의 - 실패",
          "input": {
            "email": "user@example.com",
            "password": "SecurePass123",
            "password_confirm": "SecurePass123",
            "name": "홍길동",
            "terms_agreed": ""
          },
          "expected": {
            "valid": false,
            "error": "required",
            "errorPath": "terms_agreed"
          }
        }
      ]
    }
  ]
}
```

---

## CI/CD 통합

### GitHub Actions 예시

```yaml
# .github/workflows/validation-tests.yml
name: Validation Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test-js:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:validation
      - run: npm run test:validation -- --output=results/js.json
      - uses: actions/upload-artifact@v3
        with:
          name: js-results
          path: results/js.json

  test-php:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
      - run: composer install
      - run: composer test
      - run: composer test -- --output=results/php.json
      - uses: actions/upload-artifact@v3
        with:
          name: php-results
          path: results/php.json

  test-go:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v4
        with:
          go-version: '1.21'
      - run: go test ./... -v
      - run: go test ./... -json > results/go.json
      - uses: actions/upload-artifact@v3
        with:
          name: go-results
          path: results/go.json

  idempotency-check:
    needs: [test-js, test-php, test-go]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/download-artifact@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: node tests/runner/idempotency-check.js
```

---

## 참고 자료

- [검증 규칙 상세 가이드](./VALIDATION-RULES.md)
- [YAML 스펙 형식 명세서](./SPEC.md)
- [프로젝트 개요](./README.md)

---

*이 문서는 Form Generator의 테스트 케이스 구조에 대한 공식 명세서입니다.*
*버전: 1.0.0*
*최종 수정: 2026-01-04*
