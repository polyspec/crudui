# Limepie 유효성 검사 규칙 명세서

> 이 문서는 Limepie PHP 시스템에서 사용되는 25개의 유효성 검사 규칙에 대한 상세 명세를 제공합니다.

## 목차

1. [기본 규칙](#기본-규칙)
2. [문자열 규칙](#문자열-규칙)
3. [숫자 규칙](#숫자-규칙)
4. [비교 규칙](#비교-규칙)
5. [날짜 규칙](#날짜-규칙)
6. [배열 규칙](#배열-규칙)
7. [파일 규칙](#파일-규칙)
8. [조건부 규칙](#조건부-규칙)

---

## 기본 규칙

### 1. required

필수 입력 필드를 지정합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `required` |
| **파라미터 타입** | `boolean` 또는 `string` (조건식) |
| **설명** | 필드가 반드시 값을 가져야 함을 지정합니다. 조건식을 사용하여 조건부 필수 입력도 가능합니다. |

**동작 방식:**
- **유효**: 값이 존재하고, 빈 문자열이 아니며, null이 아닌 경우
- **무효**: 값이 없거나, 빈 문자열이거나, null인 경우

**YAML 예시:**
```yaml
fields:
  username:
    type: text
    rules:
      required: true
    messages:
      required: "사용자명은 필수 입력 항목입니다."
```

**테스트 케이스:**
| 입력값 | 예상 결과 |
|--------|-----------|
| `"홍길동"` | 유효 |
| `""` | 무효 |
| `null` | 무효 |
| `"   "` (공백만) | 무효 |
| `0` | 유효 |

---

### 2. email

이메일 형식을 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `email` |
| **파라미터 타입** | `boolean` |
| **설명** | 값이 유효한 이메일 주소 형식인지 검증합니다. |

**동작 방식:**
- **유효**: RFC 5322 표준에 맞는 이메일 형식인 경우
- **무효**: 이메일 형식이 아닌 경우 (@ 누락, 도메인 없음 등)

**YAML 예시:**
```yaml
fields:
  email:
    type: email
    rules:
      required: true
      email: true
    messages:
      email: "올바른 이메일 주소를 입력해주세요."
```

**테스트 케이스:**
| 입력값 | 예상 결과 |
|--------|-----------|
| `"user@example.com"` | 유효 |
| `"user.name+tag@example.co.kr"` | 유효 |
| `"user@subdomain.example.com"` | 유효 |
| `"userexample.com"` | 무효 |
| `"user@"` | 무효 |
| `"@example.com"` | 무효 |
| `"user@.com"` | 무효 |

---

### 3. url

URL 형식을 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `url` |
| **파라미터 타입** | `boolean` |
| **설명** | 값이 유효한 URL 형식인지 검증합니다. |

**동작 방식:**
- **유효**: http://, https://, ftp:// 등 유효한 프로토콜과 도메인을 포함하는 경우
- **무효**: URL 형식이 아닌 경우

**YAML 예시:**
```yaml
fields:
  website:
    type: url
    rules:
      url: true
    messages:
      url: "올바른 URL을 입력해주세요."
```

**테스트 케이스:**
| 입력값 | 예상 결과 |
|--------|-----------|
| `"https://example.com"` | 유효 |
| `"http://example.com/path?query=1"` | 유효 |
| `"https://sub.example.co.kr/path"` | 유효 |
| `"ftp://files.example.com"` | 유효 |
| `"example.com"` | 무효 |
| `"http://"` | 무효 |
| `"not a url"` | 무효 |

---

## 문자열 규칙

### 4. minlength

최소 문자 길이를 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `minlength` |
| **파라미터 타입** | `integer` |
| **설명** | 입력값의 문자 길이가 지정된 최소값 이상인지 검증합니다. |

**동작 방식:**
- **유효**: 문자열 길이 >= 지정된 최소값
- **무효**: 문자열 길이 < 지정된 최소값

**YAML 예시:**
```yaml
fields:
  password:
    type: password
    rules:
      required: true
      minlength: 8
    messages:
      minlength: "비밀번호는 최소 8자 이상이어야 합니다."
```

**테스트 케이스 (minlength: 8):**
| 입력값 | 예상 결과 |
|--------|-----------|
| `"password123"` | 유효 (11자) |
| `"12345678"` | 유효 (8자) |
| `"short"` | 무효 (5자) |
| `""` | 무효 (0자) |
| `"한글테스트입니다"` | 유효 (8자 - 한글도 1자로 계산) |

---

### 5. maxlength

최대 문자 길이를 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `maxlength` |
| **파라미터 타입** | `integer` |
| **설명** | 입력값의 문자 길이가 지정된 최대값 이하인지 검증합니다. |

**동작 방식:**
- **유효**: 문자열 길이 <= 지정된 최대값
- **무효**: 문자열 길이 > 지정된 최대값

**YAML 예시:**
```yaml
fields:
  nickname:
    type: text
    rules:
      maxlength: 20
    messages:
      maxlength: "닉네임은 최대 20자까지 입력 가능합니다."
```

**테스트 케이스 (maxlength: 20):**
| 입력값 | 예상 결과 |
|--------|-----------|
| `"짧은닉네임"` | 유효 (5자) |
| `"정확히스무자닉네임입니다"` | 유효 (12자) |
| `"이것은스무자를초과하는아주긴닉네임입니다"` | 무효 (21자) |
| `""` | 유효 (0자) |

---

### 6. rangelength

문자 길이 범위를 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `rangelength` |
| **파라미터 타입** | `array` [min, max] |
| **설명** | 입력값의 문자 길이가 지정된 범위 내에 있는지 검증합니다. |

**동작 방식:**
- **유효**: min <= 문자열 길이 <= max
- **무효**: 문자열 길이 < min 또는 문자열 길이 > max

**YAML 예시:**
```yaml
fields:
  username:
    type: text
    rules:
      rangelength: [3, 15]
    messages:
      rangelength: "사용자명은 3자 이상 15자 이하로 입력해주세요."
```

**테스트 케이스 (rangelength: [3, 15]):**
| 입력값 | 예상 결과 |
|--------|-----------|
| `"abc"` | 유효 (3자) |
| `"validusername"` | 유효 (13자) |
| `"fifteenchars!!"` | 유효 (15자) |
| `"ab"` | 무효 (2자) |
| `"thisisaverylongusername"` | 무효 (23자) |

---

### 7. match

정규식 패턴을 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `match` |
| **파라미터 타입** | `string` (정규식 패턴) |
| **설명** | 입력값이 지정된 정규식 패턴과 일치하는지 검증합니다. |

**동작 방식:**
- **유효**: 입력값이 정규식 패턴과 일치하는 경우
- **무효**: 입력값이 정규식 패턴과 일치하지 않는 경우

**YAML 예시:**
```yaml
fields:
  phone:
    type: tel
    rules:
      match: "^01[016789]-?\\d{3,4}-?\\d{4}$"
    messages:
      match: "올바른 휴대폰 번호 형식이 아닙니다."

  slug:
    type: text
    rules:
      match: "^[a-z0-9-]+$"
    messages:
      match: "영문 소문자, 숫자, 하이픈만 사용할 수 있습니다."
```

**테스트 케이스 (match: "^[a-z0-9-]+$"):**
| 입력값 | 예상 결과 |
|--------|-----------|
| `"my-slug-123"` | 유효 |
| `"simple"` | 유효 |
| `"test123"` | 유효 |
| `"My-Slug"` | 무효 (대문자 포함) |
| `"slug with space"` | 무효 (공백 포함) |
| `"slug_underscore"` | 무효 (언더스코어 포함) |

---

## 숫자 규칙

### 8. number

숫자 형식을 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `number` |
| **파라미터 타입** | `boolean` |
| **설명** | 입력값이 유효한 숫자(정수 또는 소수)인지 검증합니다. |

**동작 방식:**
- **유효**: 정수 또는 소수점을 포함한 숫자인 경우
- **무효**: 숫자가 아닌 문자가 포함된 경우

**YAML 예시:**
```yaml
fields:
  price:
    type: number
    rules:
      number: true
    messages:
      number: "숫자만 입력해주세요."
```

**테스트 케이스:**
| 입력값 | 예상 결과 |
|--------|-----------|
| `"123"` | 유효 |
| `"123.45"` | 유효 |
| `"-123.45"` | 유효 |
| `"0.5"` | 유효 |
| `"123abc"` | 무효 |
| `"1,234"` | 무효 (쉼표 포함) |
| `"abc"` | 무효 |

---

### 9. digits

정수만 허용합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `digits` |
| **파라미터 타입** | `boolean` |
| **설명** | 입력값이 양의 정수(0-9로만 구성)인지 검증합니다. |

**동작 방식:**
- **유효**: 0-9 숫자로만 구성된 경우
- **무효**: 소수점, 음수 기호, 문자 등이 포함된 경우

**YAML 예시:**
```yaml
fields:
  quantity:
    type: number
    rules:
      digits: true
    messages:
      digits: "양의 정수만 입력해주세요."
```

**테스트 케이스:**
| 입력값 | 예상 결과 |
|--------|-----------|
| `"123"` | 유효 |
| `"0"` | 유효 |
| `"999999"` | 유효 |
| `"123.45"` | 무효 (소수점) |
| `"-123"` | 무효 (음수) |
| `"12 34"` | 무효 (공백) |

---

### 10. min

최소 숫자값을 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `min` |
| **파라미터 타입** | `number` |
| **설명** | 입력값이 지정된 최소값 이상인지 검증합니다. |

**동작 방식:**
- **유효**: 입력값 >= 지정된 최소값
- **무효**: 입력값 < 지정된 최소값

**YAML 예시:**
```yaml
fields:
  age:
    type: number
    rules:
      min: 0
    messages:
      min: "나이는 0 이상이어야 합니다."

  price:
    type: number
    rules:
      min: 1000
    messages:
      min: "최소 가격은 1,000원입니다."
```

**테스트 케이스 (min: 10):**
| 입력값 | 예상 결과 |
|--------|-----------|
| `15` | 유효 |
| `10` | 유효 |
| `10.5` | 유효 |
| `9` | 무효 |
| `9.99` | 무효 |
| `-5` | 무효 |

---

### 11. max

최대 숫자값을 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `max` |
| **파라미터 타입** | `number` |
| **설명** | 입력값이 지정된 최대값 이하인지 검증합니다. |

**동작 방식:**
- **유효**: 입력값 <= 지정된 최대값
- **무효**: 입력값 > 지정된 최대값

**YAML 예시:**
```yaml
fields:
  discount:
    type: number
    rules:
      max: 100
    messages:
      max: "할인율은 100%를 초과할 수 없습니다."
```

**테스트 케이스 (max: 100):**
| 입력값 | 예상 결과 |
|--------|-----------|
| `50` | 유효 |
| `100` | 유효 |
| `0` | 유효 |
| `-10` | 유효 |
| `101` | 무효 |
| `100.01` | 무효 |

---

### 12. range

숫자 범위를 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `range` |
| **파라미터 타입** | `array` [min, max] |
| **설명** | 입력값이 지정된 숫자 범위 내에 있는지 검증합니다. |

**동작 방식:**
- **유효**: min <= 입력값 <= max
- **무효**: 입력값 < min 또는 입력값 > max

**YAML 예시:**
```yaml
fields:
  rating:
    type: number
    rules:
      range: [1, 5]
    messages:
      range: "평점은 1에서 5 사이로 입력해주세요."

  percentage:
    type: number
    rules:
      range: [0, 100]
    messages:
      range: "0에서 100 사이의 값을 입력해주세요."
```

**테스트 케이스 (range: [1, 5]):**
| 입력값 | 예상 결과 |
|--------|-----------|
| `1` | 유효 |
| `3` | 유효 |
| `5` | 유효 |
| `3.5` | 유효 |
| `0` | 무효 |
| `6` | 무효 |
| `-1` | 무효 |

---

### 13. step

숫자 단계(step)를 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `step` |
| **파라미터 타입** | `number` |
| **설명** | 입력값이 지정된 단계의 배수인지 검증합니다. |

**동작 방식:**
- **유효**: 입력값이 step의 배수인 경우
- **무효**: 입력값이 step의 배수가 아닌 경우

**YAML 예시:**
```yaml
fields:
  quantity:
    type: number
    rules:
      step: 5
    messages:
      step: "수량은 5의 배수로 입력해주세요."

  price:
    type: number
    rules:
      step: 0.01
    messages:
      step: "가격은 소수점 둘째자리까지만 입력 가능합니다."
```

**테스트 케이스 (step: 5):**
| 입력값 | 예상 결과 |
|--------|-----------|
| `0` | 유효 |
| `5` | 유효 |
| `10` | 유효 |
| `100` | 유효 |
| `3` | 무효 |
| `7` | 무효 |
| `12` | 무효 |

**테스트 케이스 (step: 0.5):**
| 입력값 | 예상 결과 |
|--------|-----------|
| `0.5` | 유효 |
| `1.0` | 유효 |
| `2.5` | 유효 |
| `0.3` | 무효 |
| `1.7` | 무효 |

---

## 비교 규칙

### 14. equalTo

다른 필드와 값이 일치하는지 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `equalTo` |
| **파라미터 타입** | `string` (필드 참조) |
| **설명** | 현재 필드의 값이 지정된 다른 필드의 값과 동일한지 검증합니다. |

**동작 방식:**
- **유효**: 두 필드의 값이 정확히 일치하는 경우
- **무효**: 두 필드의 값이 다른 경우

**YAML 예시:**
```yaml
fields:
  password:
    type: password
    rules:
      required: true
      minlength: 8

  password_confirm:
    type: password
    rules:
      required: true
      equalTo: password
    messages:
      equalTo: "비밀번호가 일치하지 않습니다."
```

**테스트 케이스:**
| password | password_confirm | 예상 결과 |
|----------|------------------|-----------|
| `"secret123"` | `"secret123"` | 유효 |
| `"password"` | `"password"` | 유효 |
| `"secret123"` | `"Secret123"` | 무효 (대소문자 구분) |
| `"secret123"` | `"secret124"` | 무효 |
| `"abc"` | `"abcd"` | 무효 |

---

### 15. notEqual

지정된 값과 다른지 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `notEqual` |
| **파라미터 타입** | `mixed` (값 또는 필드 참조) |
| **설명** | 입력값이 지정된 값과 다른지 검증합니다. |

**동작 방식:**
- **유효**: 입력값이 지정된 값과 다른 경우
- **무효**: 입력값이 지정된 값과 같은 경우

**YAML 예시:**
```yaml
fields:
  new_password:
    type: password
    rules:
      required: true
      notEqual: old_password
    messages:
      notEqual: "새 비밀번호는 기존 비밀번호와 달라야 합니다."

  status:
    type: select
    rules:
      notEqual: "pending"
    messages:
      notEqual: "대기 상태가 아닌 값을 선택해주세요."
```

**테스트 케이스 (notEqual: "admin"):**
| 입력값 | 예상 결과 |
|--------|-----------|
| `"user"` | 유효 |
| `"manager"` | 유효 |
| `"Admin"` | 유효 (대소문자 구분) |
| `"admin"` | 무효 |

---

### 16. in

값이 지정된 배열 내에 있는지 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `in` |
| **파라미터 타입** | `array` |
| **설명** | 입력값이 허용된 값 목록에 포함되어 있는지 검증합니다. |

**동작 방식:**
- **유효**: 입력값이 배열에 포함된 경우
- **무효**: 입력값이 배열에 포함되지 않은 경우

**YAML 예시:**
```yaml
fields:
  status:
    type: select
    rules:
      in: ["active", "inactive", "pending"]
    messages:
      in: "올바른 상태값을 선택해주세요."

  size:
    type: select
    rules:
      in: ["S", "M", "L", "XL"]
    messages:
      in: "사이즈를 선택해주세요."
```

**테스트 케이스 (in: ["S", "M", "L", "XL"]):**
| 입력값 | 예상 결과 |
|--------|-----------|
| `"S"` | 유효 |
| `"M"` | 유효 |
| `"XL"` | 유효 |
| `"XXL"` | 무효 |
| `"s"` | 무효 (대소문자 구분) |
| `""` | 무효 |

---

## 날짜 규칙

### 17. date

유효한 날짜 형식을 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `date` |
| **파라미터 타입** | `boolean` |
| **설명** | 입력값이 유효한 날짜인지 검증합니다. |

**동작 방식:**
- **유효**: 파싱 가능한 날짜 문자열인 경우
- **무효**: 날짜로 파싱할 수 없는 경우

**YAML 예시:**
```yaml
fields:
  birth_date:
    type: date
    rules:
      date: true
    messages:
      date: "올바른 날짜를 입력해주세요."
```

**테스트 케이스:**
| 입력값 | 예상 결과 |
|--------|-----------|
| `"2024-01-15"` | 유효 |
| `"2024/01/15"` | 유효 |
| `"January 15, 2024"` | 유효 |
| `"2024-02-30"` | 무효 (존재하지 않는 날짜) |
| `"not a date"` | 무효 |
| `"2024-13-01"` | 무효 (잘못된 월) |

---

### 18. dateISO

ISO 8601 날짜 형식을 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `dateISO` |
| **파라미터 타입** | `boolean` |
| **설명** | 입력값이 ISO 8601 형식(YYYY-MM-DD)인지 검증합니다. |

**동작 방식:**
- **유효**: YYYY-MM-DD 형식의 날짜인 경우
- **무효**: ISO 형식이 아닌 경우

**YAML 예시:**
```yaml
fields:
  event_date:
    type: date
    rules:
      dateISO: true
    messages:
      dateISO: "날짜는 YYYY-MM-DD 형식으로 입력해주세요."
```

**테스트 케이스:**
| 입력값 | 예상 결과 |
|--------|-----------|
| `"2024-01-15"` | 유효 |
| `"2024-12-31"` | 유효 |
| `"2024-1-15"` | 무효 (월이 한 자리) |
| `"2024/01/15"` | 무효 (슬래시 사용) |
| `"15-01-2024"` | 무효 (순서가 다름) |
| `"24-01-15"` | 무효 (연도가 두 자리) |

---

### 19. enddate

종료일이 시작일 이후인지 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `enddate` |
| **파라미터 타입** | `string` (시작일 필드 참조) |
| **설명** | 종료일이 시작일과 같거나 그 이후인지 검증합니다. |

**동작 방식:**
- **유효**: 종료일 >= 시작일
- **무효**: 종료일 < 시작일

**YAML 예시:**
```yaml
fields:
  start_date:
    type: date
    rules:
      required: true
      dateISO: true

  end_date:
    type: date
    rules:
      required: true
      dateISO: true
      enddate: start_date
    messages:
      enddate: "종료일은 시작일 이후여야 합니다."
```

**테스트 케이스:**
| start_date | end_date | 예상 결과 |
|------------|----------|-----------|
| `"2024-01-01"` | `"2024-01-31"` | 유효 |
| `"2024-01-15"` | `"2024-01-15"` | 유효 (같은 날짜) |
| `"2024-06-01"` | `"2024-12-31"` | 유효 |
| `"2024-01-31"` | `"2024-01-01"` | 무효 |
| `"2024-12-01"` | `"2024-01-01"` | 무효 |

---

## 배열 규칙

### 20. mincount

배열의 최소 항목 수를 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `mincount` |
| **파라미터 타입** | `integer` |
| **설명** | 배열에 최소한 지정된 개수 이상의 항목이 있는지 검증합니다. |

**동작 방식:**
- **유효**: 배열 항목 수 >= 지정된 최소값
- **무효**: 배열 항목 수 < 지정된 최소값

**YAML 예시:**
```yaml
fields:
  tags:
    type: array
    rules:
      mincount: 1
    messages:
      mincount: "최소 1개 이상의 태그를 선택해주세요."

  images:
    type: file
    multiple: true
    rules:
      mincount: 3
    messages:
      mincount: "최소 3개 이상의 이미지를 업로드해주세요."
```

**테스트 케이스 (mincount: 2):**
| 입력값 | 예상 결과 |
|--------|-----------|
| `["a", "b", "c"]` | 유효 (3개) |
| `["a", "b"]` | 유효 (2개) |
| `["a"]` | 무효 (1개) |
| `[]` | 무효 (0개) |

---

### 21. maxcount

배열의 최대 항목 수를 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `maxcount` |
| **파라미터 타입** | `integer` |
| **설명** | 배열에 지정된 개수 이하의 항목만 있는지 검증합니다. |

**동작 방식:**
- **유효**: 배열 항목 수 <= 지정된 최대값
- **무효**: 배열 항목 수 > 지정된 최대값

**YAML 예시:**
```yaml
fields:
  categories:
    type: array
    rules:
      maxcount: 5
    messages:
      maxcount: "카테고리는 최대 5개까지 선택 가능합니다."
```

**테스트 케이스 (maxcount: 3):**
| 입력값 | 예상 결과 |
|--------|-----------|
| `["a"]` | 유효 (1개) |
| `["a", "b", "c"]` | 유효 (3개) |
| `[]` | 유효 (0개) |
| `["a", "b", "c", "d"]` | 무효 (4개) |

---

### 22. minformcount

폼 요소의 최소 개수를 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `minformcount` |
| **파라미터 타입** | `integer` |
| **설명** | 반복 폼 그룹에서 최소한 지정된 개수 이상의 폼이 있는지 검증합니다. |

**동작 방식:**
- **유효**: 폼 요소 수 >= 지정된 최소값
- **무효**: 폼 요소 수 < 지정된 최소값

**YAML 예시:**
```yaml
fields:
  contact_persons:
    type: group
    repeatable: true
    rules:
      minformcount: 1
    messages:
      minformcount: "최소 1명의 담당자 정보를 입력해주세요."
    fields:
      name:
        type: text
        rules:
          required: true
      phone:
        type: tel
```

**테스트 케이스 (minformcount: 2):**
| 폼 요소 수 | 예상 결과 |
|------------|-----------|
| 3개 | 유효 |
| 2개 | 유효 |
| 1개 | 무효 |
| 0개 | 무효 |

---

### 23. maxformcount

폼 요소의 최대 개수를 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `maxformcount` |
| **파라미터 타입** | `integer` |
| **설명** | 반복 폼 그룹에서 지정된 개수 이하의 폼만 허용합니다. |

**동작 방식:**
- **유효**: 폼 요소 수 <= 지정된 최대값
- **무효**: 폼 요소 수 > 지정된 최대값

**YAML 예시:**
```yaml
fields:
  order_items:
    type: group
    repeatable: true
    rules:
      maxformcount: 10
    messages:
      maxformcount: "한 번에 최대 10개 상품까지만 주문 가능합니다."
    fields:
      product_id:
        type: select
      quantity:
        type: number
```

**테스트 케이스 (maxformcount: 5):**
| 폼 요소 수 | 예상 결과 |
|------------|-----------|
| 3개 | 유효 |
| 5개 | 유효 |
| 0개 | 유효 |
| 6개 | 무효 |

---

### 24. unique

배열 내 고유값을 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `unique` |
| **파라미터 타입** | `boolean` |
| **설명** | 배열 내의 모든 값이 고유한지(중복이 없는지) 검증합니다. |

**동작 방식:**
- **유효**: 배열 내 모든 값이 고유한 경우
- **무효**: 배열 내 중복된 값이 있는 경우

**YAML 예시:**
```yaml
fields:
  emails:
    type: array
    rules:
      unique: true
    messages:
      unique: "중복된 이메일 주소가 있습니다."

  options:
    type: group
    repeatable: true
    rules:
      unique: option_value
    messages:
      unique: "옵션 값은 중복될 수 없습니다."
```

**테스트 케이스:**
| 입력값 | 예상 결과 |
|--------|-----------|
| `["a", "b", "c"]` | 유효 |
| `["apple", "banana", "cherry"]` | 유효 |
| `[]` | 유효 |
| `["a", "b", "a"]` | 무효 |
| `["test", "test"]` | 무효 |

---

## 파일 규칙

### 25. accept

파일 MIME 타입을 검증합니다.

| 항목 | 내용 |
|------|------|
| **규칙명** | `accept` |
| **파라미터 타입** | `string` 또는 `array` |
| **설명** | 업로드된 파일의 MIME 타입이 허용된 타입 목록에 있는지 검증합니다. |

**동작 방식:**
- **유효**: 파일의 MIME 타입이 허용 목록에 포함된 경우
- **무효**: 파일의 MIME 타입이 허용 목록에 없는 경우

**YAML 예시:**
```yaml
fields:
  profile_image:
    type: file
    rules:
      accept: "image/*"
    messages:
      accept: "이미지 파일만 업로드 가능합니다."

  document:
    type: file
    rules:
      accept: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    messages:
      accept: "PDF 또는 Word 문서만 업로드 가능합니다."

  spreadsheet:
    type: file
    rules:
      accept: ".xlsx,.xls,.csv"
    messages:
      accept: "엑셀 또는 CSV 파일만 업로드 가능합니다."
```

**테스트 케이스 (accept: "image/*"):**
| 파일 MIME 타입 | 예상 결과 |
|----------------|-----------|
| `image/jpeg` | 유효 |
| `image/png` | 유효 |
| `image/gif` | 유효 |
| `image/webp` | 유효 |
| `application/pdf` | 무효 |
| `text/plain` | 무효 |

**테스트 케이스 (accept: ["application/pdf", "image/jpeg"]):**
| 파일 MIME 타입 | 예상 결과 |
|----------------|-----------|
| `application/pdf` | 유효 |
| `image/jpeg` | 유효 |
| `image/png` | 무효 |
| `text/plain` | 무효 |

---

## 조건부 규칙

조건부 규칙은 특정 조건이 만족될 때만 유효성 검사를 수행합니다.

### 기본 조건부 필수

다른 필드의 값에 따라 필수 여부가 결정됩니다.

**문법:**
```yaml
rules:
  required: ".필드명 == '값'"
```

**YAML 예시:**
```yaml
fields:
  has_company:
    type: checkbox
    label: "회사 정보 입력"

  company_name:
    type: text
    rules:
      required: ".has_company == '1'"
    messages:
      required: "회사명을 입력해주세요."

  company_address:
    type: text
    rules:
      required: ".has_company == '1'"
    messages:
      required: "회사 주소를 입력해주세요."
```

**테스트 케이스:**
| has_company | company_name | 예상 결과 |
|-------------|--------------|-----------|
| `"1"` | `"ABC 주식회사"` | 유효 |
| `"1"` | `""` | 무효 (필수) |
| `"0"` | `""` | 유효 (필수 아님) |
| `"0"` | `"ABC 주식회사"` | 유효 |

---

### 복합 조건

여러 조건을 조합하여 사용할 수 있습니다.

**지원 연산자:**
- `==` : 같음
- `!=` : 다름
- `>` : 초과
- `>=` : 이상
- `<` : 미만
- `<=` : 이하
- `&&` : AND (그리고)
- `||` : OR (또는)

**YAML 예시:**
```yaml
fields:
  user_type:
    type: select
    options:
      personal: "개인"
      business: "기업"

  employee_count:
    type: number
    rules:
      required: ".user_type == 'business'"

  business_license:
    type: file
    rules:
      # 기업이면서 직원 수가 5명 이상일 때 필수
      required: ".user_type == 'business' && .employee_count >= 5"
    messages:
      required: "사업자등록증을 업로드해주세요."

  special_discount_code:
    type: text
    rules:
      # VIP이거나 프리미엄 회원일 때 입력 가능
      required: ".membership == 'vip' || .membership == 'premium'"
```

**테스트 케이스 (required: ".user_type == 'business' && .employee_count >= 5"):**
| user_type | employee_count | business_license | 예상 결과 |
|-----------|----------------|------------------|-----------|
| `"business"` | `10` | 파일 있음 | 유효 |
| `"business"` | `10` | 파일 없음 | 무효 |
| `"business"` | `3` | 파일 없음 | 유효 (조건 불충족) |
| `"personal"` | `10` | 파일 없음 | 유효 (조건 불충족) |

---

### 배열 와일드카드 조건

배열 내 특정 조건을 검증합니다.

**문법:**
```yaml
rules:
  required: "배열명.*.필드명 == 값"
```

**YAML 예시:**
```yaml
fields:
  items:
    type: group
    repeatable: true
    fields:
      name:
        type: text
        rules:
          required: true
      is_close:
        type: checkbox
      close_reason:
        type: textarea
        rules:
          # items 배열 내 해당 항목의 is_close가 1일 때 필수
          required: "items.*.is_close == 1"
        messages:
          required: "종료 사유를 입력해주세요."
```

**테스트 케이스:**
```json
// 유효한 케이스
{
  "items": [
    { "name": "항목1", "is_close": "0", "close_reason": "" },
    { "name": "항목2", "is_close": "1", "close_reason": "재고 소진" }
  ]
}

// 무효한 케이스
{
  "items": [
    { "name": "항목1", "is_close": "1", "close_reason": "" }  // close_reason 필수
  ]
}
```

---

### in 연산자 조건

값이 지정된 목록에 포함되어 있는지 검증합니다.

**문법:**
```yaml
rules:
  required: ".필드명 in 값1,값2,값3"
```

**YAML 예시:**
```yaml
fields:
  is_display:
    type: select
    options:
      1: "표시"
      2: "미표시"
      3: "예약"

  display_date:
    type: datetime
    rules:
      # is_display가 2(미표시) 또는 3(예약)일 때 필수
      required: ".is_display in 2,3"
    messages:
      required: "표시 예정일을 입력해주세요."

  category:
    type: select
    options:
      electronics: "전자제품"
      clothing: "의류"
      food: "식품"
      other: "기타"

  warranty_period:
    type: number
    rules:
      # 전자제품이나 의류일 때 보증기간 필수
      required: ".category in electronics,clothing"
    messages:
      required: "보증 기간을 입력해주세요."
```

**테스트 케이스 (required: ".is_display in 2,3"):**
| is_display | display_date | 예상 결과 |
|------------|--------------|-----------|
| `"1"` | `""` | 유효 (조건 불충족) |
| `"2"` | `"2024-01-15 10:00"` | 유효 |
| `"2"` | `""` | 무효 |
| `"3"` | `"2024-01-15 10:00"` | 유효 |
| `"3"` | `""` | 무효 |

---

## 복합 규칙 사용 예시

여러 규칙을 조합한 실제 사용 예시입니다.

### 사용자 등록 폼

```yaml
form:
  name: user_registration
  fields:
    username:
      type: text
      label: "사용자명"
      rules:
        required: true
        minlength: 3
        maxlength: 20
        match: "^[a-zA-Z0-9_]+$"
      messages:
        required: "사용자명을 입력해주세요."
        minlength: "사용자명은 최소 3자 이상이어야 합니다."
        maxlength: "사용자명은 최대 20자까지 가능합니다."
        match: "영문, 숫자, 언더스코어만 사용할 수 있습니다."

    email:
      type: email
      label: "이메일"
      rules:
        required: true
        email: true
      messages:
        required: "이메일을 입력해주세요."
        email: "올바른 이메일 형식이 아닙니다."

    password:
      type: password
      label: "비밀번호"
      rules:
        required: true
        minlength: 8
        match: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$"
      messages:
        required: "비밀번호를 입력해주세요."
        minlength: "비밀번호는 최소 8자 이상이어야 합니다."
        match: "비밀번호는 대문자, 소문자, 숫자를 각각 1개 이상 포함해야 합니다."

    password_confirm:
      type: password
      label: "비밀번호 확인"
      rules:
        required: true
        equalTo: password
      messages:
        required: "비밀번호 확인을 입력해주세요."
        equalTo: "비밀번호가 일치하지 않습니다."

    age:
      type: number
      label: "나이"
      rules:
        required: true
        digits: true
        range: [14, 120]
      messages:
        required: "나이를 입력해주세요."
        digits: "나이는 숫자만 입력 가능합니다."
        range: "14세 이상 120세 이하만 가입 가능합니다."

    profile_image:
      type: file
      label: "프로필 이미지"
      rules:
        accept: "image/jpeg,image/png,image/gif"
      messages:
        accept: "JPG, PNG, GIF 형식의 이미지만 업로드 가능합니다."
```

### 상품 등록 폼

```yaml
form:
  name: product_registration
  fields:
    product_name:
      type: text
      label: "상품명"
      rules:
        required: true
        rangelength: [2, 100]
      messages:
        required: "상품명을 입력해주세요."
        rangelength: "상품명은 2자 이상 100자 이하로 입력해주세요."

    price:
      type: number
      label: "가격"
      rules:
        required: true
        number: true
        min: 0
        step: 10
      messages:
        required: "가격을 입력해주세요."
        number: "올바른 가격을 입력해주세요."
        min: "가격은 0원 이상이어야 합니다."
        step: "가격은 10원 단위로 입력해주세요."

    discount_rate:
      type: number
      label: "할인율"
      rules:
        number: true
        range: [0, 100]
      messages:
        number: "올바른 할인율을 입력해주세요."
        range: "할인율은 0에서 100 사이로 입력해주세요."

    sale_start_date:
      type: date
      label: "판매 시작일"
      rules:
        required: true
        dateISO: true
      messages:
        required: "판매 시작일을 입력해주세요."
        dateISO: "날짜는 YYYY-MM-DD 형식으로 입력해주세요."

    sale_end_date:
      type: date
      label: "판매 종료일"
      rules:
        required: true
        dateISO: true
        enddate: sale_start_date
      messages:
        required: "판매 종료일을 입력해주세요."
        dateISO: "날짜는 YYYY-MM-DD 형식으로 입력해주세요."
        enddate: "종료일은 시작일 이후여야 합니다."

    options:
      type: group
      repeatable: true
      label: "상품 옵션"
      rules:
        minformcount: 1
        maxformcount: 10
        unique: option_name
      messages:
        minformcount: "최소 1개 이상의 옵션을 등록해주세요."
        maxformcount: "옵션은 최대 10개까지 등록 가능합니다."
        unique: "옵션명은 중복될 수 없습니다."
      fields:
        option_name:
          type: text
          rules:
            required: true
            maxlength: 50
        option_price:
          type: number
          rules:
            required: true
            number: true
            min: 0
```

---

## 에러 메시지 국제화

각 규칙에 대한 기본 에러 메시지는 다국어로 설정할 수 있습니다.

```yaml
# /config/validation_messages.ko.yaml
messages:
  required: "이 필드는 필수 입력 항목입니다."
  email: "올바른 이메일 주소를 입력해주세요."
  url: "올바른 URL을 입력해주세요."
  minlength: "최소 {0}자 이상 입력해주세요."
  maxlength: "최대 {0}자까지 입력 가능합니다."
  rangelength: "{0}자 이상 {1}자 이하로 입력해주세요."
  min: "{0} 이상의 값을 입력해주세요."
  max: "{0} 이하의 값을 입력해주세요."
  range: "{0}에서 {1} 사이의 값을 입력해주세요."
  number: "숫자만 입력해주세요."
  digits: "양의 정수만 입력해주세요."
  equalTo: "값이 일치하지 않습니다."
  notEqual: "다른 값을 입력해주세요."
  enddate: "종료일은 시작일 이후여야 합니다."
  match: "올바른 형식으로 입력해주세요."
  in: "허용된 값 중에서 선택해주세요."
  accept: "허용되지 않는 파일 형식입니다."
  mincount: "최소 {0}개 이상 선택해주세요."
  maxcount: "최대 {0}개까지 선택 가능합니다."
  minformcount: "최소 {0}개 이상 입력해주세요."
  maxformcount: "최대 {0}개까지 입력 가능합니다."
  unique: "중복된 값이 있습니다."
  date: "올바른 날짜를 입력해주세요."
  dateISO: "날짜는 YYYY-MM-DD 형식으로 입력해주세요."
  step: "{0}의 배수로 입력해주세요."
```

---

## 참고 사항

1. **검증 순서**: 규칙은 정의된 순서대로 검증됩니다. `required`가 실패하면 다른 규칙은 검증하지 않습니다.

2. **빈 값 처리**: `required`가 아닌 필드에 빈 값이 입력된 경우, 다른 규칙은 검증하지 않고 통과합니다.

3. **서버 사이드 검증**: 클라이언트 사이드 검증과 별도로 서버 사이드에서도 반드시 검증해야 합니다.

4. **커스텀 규칙**: 기본 규칙으로 충족되지 않는 경우, 커스텀 검증 규칙을 정의할 수 있습니다.

```yaml
fields:
  custom_field:
    type: text
    rules:
      custom: "validateCustomRule"
    messages:
      custom: "커스텀 검증에 실패했습니다."
```

---

*이 문서는 Limepie PHP 유효성 검사 시스템의 공식 명세서입니다.*
