import { useState, useEffect } from 'react';
import { FormBuilder } from '@limepie/form-react/legacy';

interface MultiplePageProps {
  language: 'ko' | 'en';
}

export function MultiplePage({ language }: MultiplePageProps) {
  const [spec, setSpec] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    contacts: [
      { name: '', email: '', phone: '' }
    ],
    tags: [],
    notes: '',
  });
  const [submittedData, setSubmittedData] = useState<Record<string, unknown> | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/specs/multiple-test.yml')
      .then(res => res.text())
      .then(setSpec)
      .catch(err => console.error('Failed to load spec:', err));
  }, []);

  const handleSubmit = (data: Record<string, unknown>, errors: Record<string, string>) => {
    setValidationErrors(errors);

    if (Object.keys(errors).length === 0) {
      setSubmittedData(data);
      console.log('Multiple form submitted:', data);
      alert(language === 'ko' ? '폼이 제출되었습니다!' : 'Form has been submitted!');
    } else {
      console.log('Validation errors:', errors);
    }
  };

  const handleChange = (name: string, value: unknown, fullData: Record<string, unknown>) => {
    // Use the full data from FormBuilder instead of managing state separately
    setFormData(fullData as typeof formData);
  };

  if (!spec) {
    return (
      <div className="row">
        <div className="col-12 text-center py-5">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2">{language === 'ko' ? '스펙 로딩 중...' : 'Loading spec...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="row">
      <div className="col-lg-8">
        {/* Page Header */}
        <div className="page-header mb-4">
          <h1>{language === 'ko' ? 'Multiple 테스트' : 'Multiple Test'}</h1>
          <p className="text-muted">
            {language === 'ko'
              ? 'multiple: true 옵션으로 반복 가능한 필드 그룹을 테스트합니다.'
              : 'Test repeatable field groups with multiple: true option.'}
          </p>
        </div>

        {/* Form Container */}
        <div className="card">
          <div className="card-body">
            <FormBuilder
              spec={spec}
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
        <div className="card sticky-top" style={{ top: '80px' }}>
          <div className="card-header">
            <h5 className="mb-0">{language === 'ko' ? '실시간 데이터' : 'Real-time Data'}</h5>
          </div>
          <div className="card-body">
            <pre className="mb-0" style={{ fontSize: '0.75rem', maxHeight: '300px', overflow: 'auto' }}>
              {JSON.stringify(formData, null, 2)}
            </pre>
          </div>

          {Object.keys(validationErrors).length > 0 && (
            <>
              <div className="card-header border-top">
                <h5 className="mb-0 text-danger">{language === 'ko' ? '유효성 오류' : 'Validation Errors'}</h5>
              </div>
              <div className="card-body">
                <pre className="mb-0 text-danger" style={{ fontSize: '0.75rem' }}>
                  {JSON.stringify(validationErrors, null, 2)}
                </pre>
              </div>
            </>
          )}

          {submittedData && (
            <>
              <div className="card-header border-top">
                <h5 className="mb-0 text-success">{language === 'ko' ? '제출된 데이터' : 'Submitted Data'}</h5>
              </div>
              <div className="card-body">
                <pre className="mb-0 text-success" style={{ fontSize: '0.75rem' }}>
                  {JSON.stringify(submittedData, null, 2)}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
