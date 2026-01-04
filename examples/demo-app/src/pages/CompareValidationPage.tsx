import { useState } from 'react';
import { FormBuilder } from '@limepie/form-react';
import contactSpec from '../specs/contact.yaml?raw';

interface CompareValidationPageProps {
  language: 'ko' | 'en';
}

interface BackendResult {
  name: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  responseTime?: number;
  data?: {
    success: boolean;
    errors?: Record<string, string>;
    message?: string;
  };
  error?: string;
}

interface ValidationResults {
  nodejs: BackendResult;
  php: BackendResult;
  go: BackendResult;
}

const BACKENDS = {
  nodejs: {
    name: 'Node.js',
    url: 'http://localhost:8011/api/submit/contact',
    color: '#68a063',
  },
  php: {
    name: 'PHP',
    url: 'http://localhost:8012/validate.php',
    color: '#777bb4',
  },
  go: {
    name: 'Go',
    url: 'http://localhost:8013/submit/contact',
    color: '#00add8',
  },
};

function normalizeErrors(errors: Record<string, string> | undefined): Record<string, string> {
  if (!errors) return {};
  const normalized: Record<string, string> = {};
  const sortedKeys = Object.keys(errors).sort();
  for (const key of sortedKeys) {
    normalized[key] = errors[key];
  }
  return normalized;
}

function compareResults(results: ValidationResults): { match: boolean; details: string } {
  const completed = Object.values(results).filter(r => r.status === 'success');
  if (completed.length < 3) {
    return { match: false, details: 'Not all backends responded' };
  }

  const errorSets = completed.map(r => JSON.stringify(normalizeErrors(r.data?.errors)));
  const successFlags = completed.map(r => r.data?.success);

  const allErrorsMatch = errorSets.every(e => e === errorSets[0]);
  const allSuccessMatch = successFlags.every(s => s === successFlags[0]);

  if (allErrorsMatch && allSuccessMatch) {
    return { match: true, details: 'All backends returned identical results' };
  }

  return { match: false, details: 'Results differ between backends' };
}

export function CompareValidationPage({ language }: CompareValidationPageProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    category: '',
    message: '',
    privacy_agree: false,
  });

  const [results, setResults] = useState<ValidationResults>({
    nodejs: { name: 'Node.js', status: 'pending' },
    php: { name: 'PHP', status: 'pending' },
    go: { name: 'Go', status: 'pending' },
  });

  const [isValidating, setIsValidating] = useState(false);

  const handleChange = (name: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const validateBackend = async (
    key: keyof typeof BACKENDS,
    data: Record<string, unknown>
  ): Promise<BackendResult> => {
    const backend = BACKENDS[key];
    const startTime = performance.now();

    try {
      const requestBody = key === 'php'
        ? { spec: 'contact', data }
        : data;

      const response = await fetch(backend.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseTime = Math.round(performance.now() - startTime);
      const result = await response.json();

      return {
        name: backend.name,
        status: 'success',
        responseTime,
        data: result,
      };
    } catch (err) {
      const responseTime = Math.round(performance.now() - startTime);
      return {
        name: backend.name,
        status: 'error',
        responseTime,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  };

  const handleValidateAll = async () => {
    setIsValidating(true);

    // Set all to loading
    setResults({
      nodejs: { name: 'Node.js', status: 'loading' },
      php: { name: 'PHP', status: 'loading' },
      go: { name: 'Go', status: 'loading' },
    });

    // Validate all backends simultaneously
    const [nodejsResult, phpResult, goResult] = await Promise.all([
      validateBackend('nodejs', formData),
      validateBackend('php', formData),
      validateBackend('go', formData),
    ]);

    setResults({
      nodejs: nodejsResult,
      php: phpResult,
      go: goResult,
    });

    setIsValidating(false);
  };

  const comparison = compareResults(results);
  const hasResults = Object.values(results).some(r => r.status === 'success' || r.status === 'error');

  return (
    <div className="compare-validation-page">
      <div className="page-header">
        <h1>{language === 'ko' ? '멀티 백엔드 검증 비교' : 'Multi-Backend Validation Compare'}</h1>
        <p className="subtitle">
          {language === 'ko'
            ? '동일한 입력이 Node.js, PHP, Go에서 동일한 검증 결과를 생성하는지 확인합니다.'
            : 'Verify that the same input produces identical validation results across Node.js, PHP, and Go.'}
        </p>
      </div>

      <div className="compare-layout">
        <div className="form-section">
          <div className="form-container">
            <FormBuilder
              spec={contactSpec}
              data={formData}
              language={language}
              onChange={handleChange}
              onSubmit={() => {}}
              className="demo-form"
            />
            <div className="validate-action">
              <button
                className="btn btn-primary btn-lg w-100"
                onClick={handleValidateAll}
                disabled={isValidating}
              >
                {isValidating
                  ? (language === 'ko' ? '검증 중...' : 'Validating...')
                  : (language === 'ko' ? '3개 백엔드 동시 검증' : 'Validate All 3 Backends')}
              </button>
            </div>
          </div>

          <div className="input-preview">
            <h3>{language === 'ko' ? '전송 데이터' : 'Request Data'}</h3>
            <pre>{JSON.stringify(formData, null, 2)}</pre>
          </div>
        </div>

        <div className="results-section">
          {hasResults && (
            <div className={`comparison-status ${comparison.match ? 'match' : 'mismatch'}`}>
              <span className="status-icon">{comparison.match ? '\u2713' : '\u26A0'}</span>
              <span className="status-text">
                {comparison.match
                  ? (language === 'ko' ? '멱등성 검증 성공' : 'Idempotency Verified')
                  : (language === 'ko' ? '결과 불일치' : 'Results Mismatch')}
              </span>
              <span className="status-detail">{comparison.details}</span>
            </div>
          )}

          <div className="results-grid">
            {(Object.keys(BACKENDS) as Array<keyof typeof BACKENDS>).map(key => {
              const backend = BACKENDS[key];
              const result = results[key];

              return (
                <div key={key} className="result-column">
                  <div className="result-header" style={{ borderColor: backend.color }}>
                    <span className="backend-name" style={{ color: backend.color }}>
                      {backend.name}
                    </span>
                    {result.responseTime !== undefined && (
                      <span className="response-time">{result.responseTime}ms</span>
                    )}
                  </div>

                  <div className="result-body">
                    {result.status === 'pending' && (
                      <div className="result-placeholder">
                        {language === 'ko' ? '대기 중' : 'Waiting'}
                      </div>
                    )}

                    {result.status === 'loading' && (
                      <div className="result-loading">
                        <div className="spinner"></div>
                        {language === 'ko' ? '검증 중...' : 'Validating...'}
                      </div>
                    )}

                    {result.status === 'error' && (
                      <div className="result-error">
                        <div className="error-icon">!</div>
                        <div className="error-message">{result.error}</div>
                      </div>
                    )}

                    {result.status === 'success' && result.data && (
                      <div className="result-success">
                        <div className={`validation-status ${result.data.success ? 'valid' : 'invalid'}`}>
                          {result.data.success
                            ? (language === 'ko' ? '유효함' : 'Valid')
                            : (language === 'ko' ? '유효하지 않음' : 'Invalid')}
                        </div>

                        {result.data.errors && Object.keys(result.data.errors).length > 0 && (
                          <div className="errors-list">
                            <h4>{language === 'ko' ? '검증 오류' : 'Validation Errors'}</h4>
                            <ul>
                              {Object.entries(result.data.errors).map(([field, message]) => (
                                <li key={field}>
                                  <strong>{field}:</strong> {message}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="raw-response">
                          <h4>{language === 'ko' ? '원시 응답' : 'Raw Response'}</h4>
                          <pre>{JSON.stringify(result.data, null, 2)}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        .compare-validation-page {
          max-width: 1400px;
          margin: 0 auto;
        }

        .compare-validation-page .page-header {
          margin-bottom: 24px;
        }

        .compare-layout {
          display: grid;
          grid-template-columns: 400px 1fr;
          gap: 24px;
          align-items: start;
        }

        .form-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .validate-action {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid var(--border-color);
        }

        .input-preview {
          background: var(--card-bg);
          padding: 16px;
          border-radius: var(--radius);
          border: 1px solid var(--border-color);
        }

        .input-preview h3 {
          font-size: 0.875rem;
          color: var(--text-muted);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .input-preview pre {
          background: #f1f5f9;
          padding: 12px;
          border-radius: 6px;
          font-size: 0.75rem;
          overflow-x: auto;
          margin: 0;
        }

        .results-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .comparison-status {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          border-radius: var(--radius);
          font-weight: 500;
        }

        .comparison-status.match {
          background: #f0fdf4;
          border: 1px solid #22c55e;
          color: #166534;
        }

        .comparison-status.mismatch {
          background: #fefce8;
          border: 1px solid #eab308;
          color: #854d0e;
        }

        .status-icon {
          font-size: 1.5rem;
          font-weight: bold;
        }

        .status-text {
          font-size: 1.1rem;
        }

        .status-detail {
          margin-left: auto;
          font-size: 0.875rem;
          opacity: 0.8;
        }

        .results-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .result-column {
          background: var(--card-bg);
          border-radius: var(--radius);
          border: 1px solid var(--border-color);
          overflow: hidden;
        }

        .result-header {
          padding: 12px 16px;
          border-bottom: 3px solid;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #f8fafc;
        }

        .backend-name {
          font-weight: 600;
          font-size: 1rem;
        }

        .response-time {
          font-size: 0.75rem;
          color: var(--text-muted);
          background: var(--bg-color);
          padding: 2px 8px;
          border-radius: 10px;
        }

        .result-body {
          padding: 16px;
          min-height: 200px;
        }

        .result-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 150px;
          color: var(--text-muted);
          font-style: italic;
        }

        .result-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 150px;
          gap: 12px;
          color: var(--text-muted);
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--border-color);
          border-top-color: var(--primary-color);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .result-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 150px;
          gap: 12px;
          color: var(--error-color);
          text-align: center;
        }

        .error-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #fef2f2;
          border: 2px solid var(--error-color);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 1.25rem;
        }

        .error-message {
          font-size: 0.875rem;
        }

        .result-success {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .validation-status {
          padding: 8px 12px;
          border-radius: 6px;
          font-weight: 600;
          text-align: center;
        }

        .validation-status.valid {
          background: #f0fdf4;
          color: #166534;
        }

        .validation-status.invalid {
          background: #fef2f2;
          color: #991b1b;
        }

        .errors-list h4 {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .errors-list ul {
          list-style: none;
          padding: 0;
          margin: 0;
          font-size: 0.8rem;
        }

        .errors-list li {
          padding: 6px 8px;
          background: #fef2f2;
          border-radius: 4px;
          margin-bottom: 4px;
          color: #991b1b;
        }

        .errors-list li strong {
          color: #7f1d1d;
        }

        .raw-response h4 {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .raw-response pre {
          background: #f1f5f9;
          padding: 12px;
          border-radius: 6px;
          font-size: 0.7rem;
          overflow-x: auto;
          margin: 0;
          max-height: 200px;
          overflow-y: auto;
        }

        @media (max-width: 1200px) {
          .compare-layout {
            grid-template-columns: 1fr;
          }

          .results-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .comparison-status {
            flex-wrap: wrap;
          }

          .status-detail {
            margin-left: 0;
            flex-basis: 100%;
            margin-top: 8px;
          }
        }
      `}</style>
    </div>
  );
}
