import { useState } from 'react';
import { FormBuilder } from '@limepie/form-react';
import contactSpec from '../specs/contact.yaml?raw';

interface ContactPageProps {
  language: 'ko' | 'en';
}

export function ContactPage({ language }: ContactPageProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    category: '',
    message: '',
    privacy_agree: false,
  });
  const [submittedData, setSubmittedData] = useState<Record<string, unknown> | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const handleSubmit = (data: Record<string, unknown>, errors: Record<string, string>) => {
    setValidationErrors(errors);

    if (Object.keys(errors).length === 0) {
      setSubmittedData(data);
      console.log('Contact form submitted:', data);
      alert(language === 'ko' ? '문의가 성공적으로 전송되었습니다!' : 'Your inquiry has been sent successfully!');
    } else {
      console.log('Validation errors:', errors);
    }
  };

  const handleChange = (name: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
    console.log(`Field changed: ${name} =`, value);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{language === 'ko' ? '문의 폼' : 'Contact Form'}</h1>
        <p className="subtitle">
          {language === 'ko'
            ? '기본적인 폼 필드와 유효성 검사를 보여줍니다.'
            : 'Demonstrates basic form fields and validation.'}
        </p>
      </div>

      <div className="form-container">
        <FormBuilder
          spec={contactSpec}
          data={formData}
          language={language}
          onSubmit={handleSubmit}
          onChange={handleChange}
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
