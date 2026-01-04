import React, { useState } from 'react';
import type { FormData, FormErrors } from '@form-spec/generator-react';
import { BackendComparison } from './BackendComparison';

interface OutputPanelProps {
  spec: string;
  data: FormData;
  errors: FormErrors;
  language: 'ko' | 'en';
}

type TabType = 'json' | 'validation' | 'comparison';

export const OutputPanel: React.FC<OutputPanelProps> = ({
  spec,
  data,
  errors,
  language,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('json');

  const errorEntries = Object.entries(errors);
  const hasErrors = errorEntries.length > 0;

  return (
    <>
      <div className="output-tabs">
        <button
          className={`output-tab ${activeTab === 'json' ? 'active' : ''}`}
          onClick={() => setActiveTab('json')}
        >
          {language === 'ko' ? 'JSON 데이터' : 'JSON Data'}
        </button>
        <button
          className={`output-tab ${activeTab === 'validation' ? 'active' : ''}`}
          onClick={() => setActiveTab('validation')}
        >
          {language === 'ko' ? '유효성 검사' : 'Validation'}
          {hasErrors && (
            <span style={{ marginLeft: 6, color: '#ef4444' }}>
              ({errorEntries.length})
            </span>
          )}
        </button>
        <button
          className={`output-tab ${activeTab === 'comparison' ? 'active' : ''}`}
          onClick={() => setActiveTab('comparison')}
        >
          {language === 'ko' ? '백엔드 비교' : 'Backend Comparison'}
        </button>
      </div>
      <div className="output-content">
        {activeTab === 'json' ? (
          <div className="output-json">
            {JSON.stringify(data, null, 2)}
          </div>
        ) : activeTab === 'validation' ? (
          <div className="validation-results">
            {hasErrors ? (
              errorEntries.map(([field, messages]) => (
                <div key={field} className="validation-item error">
                  <svg
                    className="validation-icon error"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <span className="validation-field">{field}</span>
                    {': '}
                    <span className="validation-message">
                      {Array.isArray(messages) ? messages.join(', ') : messages}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="validation-item success">
                <svg
                  className="validation-icon success"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="validation-message">
                  {language === 'ko'
                    ? '유효성 검사를 통과했습니다.'
                    : 'All validations passed.'}
                </span>
              </div>
            )}
          </div>
        ) : (
          <BackendComparison spec={spec} data={data} language={language} />
        )}
      </div>
    </>
  );
};
