import { useState } from 'react';
import { FormBuilder } from '@form-spec/generator-react';
import registrationSpec from '../specs/registration.yaml?raw';

interface RegistrationPageProps {
  language: 'ko' | 'en';
}

export function RegistrationPage({ language }: RegistrationPageProps) {
  const [formData, setFormData] = useState({
    personal: {
      name: '',
      email: '',
      birth_date: '',
    },
    account: {
      username: '',
      password: '',
    },
    account_type: 'personal',
    business_info: {
      company_name: '',
      business_number: '',
      employee_count: '',
    },
    preferences: {
      newsletter: [],
      language: 'ko',
    },
    terms: false,
    privacy: false,
  });
  const [submittedData, setSubmittedData] = useState<Record<string, unknown> | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const handleSubmit = (data: Record<string, unknown>, errors: Record<string, string>) => {
    setValidationErrors(errors);

    if (Object.keys(errors).length === 0) {
      setSubmittedData(data);
      console.log('Registration form submitted:', data);
      alert(language === 'ko' ? '회원가입이 완료되었습니다!' : 'Registration completed successfully!');
    } else {
      console.log('Validation errors:', errors);
    }
  };

  const handleChange = (name: string, value: unknown) => {
    // Handle nested paths
    const parts = name.split('.');
    setFormData(prev => {
      const newData = { ...prev };
      let current: Record<string, unknown> = newData;

      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (typeof current[key] === 'object' && current[key] !== null) {
          current[key] = { ...(current[key] as Record<string, unknown>) };
          current = current[key] as Record<string, unknown>;
        }
      }

      current[parts[parts.length - 1]] = value;
      return newData;
    });
    console.log(`Field changed: ${name} =`, value);
  };

  const handleValidate = (errors: Record<string, string>) => {
    setValidationErrors(errors);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{language === 'ko' ? '회원가입 폼' : 'Registration Form'}</h1>
        <p className="subtitle">
          {language === 'ko'
            ? '조건부 필드와 중첩 그룹을 보여줍니다. "비즈니스" 계정 유형을 선택하면 추가 필드가 나타납니다.'
            : 'Demonstrates conditional fields and nested groups. Select "Business" account type to see additional fields.'}
        </p>
      </div>

      <div className="form-container">
        <FormBuilder
          spec={registrationSpec}
          data={formData}
          language={language}
          onSubmit={handleSubmit}
          onChange={handleChange}
          onValidate={handleValidate}
          className="demo-form"
        />
      </div>

      <div className="debug-panel">
        <h3>{language === 'ko' ? '실시간 데이터' : 'Real-time Data'}</h3>
        <pre>{JSON.stringify(formData, null, 2)}</pre>

        {Object.keys(validationErrors).length > 0 && (
          <>
            <h3>{language === 'ko' ? '유효성 검사 오류' : 'Validation Errors'}</h3>
            <pre className="error">{JSON.stringify(validationErrors, null, 2)}</pre>
          </>
        )}

        {submittedData && (
          <>
            <h3>{language === 'ko' ? '제출된 데이터' : 'Submitted Data'}</h3>
            <pre className="success">{JSON.stringify(submittedData, null, 2)}</pre>
          </>
        )}
      </div>
    </div>
  );
}
