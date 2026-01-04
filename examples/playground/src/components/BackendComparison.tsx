import React, { useState, useCallback } from 'react';
import type { FormData } from '@form-spec/generator-react';

interface BackendResult {
  backend: string;
  url: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  valid?: boolean;
  errors?: Record<string, string[]>;
  responseTime?: number;
  errorMessage?: string;
}

interface BackendComparisonProps {
  spec: string;
  data: FormData;
  language: 'ko' | 'en';
}

const BACKENDS = [
  { name: 'Node.js', url: 'http://localhost:8011/api/validate', color: '#68a063' },
  { name: 'PHP', url: 'http://localhost:8012/validate.php', color: '#777bb4' },
  { name: 'Go', url: 'http://localhost:8013/validate', color: '#00add8' },
];

export const BackendComparison: React.FC<BackendComparisonProps> = ({
  spec,
  data,
  language,
}) => {
  const [results, setResults] = useState<BackendResult[]>(
    BACKENDS.map((b) => ({
      backend: b.name,
      url: b.url,
      status: 'idle',
    }))
  );
  const [isValidating, setIsValidating] = useState(false);

  const validateBackend = useCallback(
    async (backend: typeof BACKENDS[0]): Promise<BackendResult> => {
      const startTime = performance.now();
      try {
        const response = await fetch(backend.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ spec, data }),
        });

        const endTime = performance.now();
        const responseTime = Math.round(endTime - startTime);

        if (!response.ok) {
          return {
            backend: backend.name,
            url: backend.url,
            status: 'error',
            responseTime,
            errorMessage: `HTTP ${response.status}: ${response.statusText}`,
          };
        }

        const result = await response.json();
        return {
          backend: backend.name,
          url: backend.url,
          status: 'success',
          valid: result.valid,
          errors: result.errors || {},
          responseTime,
        };
      } catch (error) {
        const endTime = performance.now();
        return {
          backend: backend.name,
          url: backend.url,
          status: 'error',
          responseTime: Math.round(endTime - startTime),
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    [spec, data]
  );

  const handleValidateAll = useCallback(async () => {
    setIsValidating(true);

    // Set all to loading
    setResults(
      BACKENDS.map((b) => ({
        backend: b.name,
        url: b.url,
        status: 'loading',
      }))
    );

    // Validate all backends in parallel
    const promises = BACKENDS.map((backend) => validateBackend(backend));
    const newResults = await Promise.all(promises);

    setResults(newResults);
    setIsValidating(false);
  }, [validateBackend]);

  // Check if all results match
  const allResultsMatch = useCallback(() => {
    const successResults = results.filter((r) => r.status === 'success');
    if (successResults.length < 2) return null;

    const firstResult = successResults[0];
    return successResults.every(
      (r) =>
        r.valid === firstResult.valid &&
        JSON.stringify(r.errors) === JSON.stringify(firstResult.errors)
    );
  }, [results]);

  const matchStatus = allResultsMatch();

  return (
    <div className="backend-comparison">
      <div className="comparison-header">
        <button
          className="btn btn-primary validate-all-btn"
          onClick={handleValidateAll}
          disabled={isValidating}
        >
          {isValidating
            ? language === 'ko'
              ? '검증 중...'
              : 'Validating...'
            : language === 'ko'
              ? '모든 백엔드 검증'
              : 'Validate All Backends'}
        </button>
        {matchStatus !== null && (
          <span
            className={`match-status ${matchStatus ? 'match' : 'mismatch'}`}
          >
            {matchStatus
              ? language === 'ko'
                ? 'All backends match'
                : 'All backends match'
              : language === 'ko'
                ? 'Results differ!'
                : 'Results differ!'}
          </span>
        )}
      </div>

      <div className="comparison-grid">
        {results.map((result, index) => (
          <div
            key={result.backend}
            className={`comparison-column ${result.status}`}
            style={{ '--backend-color': BACKENDS[index].color } as React.CSSProperties}
          >
            <div className="column-header">
              <span className="backend-name">{result.backend}</span>
              {result.responseTime !== undefined && (
                <span className="response-time">{result.responseTime}ms</span>
              )}
            </div>
            <div className="column-content">
              {result.status === 'idle' && (
                <div className="status-idle">
                  {language === 'ko'
                    ? '버튼을 클릭하여 검증'
                    : 'Click button to validate'}
                </div>
              )}
              {result.status === 'loading' && (
                <div className="status-loading">
                  <div className="spinner"></div>
                  {language === 'ko' ? '검증 중...' : 'Validating...'}
                </div>
              )}
              {result.status === 'error' && (
                <div className="status-error">
                  <svg
                    className="status-icon error"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="error-message">{result.errorMessage}</span>
                </div>
              )}
              {result.status === 'success' && (
                <div className="status-success">
                  <div className={`valid-badge ${result.valid ? 'valid' : 'invalid'}`}>
                    {result.valid ? (
                      <>
                        <svg
                          className="status-icon success"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {language === 'ko' ? '유효함' : 'Valid'}
                      </>
                    ) : (
                      <>
                        <svg
                          className="status-icon error"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {language === 'ko' ? '유효하지 않음' : 'Invalid'}
                      </>
                    )}
                  </div>
                  {result.errors && Object.keys(result.errors).length > 0 && (
                    <div className="errors-list">
                      {Object.entries(result.errors).map(([field, messages]) => (
                        <div key={field} className="error-item">
                          <span className="error-field">{field}:</span>
                          <span className="error-messages">
                            {Array.isArray(messages)
                              ? messages.join(', ')
                              : messages}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
