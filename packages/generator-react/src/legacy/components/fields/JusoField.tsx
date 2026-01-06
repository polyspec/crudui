/**
 * JusoField Component
 *
 * Korean address (Juso) input with address lookup
 * Uses Juso.go.kr or Daum/Kakao address API
 */

import React, { useCallback, useState, type ChangeEvent } from 'react';
import type { FieldComponentProps, FormValue } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation } from '../../utils/dataAttributes';

interface JusoResult {
  roadAddr: string;       // Road name address
  jibunAddr?: string;     // Lot number address
  zipNo: string;          // Postal code
  bdNm?: string;          // Building name
  siNm?: string;          // City/Province
  sggNm?: string;         // District
  emdNm?: string;         // Town
  detailAddr?: string;    // Detail address
  [key: string]: unknown;
}

/**
 * JusoField component
 */
export function JusoField({
  name,
  spec,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  readonly,
  path,
  language,
}: FieldComponentProps) {
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<JusoResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [detailAddr, setDetailAddr] = useState('');

  // Parse current value
  const currentAddress = typeof value === 'object' && value !== null
    ? value as JusoResult
    : typeof value === 'string'
      ? { roadAddr: value, zipNo: '' }
      : null;

  // API configuration
  const apiUrl = spec.api_server as string | undefined;
  const confmKey = spec.confm_key as string | undefined;

  // Search addresses
  const handleSearch = useCallback(async () => {
    if (!searchTerm.trim()) return;

    setIsSearching(true);
    try {
      // Try Juso.go.kr API format first
      if (apiUrl && confmKey) {
        const url = `${apiUrl}?confmKey=${confmKey}&keyword=${encodeURIComponent(searchTerm)}&resultType=json`;
        const response = await fetch(url);
        const data = await response.json();
        const jusoList = data.results?.juso ?? [];
        setResults(jusoList);
        setShowResults(jusoList.length > 0);
      } else if (apiUrl) {
        // Generic API
        const url = apiUrl.includes('?')
          ? `${apiUrl}&q=${encodeURIComponent(searchTerm)}`
          : `${apiUrl}?q=${encodeURIComponent(searchTerm)}`;
        const response = await fetch(url);
        const data = await response.json();
        const items = Array.isArray(data) ? data : data.results ?? data.items ?? [];
        setResults(items);
        setShowResults(items.length > 0);
      }
    } catch (err) {
      console.error('Address search error:', err);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchTerm, apiUrl, confmKey]);

  // Handle keyboard search
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  }, [handleSearch]);

  // Select address
  const handleSelect = useCallback((result: JusoResult) => {
    const addressData = {
      ...result,
      detailAddr: detailAddr,
    };

    if (spec.store_object) {
      onChange(addressData as unknown as FormValue);
    } else {
      // Store formatted full address
      const fullAddr = detailAddr
        ? `${result.roadAddr} ${detailAddr}`
        : result.roadAddr;
      onChange(fullAddr);
    }

    setShowResults(false);
    setSearchTerm('');
    setDetailAddr('');
  }, [onChange, spec.store_object, detailAddr]);

  // Clear selection
  const handleClear = useCallback(() => {
    onChange(null);
    setSearchTerm('');
    setDetailAddr('');
  }, [onChange]);

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotation(path);

  return (
    <div className={`form-juso ${error ? 'is-invalid' : ''}`}>
      {/* Prepend */}
      {spec.prepend && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.prepend }}
        />
      )}

      {/* Current address display */}
      {currentAddress && currentAddress.roadAddr && (
        <div className="form-juso-current d-flex justify-content-between align-items-start p-2 bg-light rounded mb-2">
          <div>
            {currentAddress.zipNo && (
              <span className="badge bg-secondary me-2">[{currentAddress.zipNo}]</span>
            )}
            <span>{currentAddress.roadAddr}</span>
            {currentAddress.detailAddr && (
              <span className="ms-1">{currentAddress.detailAddr}</span>
            )}
          </div>
          {!disabled && !readonly && (
            <button
              type="button"
              className="btn-close"
              onClick={handleClear}
              aria-label={t('remove')}
            />
          )}
        </div>
      )}

      {/* Search input */}
      {!currentAddress && !disabled && !readonly && (
        <div className="input-group">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="valid-target form-control"
            placeholder={spec.placeholder ? t(spec.placeholder) : t('search_address')}
          />
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={handleSearch}
            disabled={isSearching || !searchTerm.trim()}
          >
            {isSearching ? (
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            ) : (
              t('search') || 'Search'
            )}
          </button>
        </div>
      )}

      {/* Hidden input for form */}
      <input
        type="hidden"
        name={bracketName}
        value={currentAddress?.roadAddr ?? ''}
        onBlur={onBlur}
        {...getLimepieDataAttributes(spec, path, language)}
      />

      {/* Search results */}
      {showResults && results.length > 0 && (
        <div className="form-juso-results mt-2 border rounded">
          {results.map((result, index) => (
            <div
              key={`${result.roadAddr}-${index}`}
              className="form-juso-result p-2 border-bottom"
            >
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <div className="badge bg-secondary mb-1">[{result.zipNo}]</div>
                  <div className="fw-bold">{result.roadAddr}</div>
                  {result.jibunAddr && (
                    <div className="text-muted small">{result.jibunAddr}</div>
                  )}
                </div>
                <div className="d-flex gap-2">
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder={t('detail_address') || 'Detail address'}
                    value={detailAddr}
                    onChange={(e) => setDetailAddr(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: '150px' }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => handleSelect(result)}
                  >
                    {t('select') || 'Select'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Append */}
      {spec.append && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.append }}
        />
      )}
    </div>
  );
}

export default JusoField;
