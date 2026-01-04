import { useState } from 'react';
import { FormBuilder } from '@limepie/form-react';
import productSpec from '../specs/product.yaml?raw';

interface ProductPageProps {
  language: 'ko' | 'en';
}

export function ProductPage({ language }: ProductPageProps) {
  const [formData] = useState({
    basic: {
      status: '1',
      name: '',
      description: '',
    },
    display: {
      display_type: '1',
      display_period: {
        start_date: '',
        end_date: '',
      },
    },
    pricing: {
      price_type: '0',
      price_info: {
        original_price: 0,
        sale_price: 0,
      },
    },
    'categories[]': [''],
    'tags[]': [''],
    has_options: '0',
    options: {
      'groups[]': [],
    },
    inventory: {
      track_inventory: '0',
      stock_info: {
        quantity: 0,
        low_stock_alert: 10,
      },
    },
    seo: {
      meta_title: '',
      meta_description: '',
    },
  });
  const [submittedData, setSubmittedData] = useState<Record<string, unknown> | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const handleSubmit = (data: Record<string, unknown>, errors: Record<string, string>) => {
    setValidationErrors(errors);

    if (Object.keys(errors).length === 0) {
      setSubmittedData(data);
      console.log('Product form submitted:', data);
      alert(language === 'ko' ? '상품이 성공적으로 저장되었습니다!' : 'Product saved successfully!');
    } else {
      console.log('Validation errors:', errors);
    }
  };

  const handleChange = (name: string, value: unknown) => {
    console.log(`Field changed: ${name} =`, value);
    // For complex nested structures, we just log the change
    // The FormBuilder handles the internal state
  };

  const handleValidate = (errors: Record<string, string>) => {
    setValidationErrors(errors);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{language === 'ko' ? '상품 등록 폼' : 'Product Form'}</h1>
        <p className="subtitle">
          {language === 'ko'
            ? '복잡한 중첩 구조, 다중 필드, 조건부 표시를 보여줍니다. 가격 유형이나 옵션 사용을 변경해보세요.'
            : 'Demonstrates complex nested structures, multiple fields, and conditional display. Try changing price type or enabling options.'}
        </p>
      </div>

      <div className="form-container wide">
        <FormBuilder
          spec={productSpec}
          data={formData}
          language={language}
          onSubmit={handleSubmit}
          onChange={handleChange}
          onValidate={handleValidate}
          className="demo-form product-form"
        />
      </div>

      <div className="debug-panel">
        <h3>{language === 'ko' ? '유효성 검사 오류' : 'Validation Errors'}</h3>
        {Object.keys(validationErrors).length > 0 ? (
          <pre className="error">{JSON.stringify(validationErrors, null, 2)}</pre>
        ) : (
          <p className="success">{language === 'ko' ? '오류 없음' : 'No errors'}</p>
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
