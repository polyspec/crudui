/**
 * React Usage Example
 *
 * This example demonstrates how to use the form-generator React components
 * with various configurations and features.
 */

import React, { useState, useCallback } from 'react';
import { FormBuilder } from '@limepie/form-react';
import type { FormData, FormErrors, Language, FieldComponentProps } from '@limepie/form-react';

// =============================================================================
// Basic Usage
// =============================================================================

/**
 * Basic form with YAML spec string
 */
export function BasicFormExample() {
  const specYaml = `
type: group
properties:
  name:
    type: text
    label:
      ko: 이름
      en: Name
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
`;

  const handleSubmit = (data: FormData, errors: FormErrors) => {
    if (Object.keys(errors).length === 0) {
      console.log('Form submitted:', data);
      // Submit to API
    } else {
      console.log('Validation errors:', errors);
    }
  };

  return (
    <FormBuilder
      spec={specYaml}
      language="ko"
      onSubmit={handleSubmit}
    />
  );
}

// =============================================================================
// With Initial Data
// =============================================================================

/**
 * Form with pre-populated data
 */
export function FormWithInitialData() {
  const spec = {
    type: 'group' as const,
    properties: {
      name: {
        type: 'text',
        label: { ko: '이름', en: 'Name' },
        rules: { required: true },
      },
      email: {
        type: 'email',
        label: { ko: '이메일', en: 'Email' },
        rules: { required: true, email: true },
      },
      newsletter: {
        type: 'choice',
        label: { ko: '뉴스레터', en: 'Newsletter' },
        items: {
          '1': { ko: '수신', en: 'Subscribe' },
          '0': { ko: '수신안함', en: 'Unsubscribe' },
        },
      },
    },
  };

  const initialData = {
    name: 'John Doe',
    email: 'john@example.com',
    newsletter: '1',
  };

  return (
    <FormBuilder
      spec={spec}
      data={initialData}
      language="en"
      onSubmit={(data, errors) => console.log('Submitted:', data)}
    />
  );
}

// =============================================================================
// Conditional Fields Example
// =============================================================================

/**
 * Form with conditional required fields and display_switch
 */
export function ConditionalFieldsExample() {
  const spec = {
    type: 'group' as const,
    properties: {
      delivery_type: {
        type: 'choice',
        label: { ko: '배송 방법', en: 'Delivery Method' },
        default: '1',
        items: {
          '1': { ko: '일반 배송', en: 'Standard Delivery' },
          '2': { ko: '퀵 배송', en: 'Express Delivery' },
          '3': { ko: '직접 수령', en: 'Pickup' },
        },
      },
      // Address fields - only shown when NOT pickup (delivery_type != 3)
      address: {
        type: 'group',
        label: { ko: '배송 주소', en: 'Delivery Address' },
        display_switch: '.delivery_type != 3',
        properties: {
          street: {
            type: 'text',
            label: { ko: '주소', en: 'Street Address' },
            rules: {
              // Conditionally required when NOT pickup
              required: '..delivery_type != 3',
            },
            messages: {
              ko: { required: '주소를 입력해주세요.' },
              en: { required: 'Please enter your address.' },
            },
          },
          city: {
            type: 'text',
            label: { ko: '도시', en: 'City' },
            rules: {
              required: '..delivery_type != 3',
            },
          },
          postal_code: {
            type: 'text',
            label: { ko: '우편번호', en: 'Postal Code' },
            rules: {
              required: '..delivery_type != 3',
              match: '^[0-9]{5}$',
            },
            messages: {
              ko: {
                required: '우편번호를 입력해주세요.',
                match: '5자리 숫자로 입력해주세요.',
              },
              en: {
                required: 'Please enter postal code.',
                match: 'Please enter a 5-digit postal code.',
              },
            },
          },
        },
      },
      // Pickup location - only shown when pickup (delivery_type == 3)
      pickup_location: {
        type: 'select',
        label: { ko: '수령 장소', en: 'Pickup Location' },
        display_switch: '.delivery_type == 3',
        items: {
          '': { ko: '선택하세요', en: 'Select location' },
          'store1': { ko: '강남점', en: 'Gangnam Store' },
          'store2': { ko: '홍대점', en: 'Hongdae Store' },
          'store3': { ko: '잠실점', en: 'Jamsil Store' },
        },
        rules: {
          required: '.delivery_type == 3',
        },
        messages: {
          ko: { required: '수령 장소를 선택해주세요.' },
          en: { required: 'Please select a pickup location.' },
        },
      },
    },
  };

  return (
    <FormBuilder
      spec={spec}
      language="ko"
      onSubmit={(data) => console.log('Order data:', data)}
    />
  );
}

// =============================================================================
// Multiple/Sortable Arrays Example
// =============================================================================

/**
 * Form with multiple and sortable array fields
 */
export function ArrayFieldsExample() {
  const spec = {
    type: 'group' as const,
    properties: {
      // Multiple text fields with sorting
      'tags[]': {
        type: 'text',
        label: { ko: '태그', en: 'Tags' },
        multiple: true,
        sortable: true,
        rules: {
          unique: true,
          maxlength: 20,
        },
        messages: {
          ko: {
            unique: '중복된 태그는 입력할 수 없습니다.',
            maxlength: '태그는 {0}자 이내로 입력해주세요.',
          },
          en: {
            unique: 'Duplicate tags are not allowed.',
            maxlength: 'Tags must be {0} characters or less.',
          },
        },
      },
      // Multiple select with sorting
      'categories[]': {
        type: 'select',
        label: { ko: '카테고리', en: 'Categories' },
        multiple: true,
        sortable: true,
        sortable_button: true,
        items: {
          '': { ko: '선택', en: 'Select' },
          'tech': { ko: '기술', en: 'Technology' },
          'design': { ko: '디자인', en: 'Design' },
          'marketing': { ko: '마케팅', en: 'Marketing' },
          'business': { ko: '비즈니스', en: 'Business' },
        },
        rules: {
          required: true,
          unique: true,
        },
      },
      // Multiple image upload with sorting
      'images[]': {
        type: 'image',
        label: { ko: '이미지', en: 'Images' },
        multiple: true,
        sortable: true,
        rules: {
          required: true,
          accept: 'image/*',
          maxcount: 5,
        },
        'preview-max-width': 150,
      },
    },
  };

  return (
    <FormBuilder
      spec={spec}
      language="ko"
      onSubmit={(data) => console.log('Form data:', data)}
    />
  );
}

// =============================================================================
// Nested Groups Example
// =============================================================================

/**
 * Form with nested groups and repeatable sections
 */
export function NestedGroupsExample() {
  const spec = {
    type: 'group' as const,
    properties: {
      company: {
        type: 'group',
        label: { ko: '회사 정보', en: 'Company Information' },
        properties: {
          name: {
            type: 'text',
            label: { ko: '회사명', en: 'Company Name' },
            rules: { required: true },
          },
          address: {
            type: 'group',
            label: { ko: '주소', en: 'Address' },
            properties: {
              street: {
                type: 'text',
                label: { ko: '도로명 주소', en: 'Street' },
              },
              city: {
                type: 'text',
                label: { ko: '도시', en: 'City' },
              },
              country: {
                type: 'select',
                label: { ko: '국가', en: 'Country' },
                items: {
                  '': { ko: '선택', en: 'Select' },
                  'KR': { ko: '한국', en: 'South Korea' },
                  'US': { ko: '미국', en: 'United States' },
                  'JP': { ko: '일본', en: 'Japan' },
                },
              },
            },
          },
        },
      },
      // Repeatable group
      'employees[]': {
        type: 'group',
        label: { ko: '직원 목록', en: 'Employee List' },
        multiple: true,
        sortable: true,
        properties: {
          name: {
            type: 'text',
            label: { ko: '이름', en: 'Name' },
            rules: { required: true },
          },
          email: {
            type: 'email',
            label: { ko: '이메일', en: 'Email' },
            rules: { required: true, email: true },
          },
          department: {
            type: 'select',
            label: { ko: '부서', en: 'Department' },
            items: {
              'engineering': { ko: '개발', en: 'Engineering' },
              'design': { ko: '디자인', en: 'Design' },
              'marketing': { ko: '마케팅', en: 'Marketing' },
              'sales': { ko: '영업', en: 'Sales' },
            },
          },
        },
      },
    },
  };

  const initialData = {
    company: {
      name: 'Example Corp',
      address: {
        city: 'Seoul',
        country: 'KR',
      },
    },
    employees: [
      { name: 'Kim Developer', email: 'kim@example.com', department: 'engineering' },
      { name: 'Lee Designer', email: 'lee@example.com', department: 'design' },
    ],
  };

  return (
    <FormBuilder
      spec={spec}
      data={initialData}
      language="ko"
      onSubmit={(data) => console.log('Company data:', data)}
    />
  );
}

// =============================================================================
// Custom Field Components
// =============================================================================

/**
 * Custom star rating field component
 */
const StarRatingField: React.FC<FieldComponentProps> = ({
  name,
  value,
  onChange,
  error,
  disabled,
  readonly,
  spec,
}) => {
  const rating = parseInt(value as string) || 0;
  const maxStars = spec.max || 5;

  const handleClick = (star: number) => {
    if (!disabled && !readonly) {
      onChange(star.toString());
    }
  };

  return (
    <div className="star-rating">
      {[...Array(maxStars)].map((_, index) => (
        <span
          key={index}
          className={`star ${index < rating ? 'filled' : ''}`}
          onClick={() => handleClick(index + 1)}
          style={{
            cursor: disabled || readonly ? 'default' : 'pointer',
            color: index < rating ? '#FFD700' : '#CCC',
            fontSize: '24px',
          }}
        >
          {'\u2605'}
        </span>
      ))}
      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

/**
 * Form with custom field components
 */
export function CustomFieldsExample() {
  const spec = {
    type: 'group' as const,
    properties: {
      title: {
        type: 'text',
        label: { ko: '리뷰 제목', en: 'Review Title' },
        rules: { required: true },
      },
      rating: {
        type: 'star-rating', // Custom type
        label: { ko: '평점', en: 'Rating' },
        max: 5,
        rules: { required: true, min: 1 },
        messages: {
          ko: { required: '평점을 선택해주세요.' },
          en: { required: 'Please select a rating.' },
        },
      },
      content: {
        type: 'textarea',
        label: { ko: '리뷰 내용', en: 'Review Content' },
        rows: 5,
        rules: { required: true, minlength: 10 },
      },
    },
  };

  return (
    <FormBuilder
      spec={spec}
      language="ko"
      customFields={{
        'star-rating': StarRatingField,
      }}
      onSubmit={(data) => console.log('Review:', data)}
    />
  );
}

// =============================================================================
// Multi-language Support
// =============================================================================

/**
 * Form with language switching
 */
export function MultiLanguageExample() {
  const [language, setLanguage] = useState<Language>('ko');

  const spec = {
    type: 'group' as const,
    label: {
      ko: '사용자 정보',
      en: 'User Information',
      ja: 'ユーザー情報',
    },
    properties: {
      name: {
        type: 'text',
        label: { ko: '이름', en: 'Name', ja: 'お名前' },
        placeholder: {
          ko: '이름을 입력하세요',
          en: 'Enter your name',
          ja: 'お名前を入力してください',
        },
        rules: { required: true },
        messages: {
          ko: { required: '이름을 입력해주세요.' },
          en: { required: 'Please enter your name.' },
          ja: { required: 'お名前を入力してください。' },
        },
      },
      email: {
        type: 'email',
        label: { ko: '이메일', en: 'Email', ja: 'メールアドレス' },
        rules: { required: true, email: true },
        messages: {
          ko: {
            required: '이메일을 입력해주세요.',
            email: '올바른 이메일 형식으로 입력해주세요.',
          },
          en: {
            required: 'Please enter your email.',
            email: 'Please enter a valid email address.',
          },
          ja: {
            required: 'メールアドレスを入力してください。',
            email: '有効なメールアドレスを入力してください。',
          },
        },
      },
    },
  };

  return (
    <div>
      <div className="language-selector">
        <button onClick={() => setLanguage('ko')}>한국어</button>
        <button onClick={() => setLanguage('en')}>English</button>
        <button onClick={() => setLanguage('ja')}>日本語</button>
      </div>
      <FormBuilder
        spec={spec}
        language={language}
        onSubmit={(data) => console.log('Data:', data)}
      />
    </div>
  );
}

// =============================================================================
// Form State Management
// =============================================================================

/**
 * Form with external state management
 */
export function FormStateManagementExample() {
  const [formData, setFormData] = useState<FormData>({});
  const [validationErrors, setValidationErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const spec = {
    type: 'group' as const,
    properties: {
      name: {
        type: 'text',
        label: { ko: '이름', en: 'Name' },
        rules: { required: true },
      },
      email: {
        type: 'email',
        label: { ko: '이메일', en: 'Email' },
        rules: { required: true, email: true },
      },
    },
  };

  const handleChange = useCallback(
    (name: string, value: any, data: FormData) => {
      setFormData(data);
      console.log(`Field "${name}" changed to:`, value);
    },
    []
  );

  const handleValidate = useCallback((errors: FormErrors) => {
    setValidationErrors(errors);
    console.log('Validation errors:', errors);
  }, []);

  const handleSubmit = useCallback(
    async (data: FormData, errors: FormErrors) => {
      if (Object.keys(errors).length > 0) {
        console.log('Form has errors:', errors);
        return;
      }

      setIsSubmitting(true);
      try {
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log('Submitted successfully:', data);
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  return (
    <div>
      <FormBuilder
        spec={spec}
        data={formData}
        language="ko"
        disabled={isSubmitting}
        onChange={handleChange}
        onValidate={handleValidate}
        onSubmit={handleSubmit}
      />
      <div className="debug-panel">
        <h4>Current Form Data:</h4>
        <pre>{JSON.stringify(formData, null, 2)}</pre>
        <h4>Validation Errors:</h4>
        <pre>{JSON.stringify(validationErrors, null, 2)}</pre>
      </div>
    </div>
  );
}

// =============================================================================
// Custom Wrapper and Buttons
// =============================================================================

/**
 * Form with custom wrapper and button rendering
 */
export function CustomRenderingExample() {
  const spec = {
    type: 'group' as const,
    properties: {
      email: {
        type: 'email',
        label: 'Email',
        rules: { required: true, email: true },
      },
      password: {
        type: 'password',
        label: 'Password',
        rules: { required: true, minlength: 8 },
      },
    },
  };

  return (
    <FormBuilder
      spec={spec}
      language="en"
      className="custom-form"
      renderWrapper={({ children, spec, onSubmit }) => (
        <form onSubmit={onSubmit} className="custom-wrapper">
          <div className="form-header">
            <h2>Login Form</h2>
            <p>Please enter your credentials</p>
          </div>
          <div className="form-body">{children}</div>
          <div className="form-footer">
            <small>By logging in, you agree to our terms.</small>
          </div>
        </form>
      )}
      renderButtons={({ isSubmitting, isValid }) => (
        <div className="custom-buttons">
          <button
            type="submit"
            disabled={isSubmitting}
            className={isValid ? 'btn-primary' : 'btn-disabled'}
          >
            {isSubmitting ? 'Logging in...' : 'Login'}
          </button>
          <a href="/forgot-password">Forgot password?</a>
        </div>
      )}
      onSubmit={(data, errors) => {
        if (Object.keys(errors).length === 0) {
          console.log('Login attempt:', data);
        }
      }}
    />
  );
}

// =============================================================================
// Full Featured Example
// =============================================================================

/**
 * Complete example with all features
 */
export default function FullFeaturedForm() {
  const [language, setLanguage] = useState<Language>('ko');

  const handleSubmit = async (data: FormData, errors: FormErrors) => {
    if (Object.keys(errors).length > 0) {
      alert('Please fix the errors before submitting.');
      return;
    }

    try {
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        alert('Product saved successfully!');
      } else {
        throw new Error('Failed to save product');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('An error occurred while saving.');
    }
  };

  // Load spec from YAML file (in real app, this would be loaded from server)
  const specYaml = `
type: group
properties:
  basic:
    type: group
    label:
      ko: 기본 정보
      en: Basic Information
    properties:
      name:
        type: text
        label:
          ko: 상품명
          en: Product Name
        rules:
          required: true
          maxlength: 100
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
`;

  return (
    <div className="product-form-container">
      <div className="form-toolbar">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
        >
          <option value="ko">한국어</option>
          <option value="en">English</option>
        </select>
      </div>

      <FormBuilder
        spec={specYaml}
        language={language}
        className="product-form"
        onSubmit={handleSubmit}
        onChange={(name, value) => {
          console.log(`Changed: ${name} =`, value);
        }}
      />
    </div>
  );
}
