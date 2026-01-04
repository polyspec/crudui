import { useState, useEffect } from 'react';
import { FormBuilder } from '@limepie/form-react/legacy';

interface ProductPageProps {
  language: 'ko' | 'en';
}

export function ProductPage({ language }: ProductPageProps) {
  const [spec, setSpec] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    basic: {
      name: '',
      sku: '',
      category: '',
      description: '',
    },
    pricing: {
      price: '',
      sale_price: '',
      tax_rate: 10,
    },
    inventory: {
      quantity: 0,
      low_stock_alert: 10,
      track_inventory: true,
    },
    status: 'draft',
    featured: false,
  });
  const [submittedData, setSubmittedData] = useState<Record<string, unknown> | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/specs/product-form.yml')
      .then(res => res.text())
      .then(setSpec)
      .catch(err => console.error('Failed to load spec:', err));
  }, []);

  const handleSubmit = (data: Record<string, unknown>, errors: Record<string, string>) => {
    setValidationErrors(errors);

    if (Object.keys(errors).length === 0) {
      setSubmittedData(data);
      console.log('Product form submitted:', data);
      alert(language === 'ko' ? '상품이 등록되었습니다!' : 'Product has been registered!');
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
        <div className="page-header">
          <h1>{language === 'ko' ? '상품 폼' : 'Product Form'}</h1>
          <p className="text-muted">
            {language === 'ko'
              ? 'Bootstrap 5 스타일의 다중 입력과 동적 필드를 보여줍니다.'
              : 'Demonstrates Bootstrap 5 styled multiple inputs and dynamic fields.'}
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
