/**
 * SearchField Component
 *
 * Autocomplete search field with API support
 */

import React, { useCallback, useState, useRef, useEffect, type ChangeEvent, type KeyboardEvent } from 'react';
import type { FieldComponentProps, FormValue } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { useFormContext } from '../../context/FormContext';
import { getLimepieDataAttributes, toBracketNotationWithPrefix, getInputClasses } from '../../utils/dataAttributes';

interface SearchResult {
  value: string;
  label: string;
  [key: string]: unknown;
}

/**
 * SearchField component
 */
export function SearchField({
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
  const { keyPrefix } = useFormContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Get display value for current selection
  const displayValue = typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>).label as string || ''
    : (value as string) ?? '';

  // API configuration from spec
  const apiUrl = spec.api_server as string | undefined;
  const minChars = (spec.min_chars as number) ?? 2;
  const debounceMs = (spec.debounce as number) ?? 300;
  const valueField = (spec.value_field as string) ?? 'value';
  const labelField = (spec.label_field as string) ?? 'label';

  // Search function
  const search = useCallback(async (term: string) => {
    if (!apiUrl || term.length < minChars) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const url = apiUrl.includes('?')
        ? `${apiUrl}&q=${encodeURIComponent(term)}`
        : `${apiUrl}?q=${encodeURIComponent(term)}`;

      const response = await fetch(url);
      const data = await response.json();

      // Handle various response formats
      const items = Array.isArray(data) ? data : data.results ?? data.items ?? [];
      const mapped = items.map((item: Record<string, unknown>) => ({
        value: item[valueField] as string,
        label: item[labelField] as string,
        ...item,
      }));

      setResults(mapped);
      setIsOpen(mapped.length > 0);
      setHighlightIndex(-1);
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, minChars, valueField, labelField]);

  // Debounced search
  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const term = e.target.value;
      setSearchTerm(term);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        search(term);
      }, debounceMs);
    },
    [search, debounceMs]
  );

  // Handle selection
  const handleSelect = useCallback((result: SearchResult) => {
    setSearchTerm(result.label);
    setIsOpen(false);
    setResults([]);

    // Store full object or just value depending on spec
    if (spec.store_object) {
      onChange(result as unknown as FormValue);
    } else {
      onChange(result.value);
    }
  }, [onChange, spec.store_object]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && results[highlightIndex]) {
          handleSelect(results[highlightIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  }, [isOpen, results, highlightIndex, handleSelect]);

  // Clear on escape
  const handleClear = useCallback(() => {
    setSearchTerm('');
    setResults([]);
    setIsOpen(false);
    onChange(null);
    inputRef.current?.focus();
  }, [onChange]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Set initial display value
  useEffect(() => {
    setSearchTerm(displayValue);
  }, [displayValue]);

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  return (
    <div className="position-relative">
      <div className="input-group">
        {/* Prepend */}
        {spec.prepend && (
          <span
            className="input-group-text"
            dangerouslySetInnerHTML={{ __html: spec.prepend }}
          />
        )}

        <input
          ref={inputRef}
          type="text"
          name={bracketName}
          value={searchTerm}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onBlur={() => {
            // Delay to allow click on results
            setTimeout(() => {
              setIsOpen(false);
              onBlur();
            }, 200);
          }}
          disabled={disabled}
          readOnly={readonly}
          className={getInputClasses('', spec, !!error)}
          placeholder={spec.placeholder ? t(spec.placeholder) : undefined}
          autoComplete="off"
          autoFocus={spec.autofocus === true}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          {...getLimepieDataAttributes(spec, path, language)}
        />

        {/* Loading indicator */}
        {isLoading && (
          <span className="input-group-text">
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
          </span>
        )}

        {/* Clear button */}
        {searchTerm && !disabled && !readonly && (
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={handleClear}
            aria-label={t('remove')}
            tabIndex={-1}
          >
            &times;
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

      {/* Results dropdown */}
      {isOpen && results.length > 0 && (
        <ul
          ref={listRef}
          className="dropdown-menu show w-100"
          role="listbox"
          style={{ position: 'absolute', top: '100%', left: 0, zIndex: 1000 }}
        >
          {results.map((result, index) => (
            <li key={result.value}>
              <button
                type="button"
                className={`dropdown-item ${index === highlightIndex ? 'active' : ''}`}
                onClick={() => handleSelect(result)}
                role="option"
                aria-selected={index === highlightIndex}
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* No results message */}
      {isOpen && !isLoading && searchTerm.length >= minChars && results.length === 0 && (
        <div className="dropdown-menu show w-100" style={{ position: 'absolute', top: '100%', left: 0 }}>
          <span className="dropdown-item text-muted">
            {t('no_results') || 'No results found'}
          </span>
        </div>
      )}
    </div>
  );
}

export default SearchField;
