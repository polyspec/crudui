import { useState } from 'react';
import { FormBuilder } from '@limepie/form-react';
import registrationSpec from '../specs/registration.yaml?raw';

interface RegistrationPageProps {
  language: 'ko' | 'en';
}

export function RegistrationPage({ language }: RegistrationPageProps) {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    password_confirm: '',
    name: '',
    phone: '',
    gender: '',
    birthdate: '',
    address: '',
    marketing_agree: false,
    terms_agree: false,
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
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className="row">
      <div className="col-lg-8">
        {/* Page Header */}
        <div className="page-header">
          <h1>{language === 'ko' ? '회원가입 폼' : 'Registration Form'}</h1>
          <p className="text-muted">
            {language === 'ko'
              ? 'Bootstrap 5 카드와 그룹화된 필드를 보여줍니다.'
              : 'Demonstrates Bootstrap 5 cards and grouped fields.'}
          </p>
        </div>

        {/* Form Container */}
        <div className="card">
          <div className="card-body">
            <FormBuilder
              spec={registrationSpec}
              data={formData}
              language={language}
              onSubmit={handleSubmit}
              onChange={handleChange}
              className="bootstrap-form"
            />
          </div>
        </div>
      </div>

      {/* Debug Panel */}
      <div className="col-lg-4">
        <div className="debug-panel">
          <h5>{language === 'ko' ? '실시간 데이터' : 'Real-time Data'}</h5>
          <pre>{JSON.stringify(formData, null, 2)}</pre>

          {Object.keys(validationErrors).length > 0 && (
            <>
              <h5>{language === 'ko' ? '유효성 검사 오류' : 'Validation Errors'}</h5>
              <pre className="text-danger">{JSON.stringify(validationErrors, null, 2)}</pre>
            </>
          )}

          {submittedData && (
            <>
              <h5>{language === 'ko' ? '제출된 데이터' : 'Submitted Data'}</h5>
              <pre className="text-success">{JSON.stringify(submittedData, null, 2)}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
