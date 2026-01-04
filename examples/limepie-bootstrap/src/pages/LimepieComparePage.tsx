import { useState, useEffect } from 'react';
import { FormBuilder } from '@limepie/form-react';
import contactSpec from '../specs/contact.yaml?raw';

interface LimepieComparePageProps {
  language: 'ko' | 'en';
}

export function LimepieComparePage({ language }: LimepieComparePageProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    category: '',
    message: '',
    privacy_agree: false,
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const handleSubmit = (data: Record<string, unknown>, errors: Record<string, string>) => {
    setValidationErrors(errors);
    if (Object.keys(errors).length === 0) {
      console.log('Form submitted:', data);
      alert(language === 'ko' ? '폼이 제출되었습니다!' : 'Form submitted!');
    }
  };

  const handleChange = (name: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  // Load validate.js for the Limepie original form
  useEffect(() => {
    const script = document.createElement('script');
    script.src = '/assets/js/validate.custom.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <h1>{language === 'ko' ? 'Limepie 폼 비교' : 'Limepie Form Comparison'}</h1>
        <p className="text-muted">
          {language === 'ko'
            ? 'React 폼 빌더와 원본 Limepie PHP 폼의 Bootstrap 5 스타일을 비교합니다.'
            : 'Compare Bootstrap 5 styling between React Form Builder and original Limepie PHP form.'}
        </p>
      </div>

      <div className="row">
        {/* React Form Builder Side */}
        <div className="col-lg-6 mb-4">
          <div className="card h-100">
            <div className="card-header bg-primary text-white">
              <h5 className="card-title mb-0">
                {language === 'ko' ? 'React 폼 빌더' : 'React Form Builder'}
              </h5>
            </div>
            <div className="card-body">
              <FormBuilder
                spec={contactSpec}
                data={formData}
                language={language}
                onSubmit={handleSubmit}
                onChange={handleChange}
                className="bootstrap-form"
              />
            </div>
            <div className="card-footer bg-light">
              <small className="text-muted">
                {language === 'ko'
                  ? '@limepie/form-react 패키지로 생성'
                  : 'Generated with @limepie/form-react package'}
              </small>
            </div>
          </div>
        </div>

        {/* Original Limepie Style Side */}
        <div className="col-lg-6 mb-4">
          <div className="card h-100">
            <div className="card-header bg-success text-white">
              <h5 className="card-title mb-0">
                {language === 'ko' ? 'Limepie 원본 스타일' : 'Original Limepie Style'}
              </h5>
            </div>
            <div className="card-body">
              <form className="limepie-original-form" id="limepie-form">
                {/* Name Field */}
                <div className="form-element-wrapper mb-3">
                  <label htmlFor="limepie-name" className="form-label required">
                    {language === 'ko' ? '이름' : 'Your Name'}
                  </label>
                  <div className="input-group-wrapper">
                    <input
                      type="text"
                      className="form-control valid-target"
                      id="limepie-name"
                      name="name"
                      placeholder={language === 'ko' ? '이름을 입력하세요' : 'Enter your name'}
                      data-rules='{"required":true,"minlength":2,"maxlength":50}'
                    />
                  </div>
                </div>

                {/* Email Field */}
                <div className="form-element-wrapper mb-3">
                  <label htmlFor="limepie-email" className="form-label required">
                    {language === 'ko' ? '이메일' : 'Email Address'}
                  </label>
                  <div className="input-group-wrapper">
                    <input
                      type="email"
                      className="form-control valid-target"
                      id="limepie-email"
                      name="email"
                      placeholder="example@domain.com"
                      data-rules='{"required":true,"email":true}'
                    />
                  </div>
                </div>

                {/* Phone Field */}
                <div className="form-element-wrapper mb-3">
                  <label htmlFor="limepie-phone" className="form-label">
                    {language === 'ko' ? '전화번호' : 'Phone Number'}
                  </label>
                  <div className="input-group-wrapper">
                    <input
                      type="text"
                      className="form-control valid-target"
                      id="limepie-phone"
                      name="phone"
                      placeholder="010-1234-5678"
                    />
                  </div>
                  <small className="form-text text-muted">
                    {language === 'ko' ? '선택사항입니다.' : 'Optional field.'}
                  </small>
                </div>

                {/* Category Field */}
                <div className="form-element-wrapper mb-3">
                  <label htmlFor="limepie-category" className="form-label required">
                    {language === 'ko' ? '문의 유형' : 'Inquiry Type'}
                  </label>
                  <div className="input-group-wrapper">
                    <select
                      className="form-select valid-target"
                      id="limepie-category"
                      name="category"
                      data-rules='{"required":true}'
                    >
                      <option value="">{language === 'ko' ? '선택하세요' : 'Please select'}</option>
                      <option value="general">{language === 'ko' ? '일반 문의' : 'General Inquiry'}</option>
                      <option value="support">{language === 'ko' ? '기술 지원' : 'Technical Support'}</option>
                      <option value="sales">{language === 'ko' ? '영업 문의' : 'Sales Inquiry'}</option>
                      <option value="partnership">{language === 'ko' ? '제휴 문의' : 'Partnership'}</option>
                    </select>
                  </div>
                </div>

                {/* Message Field */}
                <div className="form-element-wrapper mb-3">
                  <label htmlFor="limepie-message" className="form-label required">
                    {language === 'ko' ? '문의 내용' : 'Message'}
                  </label>
                  <div className="input-group-wrapper">
                    <textarea
                      className="form-control valid-target"
                      id="limepie-message"
                      name="message"
                      rows={5}
                      placeholder={language === 'ko' ? '문의하실 내용을 자세히 적어주세요.' : 'Please describe your inquiry in detail.'}
                      data-rules='{"required":true,"minlength":10,"maxlength":1000}'
                    />
                  </div>
                </div>

                {/* Privacy Agree Field */}
                <div className="form-element-wrapper mb-3">
                  <div className="input-group-wrapper">
                    <div className="form-check form-switch">
                      <input
                        type="checkbox"
                        className="form-check-input valid-target"
                        id="limepie-privacy"
                        name="privacy_agree"
                        value="1"
                        data-rules='{"required":true}'
                      />
                      <label className="form-check-label" htmlFor="limepie-privacy">
                        {language === 'ko' ? '개인정보 수집 동의' : 'I agree to the Privacy Policy'}
                      </label>
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="form-button-group">
                  <button type="submit" className="btn btn-primary">
                    {language === 'ko' ? '문의 보내기' : 'Send Inquiry'}
                  </button>
                  <button type="button" className="btn btn-secondary">
                    {language === 'ko' ? '취소' : 'Cancel'}
                  </button>
                </div>
              </form>
            </div>
            <div className="card-footer bg-light">
              <small className="text-muted">
                {language === 'ko'
                  ? 'Limepie PHP 폼과 동일한 HTML 구조'
                  : 'Same HTML structure as Limepie PHP form'}
              </small>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Notes */}
      <div className="card mt-4">
        <div className="card-header">
          <h5 className="card-title mb-0">
            {language === 'ko' ? 'Bootstrap 5 클래스 비교' : 'Bootstrap 5 Class Comparison'}
          </h5>
        </div>
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-bordered">
              <thead className="table-light">
                <tr>
                  <th>{language === 'ko' ? '요소' : 'Element'}</th>
                  <th>Limepie PHP</th>
                  <th>React FormBuilder</th>
                  <th>{language === 'ko' ? '일치' : 'Match'}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{language === 'ko' ? '텍스트 입력' : 'Text Input'}</td>
                  <td><code>form-control</code></td>
                  <td><code>form-control</code></td>
                  <td className="text-success">&#10003;</td>
                </tr>
                <tr>
                  <td>{language === 'ko' ? '레이블' : 'Label'}</td>
                  <td><code>form-label</code></td>
                  <td><code>form-label</code></td>
                  <td className="text-success">&#10003;</td>
                </tr>
                <tr>
                  <td>{language === 'ko' ? '셀렉트박스' : 'Select'}</td>
                  <td><code>form-select</code></td>
                  <td><code>form-select</code></td>
                  <td className="text-success">&#10003;</td>
                </tr>
                <tr>
                  <td>{language === 'ko' ? '체크박스' : 'Checkbox'}</td>
                  <td><code>form-check-input</code></td>
                  <td><code>form-check-input</code></td>
                  <td className="text-success">&#10003;</td>
                </tr>
                <tr>
                  <td>{language === 'ko' ? '스위치' : 'Switch'}</td>
                  <td><code>form-check form-switch</code></td>
                  <td><code>form-check form-switch</code></td>
                  <td className="text-success">&#10003;</td>
                </tr>
                <tr>
                  <td>{language === 'ko' ? '버튼' : 'Button'}</td>
                  <td><code>btn btn-primary</code></td>
                  <td><code>btn btn-primary</code></td>
                  <td className="text-success">&#10003;</td>
                </tr>
                <tr>
                  <td>{language === 'ko' ? '오류 상태' : 'Error State'}</td>
                  <td><code>is-invalid</code></td>
                  <td><code>is-invalid</code></td>
                  <td className="text-success">&#10003;</td>
                </tr>
                <tr>
                  <td>{language === 'ko' ? '오류 메시지' : 'Error Message'}</td>
                  <td><code>invalid-feedback</code></td>
                  <td><code>invalid-feedback</code></td>
                  <td className="text-success">&#10003;</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Debug Panel */}
      {Object.keys(validationErrors).length > 0 && (
        <div className="card mt-4">
          <div className="card-header bg-danger text-white">
            <h5 className="card-title mb-0">
              {language === 'ko' ? '유효성 검사 오류' : 'Validation Errors'}
            </h5>
          </div>
          <div className="card-body">
            <pre className="mb-0">{JSON.stringify(validationErrors, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
