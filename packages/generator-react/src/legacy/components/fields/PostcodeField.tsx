/**
 * PostcodeField Component
 *
 * Postcode/ZIP code input with lookup support
 */

import React, { useCallback, useState, type ChangeEvent } from 'react';
import type { FieldComponentProps, FormValue } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation, getInputClasses } from '../../utils/dataAttributes';

interface PostcodeResult {
  postcode: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  [key: string]: unknown;
}

/**
 * PostcodeField component
 */
export function PostcodeField({
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
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PostcodeResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  // API configuration
  const apiUrl = spec.api_server as string | undefined;
  const targetFields = spec.target_fields as Record<string, string> | undefined;

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Search postcode
  const handleSearch = useCallback(async () => {
    if (!apiUrl || !value) return;

    setIsSearching(true);
    try {
      const url = apiUrl.includes('?')
        ? `${apiUrl}&postcode=${encodeURIComponent(value as string)}`
        : `${apiUrl}?postcode=${encodeURIComponent(value as string)}`;

      const response = await fetch(url);
      const data = await response.json();
      const results = Array.isArray(data) ? data : data.results ?? data.items ?? [];
      setSearchResults(results);
      setShowResults(results.length > 0);
    } catch (err) {
      console.error('Postcode search error:', err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [apiUrl, value]);

  // Select result
  const handleSelect = useCallback((result: PostcodeResult) => {
    onChange(result.postcode);
    setShowResults(false);

    // Fill target fields if configured
    if (targetFields) {
      // This would need to be handled by parent form context
      // Dispatch custom event with target field data
      const event = new CustomEvent('postcode:select', {
        detail: { result, targetFields },
        bubbles: true,
      });
      document.dispatchEvent(event);
    }
  }, [onChange, targetFields]);

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotation(path);

  return (
    <div className="form-postcode position-relative">
      <div className="input-group">
        {/* Prepend */}
        {spec.prepend && (
          <span
            className="input-group-text"
            dangerouslySetInnerHTML={{ __html: spec.prepend }}
          />
        )}

        <input
          type="text"
          name={bracketName}
          value={(value as string) ?? ''}
          onChange={handleChange}
          onBlur={onBlur}
          disabled={disabled}
          readOnly={readonly}
          className={getInputClasses('', spec, !!error)}
          placeholder={spec.placeholder ? t(spec.placeholder) : undefined}
          maxLength={spec.maxlength as number | undefined}
          autoFocus={spec.autofocus === true}
          {...getLimepieDataAttributes(spec, path, language)}
        />

        {/* Search button */}
        {apiUrl && !disabled && !readonly && (
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={handleSearch}
            disabled={isSearching || !value}
          >
            {isSearching ? (
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            ) : (
              t('search') || 'Search'
            )}
          </button>
        )}

        {/* Append */}
        {spec.append && (
          <span
            className="input-group-text"
            dangerouslySetInnerHTML={{ __html: spec.append }}
          />
        )}
      </div>

      {/* Search results */}
      {showResults && searchResults.length > 0 && (
        <ul className="dropdown-menu show w-100" role="listbox" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 1000 }}>
          {searchResults.map((result, index) => (
            <li key={result.postcode || index}>
              <button
                type="button"
                className="dropdown-item"
                onClick={() => handleSelect(result)}
                role="option"
              >
                <span className="fw-bold me-2">{result.postcode}</span>
                {result.address && (
                  <span className="text-muted">{result.address}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PostcodeField;
