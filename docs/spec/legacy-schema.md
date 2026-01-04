# YAML 스펙 형식 명세서

> Limepie PHP 폼 시스템의 YAML 스펙 형식에 대한 완전한 기술 명세서입니다.

## 목차

1. [개요](#개요)
2. [루트 구조](#루트-구조)
3. [필드 타입](#필드-타입)
4. [필드 속성](#필드-속성)
5. [검증 규칙](#검증-규칙)
6. [메시지 정의](#메시지-정의)
7. [조건부 표시](#조건부-표시)
8. [이벤트 및 스크립트](#이벤트-및-스크립트)
9. [특수 키워드](#특수-키워드)
10. [고급 기능](#고급-기능)
11. [전체 예시](#전체-예시)

---

## 개요

Limepie YAML 스펙은 폼의 구조, 필드, 검증 규칙, 동작을 선언적으로 정의하는 형식입니다. 단일 YAML 파일로 클라이언트와 서버 양쪽에서 동일한 검증 로직을 실행할 수 있습니다.

### 설계 원칙

1. **선언적 정의**: 폼의 모든 요소를 YAML로 선언
2. **플랫폼 독립성**: JavaScript, PHP, Go 등 다양한 언어에서 동일하게 해석
3. **계층적 구조**: 중첩 그룹을 통한 복잡한 폼 구조 지원
4. **확장성**: 커스텀 타입과 규칙 추가 가능

---

## 루트 구조

### 기본 루트 스키마

```yaml
type: group
name: form_name
label: 폼 제목
title: 페이지 타이틀
description: 폼에 대한 설명

action:
  method: POST
  url: /api/submit
  buttons:
    submit:
      label: 저장
      class: btn btn-primary
    cancel:
      label: 취소
      class: btn btn-secondary
      href: /list

properties:
  field_name:
    type: text
    label: 필드 레이블
    # ... 필드 속성들
```

### 루트 속성 상세

| 속성 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `type` | string | 예 | 반드시 `group`이어야 함 |
| `name` | string | 예 | 폼의 고유 식별자 (영문, 숫자, 언더스코어) |
| `label` | string | 아니오 | 폼의 표시 레이블 |
| `title` | string | 아니오 | 페이지 타이틀 (HTML title 태그용) |
| `description` | string | 아니오 | 폼에 대한 설명 텍스트 |
| `action` | object | 아니오 | 폼 제출 관련 설정 |
| `properties` | object | 예 | 필드 정의 객체 |

### action 속성 상세

```yaml
action:
  method: POST              # HTTP 메서드: GET, POST, PUT, PATCH, DELETE
  url: /api/endpoint        # 폼 제출 URL
  enctype: multipart/form-data  # 인코딩 타입 (파일 업로드 시 필요)

  buttons:
    submit:
      label: 저장           # 버튼 텍스트
      class: btn btn-primary  # CSS 클래스
      type: submit          # 버튼 타입: submit, button, reset

    cancel:
      label: 취소
      class: btn btn-secondary
      href: /list           # 링크 URL (버튼 클릭 시 이동)

    draft:
      label: 임시저장
      class: btn btn-outline
      onclick: saveDraft()  # 클릭 이벤트 핸들러
```

---

## 필드 타입

Limepie 시스템은 20개 이상의 필드 타입을 지원합니다.

### 1. text (텍스트 입력)

기본 텍스트 입력 필드입니다.

```yaml
field_name:
  type: text
  label: 이름
  placeholder: 이름을 입력하세요
  default: ""
  maxlength: 100
  rules:
    required: true
    minlength: 2
```

| 속성 | 설명 |
|------|------|
| `maxlength` | 최대 입력 문자 수 |
| `minlength` | 최소 입력 문자 수 (규칙으로도 가능) |
| `placeholder` | 플레이스홀더 텍스트 |
| `readonly` | 읽기 전용 여부 |
| `disabled` | 비활성화 여부 |

### 2. email (이메일)

이메일 형식 입력 필드입니다.

```yaml
email:
  type: email
  label: 이메일
  placeholder: example@email.com
  rules:
    required: true
    email: true
  messages:
    email: 올바른 이메일 형식이 아닙니다.
```

### 3. password (비밀번호)

비밀번호 입력 필드입니다. 입력값이 마스킹됩니다.

```yaml
password:
  type: password
  label: 비밀번호
  rules:
    required: true
    minlength: 8
    match: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$"
  messages:
    minlength: 비밀번호는 8자 이상이어야 합니다.
    match: 대문자, 소문자, 숫자를 포함해야 합니다.
```

### 4. number (숫자)

숫자 입력 필드입니다.

```yaml
price:
  type: number
  label: 가격
  default: 0
  min: 0
  max: 10000000
  step: 100
  rules:
    required: true
    number: true
    min: 0
  prepend: "₩"
  append: "원"
```

| 속성 | 설명 |
|------|------|
| `min` | 최소값 (HTML 속성) |
| `max` | 최대값 (HTML 속성) |
| `step` | 증감 단위 |
| `prepend` | 입력 앞에 표시할 텍스트 |
| `append` | 입력 뒤에 표시할 텍스트 |

### 5. textarea (여러 줄 텍스트)

여러 줄 텍스트 입력 영역입니다.

```yaml
description:
  type: textarea
  label: 상품 설명
  placeholder: 상품에 대한 상세 설명을 입력하세요
  rows: 5
  cols: 50
  rules:
    required: true
    maxlength: 5000
```

| 속성 | 설명 |
|------|------|
| `rows` | 표시할 행 수 |
| `cols` | 표시할 열 수 |
| `resize` | 리사이즈 가능 여부: `none`, `both`, `horizontal`, `vertical` |

### 6. hidden (숨김 필드)

화면에 표시되지 않는 숨김 필드입니다.

```yaml
user_id:
  type: hidden
  default: ""

csrf_token:
  type: hidden
  value: "{{csrf_token}}"
```

### 7. select (드롭다운 선택)

드롭다운 선택 필드입니다.

```yaml
category:
  type: select
  label: 카테고리
  default: ""
  items:
    "": 선택하세요
    electronics: 전자제품
    clothing: 의류
    food: 식품
  rules:
    required: true
  messages:
    required: 카테고리를 선택해주세요.
```

**동적 옵션 (데이터베이스 연동):**

```yaml
brand:
  type: select
  label: 브랜드
  items:
    model: Brand
    method: getSelectOptions
    value_field: id
    label_field: name
    empty_option: "브랜드 선택"
```

**그룹화된 옵션:**

```yaml
region:
  type: select
  label: 지역
  items:
    서울:
      gangnam: 강남구
      gangbuk: 강북구
      jongno: 종로구
    경기:
      suwon: 수원시
      seongnam: 성남시
      yongin: 용인시
```

### 8. choice (라디오 버튼)

단일 선택 라디오 버튼 그룹입니다.

```yaml
gender:
  type: choice
  label: 성별
  default: ""
  items:
    male: 남성
    female: 여성
    other: 기타
  rules:
    required: true
  layout: horizontal  # horizontal 또는 vertical
```

| 속성 | 설명 |
|------|------|
| `layout` | 배치 방향: `horizontal` (가로), `vertical` (세로, 기본값) |
| `inline` | 인라인 배치 여부 (boolean) |

### 9. multichoice (체크박스 그룹)

다중 선택 체크박스 그룹입니다.

```yaml
interests:
  type: multichoice
  label: 관심사
  items:
    tech: 기술
    sports: 스포츠
    music: 음악
    travel: 여행
    food: 음식
  rules:
    mincount: 1
    maxcount: 3
  messages:
    mincount: 최소 1개 이상 선택해주세요.
    maxcount: 최대 3개까지 선택 가능합니다.
```

### 10. checkbox (단일 체크박스)

단일 체크박스 필드입니다. 주로 동의/확인 용도로 사용됩니다.

```yaml
terms_agree:
  type: checkbox
  label: 이용약관에 동의합니다
  value: "1"
  rules:
    required: true
  messages:
    required: 이용약관에 동의해주세요.
```

| 속성 | 설명 |
|------|------|
| `value` | 체크 시 전송될 값 (기본값: "1") |
| `unchecked_value` | 미체크 시 전송될 값 (기본값: "0" 또는 빈 문자열) |

### 11. date (날짜)

날짜 선택 필드입니다.

```yaml
birth_date:
  type: date
  label: 생년월일
  format: YYYY-MM-DD
  min: 1900-01-01
  max: 2024-12-31
  rules:
    required: true
    dateISO: true
```

| 속성 | 설명 |
|------|------|
| `format` | 날짜 형식 (표시용) |
| `min` | 선택 가능한 최소 날짜 |
| `max` | 선택 가능한 최대 날짜 |

### 12. datetime (날짜+시간)

날짜와 시간을 함께 선택하는 필드입니다.

```yaml
event_datetime:
  type: datetime
  label: 이벤트 일시
  format: YYYY-MM-DD HH:mm
  rules:
    required: true
    datetime: true
```

### 13. time (시간)

시간만 선택하는 필드입니다.

```yaml
opening_time:
  type: time
  label: 영업 시작 시간
  format: HH:mm
  step: 900  # 15분 단위 (초)
```

### 14. image (이미지 업로드)

이미지 파일 업로드 필드입니다.

```yaml
profile_image:
  type: image
  label: 프로필 이미지
  accept: "image/jpeg,image/png,image/gif,image/webp"
  max_size: 5242880  # 5MB (바이트)
  dimensions:
    min_width: 100
    min_height: 100
    max_width: 2000
    max_height: 2000
  preview: true
  rules:
    required: true
    accept: "image/*"
  messages:
    accept: 이미지 파일만 업로드 가능합니다.
```

| 속성 | 설명 |
|------|------|
| `accept` | 허용 MIME 타입 |
| `max_size` | 최대 파일 크기 (바이트) |
| `dimensions` | 이미지 크기 제한 |
| `preview` | 미리보기 표시 여부 |
| `crop` | 크롭 기능 활성화 여부 |
| `resize` | 자동 리사이즈 설정 |

**다중 이미지 업로드:**

```yaml
gallery_images:
  type: image
  label: 갤러리 이미지
  multiple: true
  sortable: true
  min: 1
  max: 10
  rules:
    mincount: 1
    maxcount: 10
```

### 15. file (파일 업로드)

일반 파일 업로드 필드입니다.

```yaml
document:
  type: file
  label: 첨부 문서
  accept: ".pdf,.doc,.docx,.hwp"
  max_size: 10485760  # 10MB
  rules:
    accept: ["application/pdf", "application/msword"]
```

**다중 파일 업로드:**

```yaml
attachments:
  type: file
  label: 첨부파일
  multiple: true
  max: 5
  rules:
    maxcount: 5
```

### 16. group (중첩 그룹)

여러 필드를 그룹화하거나 반복 가능한 필드 세트를 정의합니다.

```yaml
address:
  type: group
  label: 주소
  properties:
    postal_code:
      type: text
      label: 우편번호
      rules:
        required: true
        match: "^\\d{5}$"
    address1:
      type: text
      label: 기본 주소
      rules:
        required: true
    address2:
      type: text
      label: 상세 주소
```

**반복 가능한 그룹 (배열):**

```yaml
options:
  type: group
  label: 상품 옵션
  multiple: true
  sortable: true
  min: 1
  max: 20
  add_button_label: 옵션 추가
  remove_button_label: 삭제

  rules:
    minformcount: 1
    maxformcount: 20

  properties:
    option_name:
      type: text
      label: 옵션명
      rules:
        required: true
    option_value:
      type: text
      label: 옵션값
      rules:
        required: true
    additional_price:
      type: number
      label: 추가금액
      default: 0
```

| 속성 | 설명 |
|------|------|
| `multiple` | 반복 가능 여부 (배열 형태) |
| `sortable` | 드래그 정렬 가능 여부 |
| `min` | 최소 항목 수 |
| `max` | 최대 항목 수 |
| `add_button_label` | 추가 버튼 텍스트 |
| `remove_button_label` | 삭제 버튼 텍스트 |
| `default_count` | 초기 표시할 항목 수 |
| `collapsible` | 접기/펼치기 가능 여부 |
| `collapsed` | 초기 접힘 상태 |

### 17. search (자동완성 검색)

자동완성 기능이 있는 검색 필드입니다.

```yaml
product:
  type: search
  label: 상품 검색
  placeholder: 상품명을 입력하세요

  search:
    url: /api/products/search
    method: GET
    query_param: q
    min_length: 2
    delay: 300

  result:
    value_field: id
    label_field: name
    template: "{{name}} ({{sku}})"

  rules:
    required: true
```

| 속성 | 설명 |
|------|------|
| `search.url` | 검색 API URL |
| `search.method` | HTTP 메서드 |
| `search.query_param` | 검색어 파라미터명 |
| `search.min_length` | 검색 시작 최소 글자 수 |
| `search.delay` | 입력 후 검색 대기 시간 (ms) |
| `result.value_field` | 선택 시 저장될 값 필드 |
| `result.label_field` | 표시될 텍스트 필드 |
| `result.template` | 결과 항목 템플릿 |

### 18. tagify (태그 입력)

태그 형태의 다중 값 입력 필드입니다.

```yaml
tags:
  type: tagify
  label: 태그
  placeholder: 태그를 입력하세요
  max_tags: 10

  whitelist:
    - 인기
    - 추천
    - 신상품
    - 할인

  settings:
    duplicates: false
    enforce_whitelist: false
    dropdown:
      enabled: 1
      max_items: 5

  rules:
    mincount: 1
    maxcount: 10
```

| 속성 | 설명 |
|------|------|
| `max_tags` | 최대 태그 수 |
| `whitelist` | 허용된 태그 목록 |
| `blacklist` | 금지된 태그 목록 |
| `settings.duplicates` | 중복 허용 여부 |
| `settings.enforce_whitelist` | 화이트리스트 강제 여부 |

### 19. dummy (더미/구분선)

실제 입력 필드가 아닌 UI 요소입니다. 구분선, 안내 문구 등에 사용됩니다.

```yaml
section_divider:
  type: dummy
  label: 추가 정보
  description: 아래 항목은 선택사항입니다.
  template: "<hr class='section-divider'><h4>{{label}}</h4><p class='text-muted'>{{description}}</p>"
```

| 속성 | 설명 |
|------|------|
| `template` | 렌더링할 HTML 템플릿 |
| `html` | 직접 삽입할 HTML |

### 20. tinymce (리치 텍스트 에디터)

WYSIWYG 리치 텍스트 에디터 필드입니다.

```yaml
content:
  type: tinymce
  label: 본문 내용

  config:
    height: 400
    menubar: false
    plugins:
      - advlist
      - autolink
      - lists
      - link
      - image
      - charmap
      - preview
      - anchor
      - searchreplace
      - visualblocks
      - code
      - fullscreen
      - insertdatetime
      - media
      - table
      - code
      - help
      - wordcount
    toolbar: >
      undo redo | formatselect | bold italic backcolor |
      alignleft aligncenter alignright alignjustify |
      bullist numlist outdent indent | removeformat | help

  rules:
    required: true
    maxlength: 50000
```

---

## 필드 속성

### 기본 속성

모든 필드 타입에서 사용 가능한 공통 속성입니다.

```yaml
field_name:
  type: text              # 필드 타입 (필수)
  label: 필드 레이블        # 표시 레이블
  description: 설명 텍스트  # 필드 하단에 표시되는 설명
  placeholder: 안내 텍스트  # 플레이스홀더
  default: ""             # 기본값

  # HTML 속성
  id: custom_id           # HTML id 속성
  class: custom-class     # CSS 클래스
  style: "width: 200px"   # 인라인 스타일

  # 상태 속성
  readonly: false         # 읽기 전용
  disabled: false         # 비활성화
  autofocus: false        # 자동 포커스

  # 레이아웃 속성
  wrapper_class: col-md-6 # 래퍼 요소 클래스
  label_class: font-bold  # 레이블 클래스
  input_class: form-control  # 입력 요소 클래스

  # 검증
  rules: {}               # 검증 규칙
  messages: {}            # 커스텀 에러 메시지
```

### prepend / append (접두/접미 텍스트)

입력 필드 앞뒤에 텍스트나 아이콘을 추가합니다.

```yaml
price:
  type: number
  label: 가격
  prepend: "₩"
  append: "원"

search_query:
  type: text
  label: 검색
  prepend: '<i class="fa fa-search"></i>'
  append: '<button type="button" class="btn btn-search">검색</button>'
```

### help (도움말)

필드에 대한 추가 도움말을 제공합니다.

```yaml
password:
  type: password
  label: 비밀번호
  help:
    text: 8자 이상, 대소문자 및 숫자 포함
    position: bottom  # top, bottom, tooltip
    class: text-muted small
```

---

## 검증 규칙

### rules 속성

필드의 검증 규칙을 정의합니다.

```yaml
field_name:
  type: text
  rules:
    required: true
    minlength: 2
    maxlength: 100
    match: "^[a-zA-Z0-9]+$"
```

### 지원되는 규칙 목록

#### 기본 규칙

| 규칙 | 파라미터 | 설명 |
|------|----------|------|
| `required` | boolean/string | 필수 입력 |
| `email` | boolean | 이메일 형식 |
| `url` | boolean | URL 형식 |

#### 문자열 규칙

| 규칙 | 파라미터 | 설명 |
|------|----------|------|
| `minlength` | number | 최소 문자 길이 |
| `maxlength` | number | 최대 문자 길이 |
| `rangelength` | [min, max] | 문자 길이 범위 |
| `match` | string (정규식) | 정규식 패턴 매칭 |

#### 숫자 규칙

| 규칙 | 파라미터 | 설명 |
|------|----------|------|
| `number` | boolean | 숫자 형식 (정수/소수) |
| `digits` | boolean | 양의 정수만 |
| `min` | number | 최소값 |
| `max` | number | 최대값 |
| `range` | [min, max] | 숫자 범위 |
| `step` | number | 단계값 (배수) |

#### 비교 규칙

| 규칙 | 파라미터 | 설명 |
|------|----------|------|
| `equalTo` | string (필드명) | 다른 필드와 값 일치 |
| `notEqual` | mixed | 지정 값과 불일치 |
| `in` | array | 허용 값 목록에 포함 |

#### 날짜 규칙

| 규칙 | 파라미터 | 설명 |
|------|----------|------|
| `date` | boolean | 유효한 날짜 |
| `dateISO` | boolean | ISO 형식 날짜 (YYYY-MM-DD) |
| `enddate` | string (필드명) | 시작일 이후 날짜 |

#### 배열 규칙

| 규칙 | 파라미터 | 설명 |
|------|----------|------|
| `mincount` | number | 최소 항목 수 |
| `maxcount` | number | 최대 항목 수 |
| `minformcount` | number | 최소 폼 요소 수 |
| `maxformcount` | number | 최대 폼 요소 수 |
| `unique` | boolean/string | 고유값 검증 |

#### 파일 규칙

| 규칙 | 파라미터 | 설명 |
|------|----------|------|
| `accept` | string/array | 허용 MIME 타입 |

### 조건부 규칙

다른 필드의 값에 따라 규칙을 적용합니다.

```yaml
company_name:
  type: text
  label: 회사명
  rules:
    # has_company 필드가 '1'일 때만 필수
    required: ".has_company == '1'"

business_license:
  type: file
  label: 사업자등록증
  rules:
    # 복합 조건: 기업이면서 직원 5명 이상일 때 필수
    required: ".user_type == 'business' && .employee_count >= 5"
```

#### 조건식 문법

| 문법 | 설명 | 예시 |
|------|------|------|
| `.field` | 현재 그룹의 필드 참조 | `.payment_type == 'card'` |
| `..field` | 부모 그룹의 필드 참조 | `..category_id == 1` |
| `...field` | 조상 그룹의 필드 참조 | `...root_field == 'value'` |
| `*.wildcard` | 배열 와일드카드 | `items.*.is_close == 1` |

#### 연산자

| 연산자 | 설명 |
|--------|------|
| `==` | 같음 |
| `!=` | 다름 |
| `>` | 초과 |
| `>=` | 이상 |
| `<` | 미만 |
| `<=` | 이하 |
| `&&` | AND |
| `\|\|` | OR |
| `in` | 값 목록 포함 |
| `not in` | 값 목록 미포함 |

**in 연산자 예시:**

```yaml
display_date:
  type: datetime
  rules:
    # is_display가 2 또는 3일 때 필수
    required: ".is_display in 2,3"

category_detail:
  type: text
  rules:
    # category가 electronics, clothing 중 하나일 때 필수
    required: ".category in electronics,clothing"
```

---

## 메시지 정의

### 기본 메시지 정의

```yaml
field_name:
  type: text
  rules:
    required: true
    minlength: 3
    maxlength: 50
  messages:
    required: 이 필드는 필수입니다.
    minlength: 최소 3자 이상 입력해주세요.
    maxlength: 최대 50자까지 입력 가능합니다.
```

### 다국어 메시지

```yaml
field_name:
  type: email
  rules:
    required: true
    email: true
  messages:
    ko:
      required: 이메일을 입력해주세요.
      email: 올바른 이메일 형식이 아닙니다.
    en:
      required: Please enter your email.
      email: Please enter a valid email address.
    ja:
      required: メールアドレスを入力してください。
      email: 正しいメールアドレス形式で入力してください。
```

### 파라미터 치환

메시지 내에서 규칙 파라미터를 참조할 수 있습니다.

```yaml
field_name:
  type: text
  rules:
    minlength: 5
    maxlength: 100
  messages:
    minlength: "최소 {0}자 이상 입력해주세요."  # {0} = 5
    maxlength: "최대 {0}자까지 입력 가능합니다."  # {0} = 100
    rangelength: "{0}자 이상 {1}자 이하로 입력해주세요."  # {0} = min, {1} = max
```

---

## 조건부 표시

### display_target

다른 필드의 값에 따라 필드의 표시 여부를 제어합니다.

```yaml
has_options:
  type: checkbox
  label: 옵션 사용

options_group:
  type: group
  label: 옵션 설정
  display_target: has_options  # has_options가 체크되면 표시
  properties:
    option_name:
      type: text
      label: 옵션명
```

### display_target_condition_style

조건 충족 시 적용할 스타일을 지정합니다.

```yaml
special_field:
  type: text
  display_target: show_special
  display_target_condition_style: "display: block"  # 조건 충족 시
```

### display_target_condition_class

조건 충족 시 적용할 CSS 클래스를 지정합니다.

```yaml
premium_options:
  type: group
  display_target: membership
  display_target_condition_class: premium-visible  # 조건 충족 시 추가되는 클래스
```

### display_switch

표현식을 사용한 고급 조건부 표시입니다.

```yaml
card_number:
  type: text
  label: 카드 번호
  display_switch: ".payment_type == 'card'"
  rules:
    required:
      when: ".payment_type == 'card'"

bank_account:
  type: text
  label: 계좌 번호
  display_switch: ".payment_type == 'bank'"
  rules:
    required:
      when: ".payment_type == 'bank'"
```

**복합 조건:**

```yaml
advanced_settings:
  type: group
  label: 고급 설정
  display_switch: ".user_type == 'admin' || .user_type == 'manager'"

discount_field:
  type: number
  label: 특별 할인율
  display_switch: ".membership in premium,vip && .purchase_count >= 10"
```

---

## 이벤트 및 스크립트

### onchange

필드 값 변경 시 실행할 JavaScript 코드입니다.

```yaml
category:
  type: select
  label: 카테고리
  items:
    1: 전자제품
    2: 의류
    3: 식품
  onchange: "loadSubcategories(this.value)"
```

### onclick

클릭 시 실행할 JavaScript 코드입니다.

```yaml
search_button:
  type: dummy
  template: '<button type="button" class="btn btn-search">검색</button>'
  onclick: "performSearch()"
```

### init_script

필드 초기화 시 실행할 JavaScript 코드입니다.

```yaml
date_range:
  type: text
  label: 기간 선택
  init_script: |
    $(document).ready(function() {
      $('#{{id}}').daterangepicker({
        locale: { format: 'YYYY-MM-DD' }
      });
    });
```

### event

여러 이벤트를 정의합니다.

```yaml
price:
  type: number
  label: 가격
  event:
    change: "calculateTotal()"
    blur: "formatPrice(this)"
    focus: "selectAll(this)"
    keyup: "validateNumber(this)"
```

---

## 특수 키워드

### $ref (외부 파일 참조)

다른 YAML 파일의 내용을 포함합니다. 재사용 가능한 필드 정의를 별도 파일로 분리할 때 사용합니다.

```yaml
# common/address.yml
type: group
properties:
  postal_code:
    type: text
    label: 우편번호
    rules:
      required: true
      match: "^\\d{5}$"
  address1:
    type: text
    label: 기본 주소
    rules:
      required: true
  address2:
    type: text
    label: 상세 주소
```

```yaml
# order-form.yml
type: group
name: order_form
properties:
  shipping_address:
    $ref: common/address.yml
    label: 배송지 주소

  billing_address:
    $ref: common/address.yml
    label: 청구지 주소
```

**$ref 사용 시 속성 오버라이드:**

참조된 파일의 속성을 오버라이드할 수 있습니다.

```yaml
company_address:
  $ref: common/address.yml
  label: 회사 주소
  properties:
    postal_code:
      rules:
        required: false  # 기존 required: true를 오버라이드
```

### 배열 표기법 (field[])

반복 가능한 필드를 정의할 때 배열 표기법을 사용합니다.

```yaml
# 방법 1: multiple 속성 사용
images:
  type: image
  multiple: true
  sortable: true

# 방법 2: 명시적 배열 표기
images[]:
  type: image
  sortable: true
```

**중첩 배열:**

```yaml
products[]:
  type: group
  label: 상품
  properties:
    name:
      type: text
    variants[]:
      type: group
      label: 옵션
      properties:
        sku:
          type: text
        price:
          type: number
```

### 중첩 그룹 (Nested Properties)

그룹 내에 그룹을 중첩하여 복잡한 구조를 정의합니다.

```yaml
type: group
name: product_form
properties:
  basic_info:
    type: group
    label: 기본 정보
    properties:
      name:
        type: text
        label: 상품명
      description:
        type: textarea
        label: 설명

  pricing:
    type: group
    label: 가격 정보
    properties:
      regular_price:
        type: number
        label: 정가
      sale_price:
        type: number
        label: 판매가
      discount:
        type: group
        label: 할인 설정
        properties:
          rate:
            type: number
            label: 할인율
          start_date:
            type: date
            label: 시작일
          end_date:
            type: date
            label: 종료일
```

---

## 고급 기능

### element.all_of (복합 조건)

여러 조건을 모두 만족해야 할 때 사용합니다.

```yaml
special_discount:
  type: number
  label: 특별 할인율
  element:
    all_of:
      - condition: ".user_type == 'vip'"
        effect: "enable"
      - condition: ".order_total >= 100000"
        effect: "enable"
      - condition: ".coupon_applied == '0'"
        effect: "enable"
```

### element.any_of (선택적 조건)

여러 조건 중 하나라도 만족하면 적용됩니다.

```yaml
premium_field:
  type: text
  element:
    any_of:
      - condition: ".membership == 'premium'"
      - condition: ".membership == 'vip'"
      - condition: ".is_partner == '1'"
```

### 동적 기본값

다른 필드의 값을 기반으로 기본값을 설정합니다.

```yaml
display_name:
  type: text
  label: 표시 이름
  default: "{{first_name}} {{last_name}}"

slug:
  type: text
  label: URL 슬러그
  default: "{{name | slugify}}"
```

### 계산된 필드

다른 필드들의 값을 계산하여 표시합니다.

```yaml
total_price:
  type: number
  label: 총 금액
  readonly: true
  computed: ".quantity * .unit_price"

discount_amount:
  type: number
  label: 할인 금액
  readonly: true
  computed: ".total_price * (.discount_rate / 100)"

final_price:
  type: number
  label: 최종 금액
  readonly: true
  computed: ".total_price - .discount_amount"
```

### 필드 의존성

다른 필드의 값에 따라 옵션이 변경됩니다.

```yaml
country:
  type: select
  label: 국가
  items:
    kr: 한국
    us: 미국
    jp: 일본

city:
  type: select
  label: 도시
  depends_on: country
  items:
    kr:
      seoul: 서울
      busan: 부산
      incheon: 인천
    us:
      nyc: 뉴욕
      la: 로스앤젤레스
      chicago: 시카고
    jp:
      tokyo: 도쿄
      osaka: 오사카
      kyoto: 교토
```

### 원격 검증

서버에서 실시간 검증을 수행합니다.

```yaml
username:
  type: text
  label: 사용자명
  rules:
    required: true
    minlength: 3
    remote:
      url: /api/check-username
      method: POST
      data:
        username: "{{value}}"
      message: 이미 사용 중인 사용자명입니다.
```

---

## 전체 예시

### 회원가입 폼

```yaml
type: group
name: user_registration
label: 회원가입
title: 회원가입 - 서비스명

action:
  method: POST
  url: /api/users/register
  buttons:
    submit:
      label: 가입하기
      class: btn btn-primary btn-lg w-100

properties:
  # 계정 정보
  account_info:
    type: group
    label: 계정 정보
    class: mb-4
    properties:
      email:
        type: email
        label: 이메일
        placeholder: example@email.com
        rules:
          required: true
          email: true
        messages:
          required: 이메일을 입력해주세요.
          email: 올바른 이메일 형식이 아닙니다.

      password:
        type: password
        label: 비밀번호
        rules:
          required: true
          minlength: 8
          match: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$"
        messages:
          required: 비밀번호를 입력해주세요.
          minlength: 비밀번호는 8자 이상이어야 합니다.
          match: 대문자, 소문자, 숫자를 각각 1개 이상 포함해야 합니다.

      password_confirm:
        type: password
        label: 비밀번호 확인
        rules:
          required: true
          equalTo: password
        messages:
          required: 비밀번호 확인을 입력해주세요.
          equalTo: 비밀번호가 일치하지 않습니다.

  # 개인 정보
  personal_info:
    type: group
    label: 개인 정보
    class: mb-4
    properties:
      name:
        type: text
        label: 이름
        rules:
          required: true
          rangelength: [2, 50]
        messages:
          required: 이름을 입력해주세요.
          rangelength: 이름은 2자 이상 50자 이하로 입력해주세요.

      phone:
        type: text
        label: 휴대폰 번호
        placeholder: 010-1234-5678
        rules:
          required: true
          match: "^01[016789]-?\\d{3,4}-?\\d{4}$"
        messages:
          required: 휴대폰 번호를 입력해주세요.
          match: 올바른 휴대폰 번호 형식이 아닙니다.

      birth_date:
        type: date
        label: 생년월일
        rules:
          dateISO: true

  # 추가 정보
  additional_info:
    type: group
    label: 추가 정보 (선택)
    collapsible: true
    collapsed: true
    properties:
      interests:
        type: multichoice
        label: 관심사
        items:
          tech: 기술/IT
          finance: 금융/투자
          lifestyle: 라이프스타일
          entertainment: 엔터테인먼트
        rules:
          maxcount: 3
        messages:
          maxcount: 최대 3개까지 선택 가능합니다.

      referral_code:
        type: text
        label: 추천인 코드
        placeholder: 추천인 코드가 있으면 입력하세요

  # 약관 동의
  agreements:
    type: group
    label: 약관 동의
    class: mb-4
    properties:
      terms_agree:
        type: checkbox
        label: "[필수] 이용약관에 동의합니다"
        rules:
          required: true
        messages:
          required: 이용약관에 동의해주세요.

      privacy_agree:
        type: checkbox
        label: "[필수] 개인정보 처리방침에 동의합니다"
        rules:
          required: true
        messages:
          required: 개인정보 처리방침에 동의해주세요.

      marketing_agree:
        type: checkbox
        label: "[선택] 마케팅 정보 수신에 동의합니다"
```

### 상품 등록 폼

```yaml
type: group
name: product_create
label: 상품 등록
title: 상품 등록

action:
  method: POST
  url: /api/products
  enctype: multipart/form-data
  buttons:
    submit:
      label: 등록하기
      class: btn btn-primary
    draft:
      label: 임시저장
      class: btn btn-outline-secondary
      onclick: "saveDraft()"
    cancel:
      label: 취소
      class: btn btn-link
      href: /admin/products

properties:
  # 기본 정보
  basic:
    type: group
    label: 기본 정보
    properties:
      name:
        type: text
        label: 상품명
        rules:
          required: true
          rangelength: [2, 200]
        messages:
          required: 상품명을 입력해주세요.

      category_id:
        type: select
        label: 카테고리
        items:
          model: Category
          method: getSelectOptions
        rules:
          required: true
        onchange: "loadSubcategories(this.value)"

      subcategory_id:
        type: select
        label: 하위 카테고리
        items: {}
        depends_on: category_id

      description:
        type: tinymce
        label: 상품 설명
        config:
          height: 300
        rules:
          required: true
          maxlength: 50000

  # 이미지
  images:
    type: group
    label: 상품 이미지
    properties:
      main_image:
        type: image
        label: 대표 이미지
        accept: "image/jpeg,image/png,image/webp"
        max_size: 5242880
        dimensions:
          min_width: 500
          min_height: 500
        rules:
          required: true
          accept: "image/*"
        messages:
          required: 대표 이미지를 업로드해주세요.

      gallery:
        type: image
        label: 추가 이미지
        multiple: true
        sortable: true
        max: 10
        rules:
          maxcount: 10

  # 가격 정보
  pricing:
    type: group
    label: 가격 정보
    properties:
      regular_price:
        type: number
        label: 정가
        prepend: "₩"
        rules:
          required: true
          number: true
          min: 0
        messages:
          required: 정가를 입력해주세요.

      sale_price:
        type: number
        label: 판매가
        prepend: "₩"
        rules:
          required: true
          number: true
          min: 0
        onchange: "calculateDiscount()"

      discount_rate:
        type: number
        label: 할인율
        append: "%"
        readonly: true
        computed: "Math.round((1 - .sale_price / .regular_price) * 100)"

  # 옵션
  has_options:
    type: checkbox
    label: 옵션 사용

  options:
    type: group
    label: 상품 옵션
    display_target: has_options
    multiple: true
    sortable: true
    min: 1
    max: 50
    add_button_label: "+ 옵션 추가"
    rules:
      minformcount: 1
      maxformcount: 50
    properties:
      option_name:
        type: text
        label: 옵션명
        placeholder: "예: 색상, 사이즈"
        rules:
          required: true

      option_values:
        type: tagify
        label: 옵션값
        placeholder: "옵션값을 입력하고 Enter"
        rules:
          required: true
          mincount: 1

      additional_price:
        type: number
        label: 추가 금액
        prepend: "₩"
        default: 0

  # 재고 및 배송
  inventory:
    type: group
    label: 재고 및 배송
    properties:
      stock_quantity:
        type: number
        label: 재고 수량
        default: 0
        rules:
          required: true
          digits: true
          min: 0

      sku:
        type: text
        label: SKU (재고관리코드)
        rules:
          match: "^[A-Z0-9-]+$"
        messages:
          match: "SKU는 영문 대문자, 숫자, 하이픈만 사용 가능합니다."

      shipping_type:
        type: choice
        label: 배송 유형
        items:
          free: 무료 배송
          standard: 기본 배송
          express: 빠른 배송
        default: standard

      shipping_fee:
        type: number
        label: 배송비
        prepend: "₩"
        display_switch: ".shipping_type != 'free'"
        rules:
          required:
            when: ".shipping_type != 'free'"

  # 판매 설정
  sales_settings:
    type: group
    label: 판매 설정
    properties:
      status:
        type: select
        label: 상태
        items:
          draft: 임시저장
          pending: 승인대기
          active: 판매중
          inactive: 판매중지
        default: draft

      is_featured:
        type: checkbox
        label: 추천 상품

      sale_start_date:
        type: datetime
        label: 판매 시작일
        rules:
          datetime: true

      sale_end_date:
        type: datetime
        label: 판매 종료일
        rules:
          datetime: true
          enddate: sale_start_date
        messages:
          enddate: 종료일은 시작일 이후여야 합니다.
```

---

## 참고 자료

- [검증 규칙 상세 가이드](./VALIDATION-RULES.md)
- [프로젝트 개요](./README.md)

---

*이 문서는 Limepie PHP 폼 시스템의 YAML 스펙 형식에 대한 공식 명세서입니다.*
*버전: 1.0.0*
*최종 수정: 2026-01-04*
