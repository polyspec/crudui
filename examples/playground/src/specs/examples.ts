export interface ExampleSpec {
  id: string;
  name: {
    ko: string;
    en: string;
  };
  spec: string;
}

export const exampleSpecs: ExampleSpec[] = [
  {
    id: 'contact',
    name: {
      ko: '문의 폼',
      en: 'Contact Form',
    },
    spec: `# Simple Contact Form
type: group
name: contact_form
label:
  ko: 문의하기
  en: Contact Us
description:
  ko: 문의 사항을 남겨주시면 빠르게 답변드리겠습니다.
  en: Leave your inquiry and we will respond quickly.
buttons:
  - type: submit
    name: __submitted__
    value: send
    class: btn btn-primary
    text:
      ko: 문의 보내기
      en: Send Inquiry

properties:
  name:
    type: text
    label:
      ko: 이름
      en: Your Name
    placeholder:
      ko: 이름을 입력하세요
      en: Enter your name
    rules:
      required: true
      minlength: 2
      maxlength: 50
    messages:
      ko:
        required: 이름을 입력해주세요.
        minlength: 이름은 최소 {0}자 이상이어야 합니다.
      en:
        required: Please enter your name.
        minlength: Name must be at least {0} characters.

  email:
    type: email
    label:
      ko: 이메일
      en: Email Address
    placeholder:
      ko: example@domain.com
      en: example@domain.com
    rules:
      required: true
      email: true
    messages:
      ko:
        required: 이메일을 입력해주세요.
        email: 올바른 이메일 형식으로 입력해주세요.
      en:
        required: Please enter your email.
        email: Please enter a valid email address.

  category:
    type: select
    label:
      ko: 문의 유형
      en: Inquiry Type
    rules:
      required: true
    items:
      "":
        ko: 선택하세요
        en: Please select
      general:
        ko: 일반 문의
        en: General Inquiry
      support:
        ko: 기술 지원
        en: Technical Support
      sales:
        ko: 영업 문의
        en: Sales Inquiry
    messages:
      ko:
        required: 문의 유형을 선택해주세요.
      en:
        required: Please select an inquiry type.

  message:
    type: textarea
    label:
      ko: 문의 내용
      en: Message
    placeholder:
      ko: 문의하실 내용을 자세히 적어주세요.
      en: Please describe your inquiry in detail.
    rows: 5
    rules:
      required: true
      minlength: 10
    messages:
      ko:
        required: 문의 내용을 입력해주세요.
        minlength: 문의 내용은 최소 {0}자 이상이어야 합니다.
      en:
        required: Please enter your message.
        minlength: Message must be at least {0} characters.

  privacy_agree:
    type: switcher
    label:
      ko: 개인정보 수집 동의
      en: I agree to the Privacy Policy
    rules:
      required: true
    messages:
      ko:
        required: 개인정보 수집에 동의해주세요.
      en:
        required: You must agree to the Privacy Policy.
`,
  },
  {
    id: 'registration',
    name: {
      ko: '회원가입',
      en: 'Registration',
    },
    spec: `# User Registration Form
type: group
name: registration_form
label:
  ko: 회원가입
  en: User Registration
description:
  ko: 새 계정을 만들어주세요.
  en: Create your new account.
buttons:
  - type: submit
    name: __submitted__
    value: register
    class: btn btn-primary
    text:
      ko: 가입하기
      en: Sign Up

properties:
  name:
    type: text
    label:
      ko: 이름
      en: Full Name
    placeholder:
      ko: 홍길동
      en: John Doe
    rules:
      required: true
      minlength: 2
    messages:
      ko:
        required: 이름을 입력해주세요.
      en:
        required: Please enter your name.

  email:
    type: email
    label:
      ko: 이메일
      en: Email
    rules:
      required: true
      email: true
    messages:
      ko:
        required: 이메일을 입력해주세요.
        email: 올바른 이메일 형식으로 입력해주세요.
      en:
        required: Please enter your email.
        email: Please enter a valid email address.

  password:
    type: password
    label:
      ko: 비밀번호
      en: Password
    description:
      ko: 8자 이상, 영문자와 숫자 포함
      en: At least 8 characters with letters and numbers
    rules:
      required: true
      minlength: 8
    messages:
      ko:
        required: 비밀번호를 입력해주세요.
        minlength: 비밀번호는 최소 {0}자 이상이어야 합니다.
      en:
        required: Please enter a password.
        minlength: Password must be at least {0} characters.

  account_type:
    type: choice
    label:
      ko: 계정 유형
      en: Account Type
    default: personal
    items:
      personal:
        ko: 개인
        en: Personal
      business:
        ko: 비즈니스
        en: Business

  company_name:
    type: text
    label:
      ko: 회사명
      en: Company Name
    display_switch: .account_type == business
    rules:
      required: account_type == business
    messages:
      ko:
        required: 회사명을 입력해주세요.
      en:
        required: Please enter your company name.

  terms:
    type: switcher
    label:
      ko: 이용약관에 동의합니다
      en: I agree to the Terms of Service
    rules:
      required: true
    messages:
      ko:
        required: 이용약관에 동의해주세요.
      en:
        required: You must agree to the Terms of Service.
`,
  },
  {
    id: 'product',
    name: {
      ko: '상품 등록',
      en: 'Product Form',
    },
    spec: `# Product Registration Form
type: group
name: product_form
label:
  ko: 상품 등록
  en: Product Registration
description:
  ko: 새 상품을 등록합니다.
  en: Register a new product.
buttons:
  - type: submit
    name: __submitted__
    value: save
    class: btn btn-primary
    text:
      ko: 저장
      en: Save

properties:
  status:
    type: choice
    label:
      ko: 상태
      en: Status
    default: "1"
    items:
      "0":
        ko: 비활성
        en: Inactive
      "1":
        ko: 활성
        en: Active

  name:
    type: text
    label:
      ko: 상품명
      en: Product Name
    placeholder:
      ko: 상품명을 입력하세요
      en: Enter product name
    rules:
      required: true
      minlength: 2
      maxlength: 100
    messages:
      ko:
        required: 상품명을 입력해주세요.
      en:
        required: Please enter a product name.

  description:
    type: textarea
    label:
      ko: 상품 설명
      en: Description
    rows: 4
    rules:
      maxlength: 500

  price_type:
    type: choice
    label:
      ko: 가격 유형
      en: Price Type
    default: "0"
    items:
      "0":
        ko: 무료
        en: Free
      "1":
        ko: 유료
        en: Paid

  price:
    type: number
    label:
      ko: 판매가
      en: Sale Price
    display_switch: .price_type == 1
    default: 0
    rules:
      required: price_type == 1
      min: 0
    messages:
      ko:
        required: 판매가를 입력해주세요.
        min: 0 이상의 금액을 입력해주세요.
      en:
        required: Please enter a sale price.
        min: Please enter an amount of 0 or more.

  category:
    type: select
    label:
      ko: 카테고리
      en: Category
    rules:
      required: true
    items:
      "":
        ko: 선택하세요
        en: Please select
      electronics:
        ko: 전자기기
        en: Electronics
      fashion:
        ko: 패션
        en: Fashion
      home:
        ko: 홈/리빙
        en: Home & Living
      sports:
        ko: 스포츠
        en: Sports
    messages:
      ko:
        required: 카테고리를 선택해주세요.
      en:
        required: Please select a category.
`,
  },
  {
    id: 'simple',
    name: {
      ko: '기본 예제',
      en: 'Simple Example',
    },
    spec: `# Basic Form Example
type: group
name: simple_form
label:
  ko: 기본 폼
  en: Simple Form
buttons:
  - type: submit
    class: btn btn-primary
    text:
      ko: 제출
      en: Submit

properties:
  text_field:
    type: text
    label:
      ko: 텍스트 필드
      en: Text Field
    placeholder:
      ko: 텍스트를 입력하세요
      en: Enter text
    rules:
      required: true

  email_field:
    type: email
    label:
      ko: 이메일 필드
      en: Email Field
    rules:
      email: true

  number_field:
    type: number
    label:
      ko: 숫자 필드
      en: Number Field
    default: 0
    rules:
      min: 0
      max: 100

  select_field:
    type: select
    label:
      ko: 선택 필드
      en: Select Field
    items:
      "":
        ko: 선택하세요
        en: Select...
      option1:
        ko: 옵션 1
        en: Option 1
      option2:
        ko: 옵션 2
        en: Option 2
      option3:
        ko: 옵션 3
        en: Option 3

  choice_field:
    type: choice
    label:
      ko: 라디오 필드
      en: Radio Field
    items:
      a:
        ko: A 선택
        en: Choice A
      b:
        ko: B 선택
        en: Choice B

  checkbox_field:
    type: switcher
    label:
      ko: 체크박스 필드
      en: Checkbox Field

  textarea_field:
    type: textarea
    label:
      ko: 텍스트영역
      en: Textarea
    rows: 3
`,
  },
];

export const defaultSpec = exampleSpecs[0].spec;
